import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import type { CarrierPayload } from '@/services/carriers';
import { digitsOnly, getFirst, parseCsv, type ParsedCsvRow } from '@/lib/csvImport';
import { readTabularImportFile, TABULAR_IMPORT_ACCEPT } from '@/lib/tabularImport';
import {
  deriveDefaultMapping,
  loadSavedMapping,
  resolveMappedField,
  sanitizeMapping,
  saveMapping,
  upperPtBr,
  type ImportFieldMapping,
} from '@/lib/importMapping';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

type PreviewRow = {
  line: number;
  nome: string;
  documento: string | null;
  uf: string | null;
  cidade: string | null;
  errors: string[];
  payload: CarrierPayload | null;
};

type WizardStep = 0 | 1 | 2;

type TargetFieldKey =
  | 'nome'
  | 'codigo'
  | 'documento'
  | 'email'
  | 'telefone'
  | 'cep'
  | 'logradouro'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf';

type FieldMapping = ImportFieldMapping<TargetFieldKey>;

type DedupeKey = 'documento' | 'email';
type DedupeStrategy = 'none' | 'first' | 'last';

const MAPPING_STORAGE_KEY = 'revo:import_mapping:carriers:v1';

const TARGET_KEYS: TargetFieldKey[] = [
  'nome',
  'codigo',
  'documento',
  'email',
  'telefone',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
];

const TARGET_FIELDS: Array<{ key: TargetFieldKey; label: string; required?: boolean; group: 'empresa' | 'contato' | 'endereco' }> = [
  { key: 'nome', label: 'Nome / Razão social', required: true, group: 'empresa' },
  { key: 'codigo', label: 'Código', group: 'empresa' },
  { key: 'documento', label: 'Documento (CPF/CNPJ)', group: 'empresa' },
  { key: 'email', label: 'E-mail', group: 'contato' },
  { key: 'telefone', label: 'Telefone', group: 'contato' },
  { key: 'cep', label: 'CEP', group: 'endereco' },
  { key: 'logradouro', label: 'Logradouro / Endereço', group: 'endereco' },
  { key: 'numero', label: 'Número', group: 'endereco' },
  { key: 'complemento', label: 'Complemento', group: 'endereco' },
  { key: 'bairro', label: 'Bairro', group: 'endereco' },
  { key: 'cidade', label: 'Cidade', group: 'endereco' },
  { key: 'uf', label: 'UF', group: 'endereco' },
];

