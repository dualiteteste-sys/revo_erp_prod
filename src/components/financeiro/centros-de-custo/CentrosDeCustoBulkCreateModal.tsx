import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { listAllCentrosDeCusto, saveCentroDeCusto, type CentroDeCustoListItem, type TipoCentroCusto } from '@/services/centrosDeCusto';
import { useToast } from '@/contexts/ToastProvider';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type Strategy = 'skip_existing' | 'upsert_existing';

type ParsedNode = {
  line: number;
  raw: string;
  codigo: string;
  nome: string;
  depth: number;
  parentCodigo: string | null;
  isRootHeader: boolean;
  errors: string[];
};

const ROOT_TIPO_BY_CODE: Record<string, TipoCentroCusto> = {
  '1': 'receita',
  '2': 'custo_variavel',
  '3': 'custo_fixo',
  '4': 'investimento',
};

function parseOutline(text: string): ParsedNode[] {
  const lines = text.split(/\r?\n/);
  const out: ParsedNode[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const errors: string[] = [];
    const m = trimmed.match(/^(\d+(?:\.\d+)*)(?:\.)?\s+(.*)$/);
    if (!m) {
      out.push({ line: i + 1, raw, codigo: '', nome: '', depth: 0, parentCodigo: null, isRootHeader: false, errors: ['Linha inválida (esperado: "1.01 Nome")'] });
      continue;
    }

    const codigo = m[1];
    let nome = m[2].trim();
    nome = nome.replace(/\s*\([^)]*\)\s*$/u, '').trim();
    if (!nome) errors.push('Nome vazio');

    const parts = codigo.split('.').filter(Boolean);
    const depth = parts.length;
    const rootCode = parts[0];
    if (!ROOT_TIPO_BY_CODE[rootCode]) errors.push('Código raiz inválido (esperado 1/2/3/4)');

    const isRootHeader = depth === 1 && ['1', '2', '3', '4'].includes(codigo) && /receit|custo|invest/i.test(nome.toLowerCase());
    const parentCodigo = depth <= 1 ? null : parts.slice(0, -1).join('.');

    out.push({ line: i + 1, raw, codigo, nome, depth, parentCodigo, isRootHeader, errors });
  }

  const seen = new Map<string, number>();
  for (const r of out) {
    if (!r.codigo) continue;
    if (r.isRootHeader) continue;
    const prev = seen.get(r.codigo);
    if (prev) r.errors.push(`Código duplicado (já aparece na linha ${prev})`);
    else seen.set(r.codigo, r.line);
  }

  for (const r of out) {
    if (r.isRootHeader) continue;
    if (!r.codigo) continue;
    if (r.depth <= 1) {
      r.errors.push('Não crie raízes manualmente (use os 4 grupos padrão)');
      continue;
    }
    if (!r.parentCodigo) {
      r.errors.push('Parent inválido');
      continue;
    }
    if (['1', '2', '3', '4'].includes(r.parentCodigo)) continue;
  }

  return out;
}

function byCodigo(rows: CentroDeCustoListItem[]): Map<string, CentroDeCustoListItem> {
  const m = new Map<string, CentroDeCustoListItem>();
  for (const r of rows) {
    const c = String(r.codigo ?? '').trim();
    if (!c) continue;
    m.set(c, r);
  }
  return m;
}

