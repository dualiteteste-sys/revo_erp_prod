import React, { useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import type { Service } from '@/services/services';
import { digitsOnly, getFirst, parseBoolPt, parseCsv, parseMoneyBr, type ParsedCsvRow } from '@/lib/csvImport';

type PreviewRow = {
  line: number;
  descricao: string;
  codigo: string | null;
  preco: number | null;
  status: Service['status'];
  nbs: string | null;
  errors: string[];
  payload: Partial<Service> | null;
};

export default function ImportServicesCsvModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported: (summary: { ok: number; failed: number }) => void;
  importFn: (payload: Partial<Service>) => Promise<any>;
  deleteFn?: (id: string) => Promise<void>;
}) {
  const { isOpen, onClose, onImported, importFn, deleteFn } = props;
  const { addToast } = useToast();

  const [text, setText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [lastSummary, setLastSummary] = useState<{ ok: number; failed: number } | null>(null);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [rollingBack, setRollingBack] = useState(false);

  const parsed = useMemo(() => parseCsv(text), [text]);
  const preview = useMemo<PreviewRow[]>(() => parsed.map(buildPreviewRow), [parsed]);
  const totals = useMemo(() => {
    const total = preview.length;
    const valid = preview.filter((p) => p.errors.length === 0).length;
    return { total, valid, invalid: total - valid };
  }, [preview]);

  const handlePickFile = async (file: File) => {
    const content = await file.text();
    setText(content);
  };

  function buildPreviewRow(r: ParsedCsvRow): PreviewRow {
    const row = r.raw;
    const errors: string[] = [];
    const descricao = getFirst(row, ['descricao', 'descrição', 'servico', 'serviço', 'name', 'nome']);
    const codigo = getFirst(row, ['codigo', 'código']) || null;
    const unidade = getFirst(row, ['unidade', 'un']) || null;
    const statusRaw = getFirst(row, ['status', 'situacao', 'situação', 'ativo', 'active']);
    const precoRaw = getFirst(row, ['preco_venda', 'preco', 'valor', 'price']);
    const codigo_servico = getFirst(row, ['codigo_servico', 'codigo_do_servico']) || null;
    const nbs = digitsOnly(getFirst(row, ['nbs'])) || null;
    const nbsReq = parseBoolPt(getFirst(row, ['nbs_ibpt_required', 'nbs_obrigatorio', 'ibpt_required']));

    if (!descricao) errors.push('descricao é obrigatória');
    const preco = parseMoneyBr(precoRaw);
    if (precoRaw && preco === null) errors.push('preço inválido');

    const status: Service['status'] =
      statusRaw.toLowerCase() === 'inativo' || statusRaw.toLowerCase() === 'false' || statusRaw === '0' ? 'inativo' : 'ativo';

    const payload: Partial<Service> | null =
      errors.length > 0
        ? null
        : {
            descricao: descricao.trim(),
            codigo,
            status,
            preco_venda: preco ?? 0,
            unidade,
            codigo_servico,
            nbs,
            nbs_ibpt_required: nbsReq ?? false,
          };

    return { line: r.line, descricao, codigo, preco, status, nbs, errors, payload };
  }

  const handleImport = async () => {
    if (preview.length === 0) {
      addToast('Cole um CSV válido (com cabeçalho + linhas).', 'warning');
      return;
    }

    setIsImporting(true);
    setLastSummary(null);
    setCreatedIds([]);
    let ok = 0;
    let failed = 0;
    const localCreated: string[] = [];

    try {
      for (const row of preview) {
        if (!row.payload) {
          failed += 1;
          continue;
        }
        try {
          const created = await importFn(row.payload);
          const id = created?.id ? String(created.id) : null;
          if (id) localCreated.push(id);
          ok += 1;
        } catch (e: any) {
          failed += 1;
          console.warn('[CSV_IMPORT][SERVICES] row failed', { line: row.line, error: e?.message || e });
        }
      }

      const summary = { ok, failed };
      setLastSummary(summary);
      setCreatedIds(localCreated);
      if (ok > 0) {
        addToast(`Importação concluída: ${ok} sucesso(s), ${failed} falha(s).`, 'success');
        onImported(summary);
      } else {
        addToast(`Nenhum item importado. ${failed} falha(s).`, 'warning');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleRollback = async () => {
    if (!deleteFn) return;
    if (createdIds.length === 0) return;
    setRollingBack(true);
    try {
      let ok = 0;
      let failed = 0;
      for (const id of [...createdIds].reverse()) {
        try {
          await deleteFn(id);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      setCreatedIds([]);
      if (ok > 0) addToast(`Rollback concluído: ${ok} removido(s).`, 'success');
      if (failed > 0) addToast(`${failed} falha(s) no rollback (pode haver vínculos).`, 'warning');
      onImported({ ok: 0, failed: 0 });
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Importar Serviços (CSV)"
      size="4xl"
      bodyClassName="p-6 md:p-8"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Campos comuns: <code>descricao</code>, <code>codigo</code>, <code>preco_venda</code>, <code>unidade</code>, <code>status</code>,{' '}
            <code>nbs</code>.
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer text-sm font-medium">
            <FileUp size={16} />
            Selecionar arquivo
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePickFile(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <TextArea
          label="CSV"
          name="csv"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'descricao;codigo;preco_venda;unidade;status;nbs\nMão de obra;SV-001;120,00;H;ativo;101010101'}
          rows={12}
        />

        <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800">Pré-visualização</div>
            <div className="text-xs text-gray-600">
              {totals.total} linha(s) · {totals.valid} válida(s) · {totals.invalid} com erro
              {lastSummary ? ` · Última: ${lastSummary.ok} ok, ${lastSummary.failed} falharam` : ''}
            </div>
          </div>
          {preview.length === 0 ? (
            <div className="mt-2 text-sm text-gray-600">Cole um CSV acima para ver a prévia.</div>
          ) : (
            <div className="mt-3 max-h-[260px] overflow-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Linha</th>
                    <th className="px-3 py-2 text-left">Descrição</th>
                    <th className="px-3 py-2 text-left">Código</th>
                    <th className="px-3 py-2 text-left">Preço</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Erros</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.slice(0, 80).map((r) => (
                    <tr key={r.line} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.line}</td>
                      <td className="px-3 py-2">{r.descricao || '—'}</td>
                      <td className="px-3 py-2">{r.codigo || '—'}</td>
                      <td className="px-3 py-2">{typeof r.preco === 'number' ? `R$ ${r.preco.toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2 text-rose-700">{r.errors.join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">Dica: corrija as linhas destacadas em vermelho antes de importar.</div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isImporting}>
              Cancelar
            </Button>
            {deleteFn && createdIds.length > 0 ? (
              <Button type="button" variant="outline" onClick={() => void handleRollback()} disabled={isImporting || rollingBack}>
                {rollingBack ? <Loader2 className="animate-spin" size={18} /> : null}
                <span className="ml-2">Desfazer importação</span>
              </Button>
            ) : null}
            <Button type="button" onClick={() => void handleImport()} disabled={isImporting || totals.valid === 0}>
              {isImporting ? <Loader2 className="animate-spin" size={18} /> : null}
              <span className="ml-2">Importar</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
