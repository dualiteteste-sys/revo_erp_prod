import React, { useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import type { CarrierPayload } from '@/services/carriers';
import { digitsOnly, getFirst, parseCsv, type ParsedCsvRow } from '@/lib/csvImport';
import { readTabularImportFile, TABULAR_IMPORT_ACCEPT } from '@/lib/tabularImport';

type PreviewRow = {
  line: number;
  nome: string;
  documento: string | null;
  uf: string | null;
  cidade: string | null;
  errors: string[];
  payload: CarrierPayload | null;
};

export default function ImportCarriersCsvModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported: (summary: { ok: number; failed: number }) => void;
  importFn: (payload: CarrierPayload) => Promise<any>;
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
  const preview = useMemo<PreviewRow[]>(() => parsed.map(buildPreviewRow), [parsed]);
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
    const nome = getFirst(row, ['nome', 'razao_social', 'name']);
    const codigo = getFirst(row, ['codigo', 'código']);
    const documento = digitsOnly(getFirst(row, ['documento', 'cnpj', 'cpf'])) || null;
    const email = getFirst(row, ['email', 'e_mail']);
    const telefone = digitsOnly(getFirst(row, ['telefone', 'fone', 'celular', 'whatsapp']));
    const cep = digitsOnly(getFirst(row, ['cep']));
    const uf = getFirst(row, ['uf', 'estado']) || null;
    const cidade = getFirst(row, ['cidade', 'municipio']) || null;
    const logradouro = getFirst(row, ['logradouro', 'endereco', 'rua']);
    const numero = getFirst(row, ['numero', 'num']);
    const bairro = getFirst(row, ['bairro']);

    if (!nome) errors.push('nome é obrigatório');
    if (documento && documento.length !== 11 && documento.length !== 14) errors.push('documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos');

    const tipo_pessoa: CarrierPayload['tipo_pessoa'] = documento?.length === 11 ? 'pf' : 'pj';

    const payload: CarrierPayload | null =
      errors.length > 0
        ? null
        : {
            nome: nome.trim(),
            codigo: codigo || null,
            tipo_pessoa,
            documento: documento || null,
            email: email || null,
            telefone: telefone || null,
            cep: cep || null,
            uf,
            cidade,
            logradouro: logradouro || null,
            numero: numero || null,
            bairro: bairro || null,
            pais: 'Brasil',
            ativo: true,
            modal_principal: 'rodoviario',
            frete_tipo_padrao: 'nao_definido',
            isento_ie: false,
            exige_agendamento: false,
            padrao_para_frete: false,
          };

    return { line: r.line, nome, documento, uf, cidade, errors, payload };
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
          console.warn('[CSV_IMPORT][CARRIERS] row failed', { line: row.line, error: e?.message || e });
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
      title="Importar Transportadoras (CSV/XLSX)"
      size="4xl"
      bodyClassName="p-6 md:p-8"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Campos comuns: <code>nome</code>, <code>documento</code>, <code>email</code>, <code>telefone</code>, <code>cep</code>, <code>logradouro</code>,{' '}
            <code>numero</code>, <code>cidade</code>, <code>uf</code>.
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
          placeholder={'nome;documento;email;telefone;cep;logradouro;numero;cidade;uf\nTransportadora X;12345678000199;contato@x.com.br;11999999999;01001000;Rua X;100;São Paulo;SP'}
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
                    <th className="px-3 py-2 text-left">Doc</th>
                    <th className="px-3 py-2 text-left">Cidade/UF</th>
                    <th className="px-3 py-2 text-left">Erros</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.slice(0, 80).map((r) => (
                    <tr key={r.line} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.line}</td>
                      <td className="px-3 py-2">{r.nome || '—'}</td>
                      <td className="px-3 py-2">{r.documento || '—'}</td>
                      <td className="px-3 py-2">
                        {(r.cidade || '—') + ' / ' + (r.uf || '—')}
                      </td>
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