export default function CentrosDeCustoBulkCreateModal({ isOpen, onClose, onCreated }: Props) {
  const { addToast } = useToast();
  const [text, setText] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('skip_existing');
  const [isApplying, setIsApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastResult, setLastResult] = useState<{ created: number; updated: number; skipped: number; failed: number } | null>(null);

  const parsed = useMemo(() => parseOutline(text), [text]);
  const actionable = useMemo(() => parsed.filter((p) => !p.isRootHeader && p.codigo && p.depth > 1), [parsed]);
  const invalid = useMemo(() => actionable.filter((p) => p.errors.length > 0), [actionable]);
  const canApply = actionable.length > 0 && invalid.length === 0 && !isApplying;

  const handleApply = async () => {
    setIsApplying(true);
    setLastResult(null);
    setProgress({ done: 0, total: actionable.length });
    try {
      const existing = await listAllCentrosDeCusto({ status: null });
      const map = byCodigo(existing);

      const roots = ['1', '2', '3', '4'].map((c) => map.get(c)).filter(Boolean) as CentroDeCustoListItem[];
      if (roots.length !== 4) {
        throw new Error('Não foi possível identificar as 4 raízes padrão (1/2/3/4).');
      }

      const sorted = [...actionable].sort((a, b) => a.depth - b.depth || a.codigo.localeCompare(b.codigo));
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;

      for (const node of sorted) {
        setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));

        const parentCodigo = node.parentCodigo!;
        const parent = map.get(parentCodigo);
        if (!parent) {
          failed += 1;
          continue;
        }

        const existingRow = map.get(node.codigo);
        if (existingRow && strategy === 'skip_existing') {
          skipped += 1;
          continue;
        }

        try {
          const saved = await saveCentroDeCusto({
            id: existingRow?.id,
            parent_id: parent.id,
            codigo: node.codigo,
            nome: node.nome,
            ativo: true,
            ordem: 0,
          });
          map.set(node.codigo, {
            id: saved.id,
            parent_id: saved.parent_id ?? null,
            codigo: saved.codigo ?? node.codigo,
            nome: saved.nome,
            tipo: saved.tipo,
            nivel: saved.nivel,
            ordem: saved.ordem,
            ativo: saved.ativo,
            observacoes: saved.observacoes ?? null,
            total_count: 0,
          });
          if (existingRow) updated += 1;
          else created += 1;
        } catch {
          failed += 1;
        }
      }

      setLastResult({ created, updated, skipped, failed });
      addToast('Processamento concluído.', failed ? 'warning' : 'success');
      onCreated();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao criar em lote.', 'error');
    } finally {
      setIsApplying(false);
      setProgress(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Criar Centros de Custo em lote"
      size="5xl"
      bodyClassName="p-6 md:p-8"
    >
      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Cole a hierarquia (código + nome)</div>
              <div className="text-xs text-gray-500">Ex: `1.01 Mensalidades` / `1.01.01 Essencial`</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Estratégia</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as Strategy)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs"
                disabled={isApplying}
              >
                <option value="skip_existing">Pular códigos existentes</option>
                <option value="upsert_existing">Atualizar se existir</option>
              </select>
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-3 h-56 w-full rounded-lg border border-gray-300 bg-white p-3 font-mono text-xs"
            placeholder={`1. RECEITAS (tipo = receita)\n1.01 Mensalidades / Assinaturas\n1.01.01 Essencial\n...\n2. CUSTOS VARIÁVEIS\n2.01 Infra/terceiros\n...`}
            disabled={isApplying}
          />

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-gray-600">
              {actionable.length} linhas detectadas • {invalid.length ? `${invalid.length} com erro` : 'sem erros'}
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isApplying ? <Loader2 className="animate-spin" size={18} /> : null}
              Criar / Atualizar
            </button>
          </div>

          {progress ? <div className="mt-2 text-xs text-gray-500">{progress.done}/{progress.total} processados...</div> : null}
          {lastResult ? (
            <div className="mt-2 text-xs text-gray-700">
              Resultado: {lastResult.created} criados, {lastResult.updated} atualizados, {lastResult.skipped} ignorados, {lastResult.failed} falharam.
            </div>
          ) : null}
        </div>

        {invalid.length ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="text-sm font-semibold text-red-900">Corrija antes de executar</div>
            <ul className="mt-2 list-disc pl-5 text-xs text-red-800">
              {invalid.slice(0, 12).map((r) => (
                <li key={`${r.line}-${r.codigo || r.raw}`}>
                  Linha {r.line}: {r.raw.trim()} — {r.errors.join('; ')}
                </li>
              ))}
              {invalid.length > 12 ? <li>... +{invalid.length - 12} linhas</li> : null}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