const FIELD_SYNONYMS: Record<TargetFieldKey, string[]> = {
  nome: ['nome', 'razao_social', 'name'],
  codigo: ['codigo', 'código'],
  documento: ['documento', 'cnpj', 'cpf', 'doc', 'cnpj_cpf'],
  email: ['email', 'e_mail'],
  telefone: ['telefone', 'fone', 'celular', 'whatsapp'],
  cep: ['cep', 'codigo_postal', 'postal_code', 'zip'],
  logradouro: ['logradouro', 'endereco', 'rua', 'address', 'address_line1', 'endereco_logradouro'],
  numero: ['numero', 'num', 'number', 'endereco_numero'],
  complemento: ['complemento', 'address_line2'],
  bairro: ['bairro', 'neighborhood'],
  cidade: ['cidade', 'municipio', 'city'],
  uf: ['uf', 'estado', 'state'],
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

  const [step, setStep] = useState<WizardStep>(0);
  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState<ParsedCsvRow[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [lastSummary, setLastSummary] = useState<{ ok: number; failed: number } | null>(null);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [rollingBack, setRollingBack] = useState(false);

  const parsed = useMemo(() => fileRows ?? parseCsv(text), [fileRows, text]);
  const sourceKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of parsed) Object.keys(r.raw).forEach((k) => s.add(k));
    return [...s].sort();
  }, [parsed]);

  const [mapping, setMapping] = useState<FieldMapping>(() =>
    deriveDefaultMapping({ targetKeys: TARGET_KEYS, sourceKeys: [], synonyms: FIELD_SYNONYMS }),
  );
  const [hasCustomMapping, setHasCustomMapping] = useState(false);
  const [dedupeKey, setDedupeKey] = useState<DedupeKey>('documento');
  const [dedupeStrategy, setDedupeStrategy] = useState<DedupeStrategy>('first');
  const [forceUppercase, setForceUppercase] = useState(false);
  const [previewSort, setPreviewSort] = useState<SortState<'line' | 'nome' | 'doc' | 'cidadeUf' | 'errors'>>({
    column: 'line',
    direction: 'asc',
  });

  const mappingColumns: TableColumnWidthDef[] = [
    { id: 'campo', defaultWidth: 260, minWidth: 180 },
    { id: 'coluna', defaultWidth: 340, minWidth: 220 },
    { id: 'obrigatorio', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths: mappingWidths, startResize: startMappingResize } = useTableColumnWidths({
    tableId: 'import:carriers:mapping',
    columns: mappingColumns,
  });

  const previewColumns: TableColumnWidthDef[] = [
    { id: 'line', defaultWidth: 90, minWidth: 80 },
    { id: 'nome', defaultWidth: 320, minWidth: 220 },
    { id: 'doc', defaultWidth: 190, minWidth: 170 },
    { id: 'cidadeUf', defaultWidth: 220, minWidth: 180 },
    { id: 'errors', defaultWidth: 520, minWidth: 260 },
  ];
  const { widths: previewWidths, startResize: startPreviewResize } = useTableColumnWidths({
    tableId: 'import:carriers:preview',
    columns: previewColumns,
  });

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setLastSummary(null);
    setCreatedIds([]);
    setRollingBack(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setMapping((current) => {
      if (hasCustomMapping) return sanitizeMapping(current, sourceKeys);
      const saved = loadSavedMapping<FieldMapping>(MAPPING_STORAGE_KEY, TARGET_KEYS);
      const derived = deriveDefaultMapping({ targetKeys: TARGET_KEYS, sourceKeys, synonyms: FIELD_SYNONYMS });
      return sanitizeMapping({ ...derived, ...(saved ?? {}) } as FieldMapping, sourceKeys);
    });
  }, [isOpen, sourceKeys, hasCustomMapping]);

  useEffect(() => {
    if (!isOpen) return;
    if (!hasCustomMapping) return;
    saveMapping(MAPPING_STORAGE_KEY, mapping);
  }, [isOpen, hasCustomMapping, mapping]);

  const resolveField = useCallback(
    (row: Record<string, string>, key: TargetFieldKey) => resolveMappedField({ row, key, mapping, synonyms: FIELD_SYNONYMS, getFirst }),
    [mapping],
  );

  const buildPreviewRow = useCallback((r: ParsedCsvRow): PreviewRow => {
    const row = r.raw;
    const errors: string[] = [];

    const maybeUpper = (v: string, k: TargetFieldKey) => {
      if (!forceUppercase) return v;
      if (k === 'email') return v;
      if (k === 'documento' || k === 'cep' || k === 'telefone') return v;
      return upperPtBr(v);
    };

    const nome = maybeUpper(resolveField(row, 'nome'), 'nome');
    const codigo = (() => {
      const v = resolveField(row, 'codigo');
      return v ? maybeUpper(v, 'codigo') : '';
    })();
    const documento = digitsOnly(resolveField(row, 'documento')) || null;
    const email = resolveField(row, 'email') || null;
    const telefone = digitsOnly(resolveField(row, 'telefone')) || null;

    const cep = digitsOnly(resolveField(row, 'cep')) || null;
    let uf = maybeUpper(resolveField(row, 'uf'), 'uf') || null;
    let cidade = maybeUpper(resolveField(row, 'cidade'), 'cidade') || null;
    let logradouro = maybeUpper(resolveField(row, 'logradouro'), 'logradouro') || null;
    let numero = maybeUpper(resolveField(row, 'numero'), 'numero') || null;
    const bairro = (() => {
      const v = resolveField(row, 'bairro');
      return v ? maybeUpper(v, 'bairro') : null;
    })();
    const complemento = (() => {
      const v = resolveField(row, 'complemento');
      return v ? maybeUpper(v, 'complemento') : null;
    })();

    // Heurísticas úteis
    if ((!uf || !cidade) && cidade && cidade.includes('/')) {
      const parts = cidade.split('/').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        cidade = (parts[0] ?? cidade) || null;
        uf = (parts[1] ?? uf) || null;
      }
    }
    if (!numero && logradouro) {
      const m = logradouro.match(/(?:,|\s)\s*(\d{1,6})\s*$/);
      if (m?.[1]) {
        numero = m[1];
        logradouro = logradouro.replace(m[0], '').trim() || null;
      }
    }

    if (!nome) errors.push('nome é obrigatório');
    if (documento && documento.length !== 11 && documento.length !== 14) errors.push('documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos');

    const tipo_pessoa: CarrierPayload['tipo_pessoa'] = documento?.length === 11 ? 'pf' : documento?.length === 14 ? 'pj' : 'nao_definido';

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
            cep,
            uf,
            cidade,
            logradouro,
            numero,
            complemento,
            bairro,
            pais: 'Brasil',
            ativo: true,
            modal_principal: 'rodoviario',
            frete_tipo_padrao: 'nao_definido',
            isento_ie: false,
            exige_agendamento: false,
            padrao_para_frete: false,
          };

    return { line: r.line, nome, documento, uf, cidade, errors, payload };
  }, [forceUppercase, resolveField]);

  const { preview, duplicateKeys } = useMemo(() => {
    const base = parsed.map(buildPreviewRow);
    const keyFn = (r: PreviewRow) => {
      if (dedupeKey === 'documento') return r.documento ? `doc:${r.documento}` : '';
      const email = (r.payload as any)?.email ? String((r.payload as any).email).toLowerCase() : '';
      return email ? `email:${email}` : '';
    };

    const groups = new Map<string, PreviewRow[]>();
    for (const r of base) {
      const k = keyFn(r);
      if (!k) continue;
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    const duplicates = [...groups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([k, rows]) => ({ key: k, count: rows.length, lines: rows.map((r) => r.line) }));

    if (dedupeStrategy === 'none' || duplicates.length === 0) {
      return { preview: base, duplicateKeys: duplicates };
    }

    const pickIndex = dedupeStrategy === 'last' ? -1 : 0;
    const keepLine = new Map<number, boolean>();
    for (const r of base) keepLine.set(r.line, true);
    for (const [, rows] of groups) {
      if (rows.length <= 1) continue;
      const picked = pickIndex === -1 ? rows[rows.length - 1] : rows[0];
      for (const rr of rows) keepLine.set(rr.line, rr.line === picked.line);
    }
    return { preview: base.filter((r) => keepLine.get(r.line)), duplicateKeys: duplicates };
  }, [parsed, buildPreviewRow, dedupeKey, dedupeStrategy]);

  const totals = useMemo(() => {
    const total = preview.length;
    const valid = preview.filter((p) => p.errors.length === 0).length;
    return { total, valid, invalid: total - valid };
  }, [preview]);

  const previewSorted = useMemo(() => {
    return sortRows(
      preview,
      previewSort as any,
      [
        { id: 'line', type: 'number', getValue: (r: PreviewRow) => r.line ?? 0 },
        { id: 'nome', type: 'string', getValue: (r: PreviewRow) => r.nome ?? '' },
        { id: 'doc', type: 'string', getValue: (r: PreviewRow) => r.documento ?? '' },
        { id: 'cidadeUf', type: 'string', getValue: (r: PreviewRow) => `${r.cidade ?? ''} / ${r.uf ?? ''}` },
        { id: 'errors', type: 'string', getValue: (r: PreviewRow) => r.errors.join('; ') ?? '' },
      ] as const
    );
  }, [preview, previewSort]);

  const handlePickFile = async (file: File) => {
    const { text, rows } = await readTabularImportFile(file);
    setText(text);
    setFileRows(rows);
  };

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

  const canGoNextFromStep0 = parsed.length > 0;
  const canGoNextFromStep1 = !!mapping.nome;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar Transportadoras (CSV/XLSX)" size="4xl" bodyClassName="p-6 md:p-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className={`rounded-full px-2 py-1 ${step === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>1</span>
            <span className={step === 0 ? 'font-semibold text-gray-900' : ''}>Arquivo/CSV</span>
            <span className="text-gray-300">›</span>
            <span className={`rounded-full px-2 py-1 ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>2</span>
            <span className={step === 1 ? 'font-semibold text-gray-900' : ''}>Mapeamento</span>
            <span className="text-gray-300">›</span>
            <span className={`rounded-full px-2 py-1 ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>3</span>
            <span className={step === 2 ? 'font-semibold text-gray-900' : ''}>Prévia</span>
          </div>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((s) => (s - 1) as WizardStep)} disabled={isImporting}>
                Voltar
              </Button>
            ) : null}
            {step < 2 ? (
              <Button
                type="button"
                onClick={() => {
                  if (step === 0) {
                    if (!canGoNextFromStep0) {
                      addToast('Selecione um arquivo CSV/XLSX válido ou cole um CSV (com cabeçalho + linhas).', 'warning');
                      return;
                    }
                    setStep(1);
                    return;
                  }
                  if (!canGoNextFromStep1) {
                    addToast('Mapeie o campo obrigatório “Nome / Razão social”.', 'warning');
                    return;
                  }
                  setStep(2);
                }}
                disabled={isImporting}
              >
                Próximo
              </Button>
            ) : null}
          </div>
        </div>

        {step === 0 ? (
          <>
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
              placeholder={
                'nome;documento;email;telefone;cep;logradouro;numero;cidade;uf\nTransportadora X;12345678000199;contato@x.com.br;11999999999;01001000;Rua X;100;São Paulo;SP'
              }
              rows={12}
            />
          </>
        ) : null}

        {step === 1 ? (
          <div className="rounded-xl border border-gray-200 bg-white/70 p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-800">Mapeamento de campos</div>
                <div className="text-xs text-gray-600">Escolha quais colunas da planilha vão para cada campo do sistema.</div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={forceUppercase}
                  onChange={(e) => setForceUppercase(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                />
                Maiúsculo
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm text-gray-700">
                Dedupe
                <select
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                  value={dedupeKey}
                  onChange={(e) => setDedupeKey(e.target.value as DedupeKey)}
                >
                  <option value="documento">Documento</option>
                  <option value="email">E-mail</option>
                </select>
              </label>
              <label className="text-sm text-gray-700">
                Estratégia
                <select
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                  value={dedupeStrategy}
                  onChange={(e) => setDedupeStrategy(e.target.value as DedupeStrategy)}
                >
                  <option value="first">Manter primeiro</option>
                  <option value="last">Manter último</option>
                  <option value="none">Não deduplicar</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setHasCustomMapping(false);
                    const saved = loadSavedMapping<FieldMapping>(MAPPING_STORAGE_KEY, TARGET_KEYS);
                    const derived = deriveDefaultMapping({ targetKeys: TARGET_KEYS, sourceKeys, synonyms: FIELD_SYNONYMS });
                    setMapping(sanitizeMapping({ ...derived, ...(saved ?? {}) } as FieldMapping, sourceKeys));
                  }}
                >
                  Recalcular automático
                </Button>
              </div>
            </div>

            <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-sm table-fixed">
                <TableColGroup columns={mappingColumns} widths={mappingWidths} />
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <ResizableSortableTh columnId="campo" label="Campo" sortable={false} onResizeStart={startMappingResize} className="px-3 py-2" />
                    <ResizableSortableTh columnId="coluna" label="Coluna da planilha" sortable={false} onResizeStart={startMappingResize} className="px-3 py-2" />
                    <ResizableSortableTh columnId="obrigatorio" label="Obrigatório" sortable={false} onResizeStart={startMappingResize} className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {TARGET_FIELDS.map((f) => (
                    <tr key={f.key}>
                      <td className="px-3 py-2 text-gray-800">{f.label}</td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                          value={mapping[f.key] ?? ''}
                          onChange={(e) => {
                            setHasCustomMapping(true);
                            setMapping((prev) => ({ ...prev, [f.key]: e.target.value || null }));
                          }}
                        >
                          <option value="">—</option>
                          {sourceKeys.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{f.required ? 'Sim' : 'Não'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {duplicateKeys.length > 0 ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Detectamos {duplicateKeys.length} chave(s) repetida(s) no arquivo.
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-800">Pré-visualização</div>
                <div className="text-xs text-gray-600">
                  {totals.total} linha(s) · {totals.valid} válida(s) · {totals.invalid} com erro
                  {lastSummary ? ` · Última: ${lastSummary.ok} ok, ${lastSummary.failed} falharam` : ''}
                </div>
              </div>
              {preview.length === 0 ? (
                <div className="mt-2 text-sm text-gray-600">Volte e cole um CSV (ou envie um XLS/XLSX).</div>
              ) : (
                <div className="mt-3 max-h-[260px] overflow-auto rounded-lg border border-gray-200 bg-white">
                  <table className="min-w-full text-sm table-fixed">
                    <TableColGroup columns={previewColumns} widths={previewWidths} />
                    <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <ResizableSortableTh
                          columnId="line"
                          label="Linha"
                          sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize}
                          className="px-3 py-2"
                        />
                        <ResizableSortableTh
                          columnId="nome"
                          label="Nome"
                          sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize}
                          className="px-3 py-2"
                        />
                        <ResizableSortableTh
                          columnId="doc"
                          label="Doc"
                          sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize}
                          className="px-3 py-2"
                        />
                        <ResizableSortableTh
                          columnId="cidadeUf"
                          label="Cidade/UF"
                          sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize}
                          className="px-3 py-2"
                        />
                        <ResizableSortableTh
                          columnId="errors"
                          label="Erros"
                          sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize}
                          className="px-3 py-2"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewSorted.slice(0, 120).map((r) => (
                        <tr key={r.line} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.line}</td>
                          <td className="px-3 py-2">{r.nome || '—'}</td>
                          <td className="px-3 py-2">{r.documento || '—'}</td>
                          <td className="px-3 py-2">{(r.cidade || '—') + ' / ' + (r.uf || '—')}</td>
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
          </>
        ) : null}
      </div>
    </Modal>
  );
}
