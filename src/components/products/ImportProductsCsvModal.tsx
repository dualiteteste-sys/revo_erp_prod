import React, { useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import { digitsOnly, getFirst, parseBoolPt, parseCsv, parseMoneyBr, type ParsedCsvRow } from '@/lib/csvImport';
import { readTabularImportFile, TABULAR_IMPORT_ACCEPT } from '@/lib/tabularImport';

type PreviewRow = {
  line: number;
  nome: string;
  sku: string;
  unidade: string;
  status: 'ativo' | 'inativo';
  preco: number | null;
  ncm: string | null;
  errors: string[];
  payload: any | null;
};

export default function ImportProductsCsvModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  importFn: (payload: any) => Promise<any>;
  deleteFn?: (id: string) => Promise<void>;
}) {
  const { isOpen, onClose, onImported, importFn, deleteFn } = props;
  const { addToast } = useToast();

  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState<ParsedCsvRow[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [lastSummary, setLastSummary] = useState<{ ok: number; failed: number } | null>(null);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [rollingBack, setRollingBack] = useState(false);

  const parsed = useMemo(() => fileRows ?? parseCsv(text), [fileRows, text]);
  const preview = useMemo<PreviewRow[]>(() => {
    const rows: PreviewRow[] = [];
    for (const r of parsed) {
      rows.push(buildPreviewRow(r));
    }
    return rows;
  }, [parsed]);

  const totals = useMemo(() => {
    const total = preview.length;
    const valid = preview.filter((p) => p.errors.length === 0).length;
    return { total, valid, invalid: total - valid };
  }, [preview]);

  const handlePickFile = async (file: File) => {
    const { text, rows } = await readTabularImportFile(file);
    setText(text);
    setFileRows(rows);
  };

  function buildPreviewRow(r: ParsedCsvRow): PreviewRow {
    const row = r.raw;
    const errors: string[] = [];

    const nome = getFirst(row, ['nome', 'descricao', 'produto', 'name']);
    const sku = String(getFirst(row, ['sku', 'codigo', 'codigo_interno', 'code']) || '').trim();
    const unidade = String(getFirst(row, ['unidade', 'un', 'unidade_sigla', 'unit']) || 'un').trim() || 'un';
    const statusRaw = getFirst(row, ['status', 'ativo', 'active']);
    const precoRaw = getFirst(row, ['preco_venda', 'preco', 'valor', 'price']);
    const ncm = digitsOnly(getFirst(row, ['ncm'])) || null;

    if (!nome) errors.push('nome é obrigatório');
    if (!sku) errors.push('sku é obrigatório');

    const preco = parseMoneyBr(precoRaw);
    if (precoRaw && preco === null) errors.push('preço inválido');

    if (ncm && ncm.length !== 8) errors.push('ncm deve ter 8 dígitos');

    const statusStr = String(statusRaw || '').toLowerCase();
    const status = statusStr === 'inativo' || statusStr === 'false' || statusStr === '0' ? 'inativo' : 'ativo';

    const controla_estoque = parseBoolPt(getFirst(row, ['controla_estoque', 'estoque', 'stock']));
    const pode_comprar = parseBoolPt(getFirst(row, ['pode_comprar', 'compravel']));
    const pode_vender = parseBoolPt(getFirst(row, ['pode_vender', 'vendavel']));

    const payload =
      errors.length > 0
        ? null
        : {
            tipo: 'simples',
            nome,
            sku,
            unidade,
            status,
            preco_venda: preco ?? 0,
            moeda: 'BRL',
            ncm,
            controla_estoque: controla_estoque ?? true,
            permitir_inclusao_vendas: true,
            pode_comprar: pode_comprar ?? true,
            pode_vender: pode_vender ?? true,
          };

    return { line: r.line, nome, sku, unidade, status, preco, ncm, errors, payload };
  }

  const handleImport = async () => {
    if (preview.length === 0) {
      addToast('Selecione um arquivo CSV/XLSX válido ou cole um CSV (com cabeçalho + linhas).', 'warning');
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
          // não interrompe importação inteira; mostra resumo no final
          console.warn('[CSV_IMPORT][PRODUCTS] row failed', { line: row.line, error: e?.message || e });
        }
      }

      setLastSummary({ ok, failed });
      setCreatedIds(localCreated);
      if (ok > 0) {
        addToast(`Importação concluída: ${ok} sucesso(s), ${failed} falha(s).`, 'success');
        onImported();
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
      // Reverse order to reduce FK surprises.
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
      onImported();
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Importar Produtos (CSV/XLSX)"
      size="4xl"
      bodyClassName="p-6 md:p-8"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Formato esperado (cabeçalho + linhas). Campos comuns: <code>nome</code>, <code>sku</code>, <code>unidade</code>, <code>preco_venda</code>,{' '}
            <code>status</code>, <code>ncm</code>.
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer text-sm font-medium">
            <FileUp size={16} />
            Selecionar arquivo
            <input
              type="file"
              accept={TABULAR_IMPORT_ACCEPT}
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
          label="CSV (ou XLS/XLSX via upload)"
          name="csv"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileRows(null);
          }}
          placeholder={'nome;sku;unidade;preco_venda;status;ncm\nProduto A;SKU-001;un;10,50;ativo;12345678'}
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
            <div className="mt-2 text-sm text-gray-600">Cole um CSV acima para ver a prévia (ou envie um XLS/XLSX).</div>
          ) : (
            <div className="mt-3 max-h-[260px] overflow-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Linha</th>
                    <th className="px-3 py-2 text-left">Nome</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Preço</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Erros</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.slice(0, 80).map((r) => (
                    <tr key={r.line} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.line}</td>
                      <td className="px-3 py-2">{r.nome || '—'}</td>
                      <td className="px-3 py-2">{r.sku || '—'}</td>
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
          <div className="text-xs text-gray-500">
            Dica: corrija as linhas destacadas em vermelho antes de importar.
          </div>
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
