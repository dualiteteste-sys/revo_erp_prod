import React, { useEffect, useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import type { ColaboradorPayload, Cargo } from '@/services/rh';
import { listCargos, saveCargo } from '@/services/rh';
import { digitsOnly, getFirst, parseBoolPt, parseCsv, type ParsedCsvRow } from '@/lib/csvImport';
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
  cargo_nome: string | null;
  cargo_id: string | null;
  status: string;
  errors: string[];
  payload: ColaboradorPayload | null;
};

type WizardStep = 0 | 1 | 2;

type TargetFieldKey = 'nome' | 'email' | 'documento' | 'telefone' | 'matricula' | 'data_admissao' | 'cargo_nome' | 'status' | 'observacoes';
type FieldMapping = ImportFieldMapping<TargetFieldKey>;

type DedupeKey = 'documento' | 'matricula' | 'nome';
type DedupeStrategy = 'none' | 'first' | 'last';

const MAPPING_STORAGE_KEY = 'revo:import_mapping:colaboradores:v1';

const TARGET_KEYS: TargetFieldKey[] = ['nome', 'email', 'documento', 'telefone', 'matricula', 'data_admissao', 'cargo_nome', 'status', 'observacoes'];

const TARGET_FIELDS: Array<{ key: TargetFieldKey; label: string; required?: boolean }> = [
  { key: 'nome', label: 'Nome', required: true },
  { key: 'email', label: 'Email' },
  { key: 'documento', label: 'CPF / Documento' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'matricula', label: 'Matrícula' },
  { key: 'data_admissao', label: 'Data de Admissão' },
  { key: 'cargo_nome', label: 'Cargo' },
  { key: 'status', label: 'Status (ativo/afastado/desligado)' },
  { key: 'observacoes', label: 'Observações' },
];

const FIELD_SYNONYMS: Record<TargetFieldKey, string[]> = {
  nome: ['nome', 'colaborador', 'funcionario', 'funcionário', 'name', 'employee'],
  email: ['email', 'e_mail', 'e-mail', 'correio'],
  documento: ['documento', 'cpf', 'doc', 'rg'],
  telefone: ['telefone', 'tel', 'phone', 'celular', 'fone'],
  matricula: ['matricula', 'matrícula', 'registro', 'codigo', 'código'],
  data_admissao: ['data_admissao', 'admissao', 'admissão', 'data_contratacao', 'contratacao', 'hire_date'],
  cargo_nome: ['cargo', 'cargo_nome', 'funcao', 'função', 'position', 'job_title'],
  status: ['status', 'situacao', 'situação', 'ativo'],
  observacoes: ['observacoes', 'observações', 'obs', 'notas', 'notes'],
};

const VALID_STATUSES = ['ativo', 'afastado', 'ferias', 'licenca', 'desligado'] as const;

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // YYYY-MM-DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) {
    const d = new Date(trimmed.replace(/\//g, '-'));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const m = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  return null;
}

function resolveStatus(raw: string): string {
  if (!raw) return 'ativo';
  const lower = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Map common values
  if (lower === 'inativo' || lower === 'desligado' || lower === 'false' || lower === '0' || lower === 'nao' || lower === 'não') return 'desligado';
  if (lower === 'afastado') return 'afastado';
  if (lower === 'ferias' || lower === 'férias') return 'ferias';
  if (lower === 'licenca' || lower === 'licença') return 'licenca';
  if (lower === 'ativo' || lower === 'sim' || lower === 'true' || lower === '1') return 'ativo';

  // Direct match
  if ((VALID_STATUSES as readonly string[]).includes(lower)) return lower;

  return 'ativo';
}

export default function ImportColaboradoresCsvModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported: (summary: { ok: number; failed: number }) => void;
  importFn: (payload: ColaboradorPayload) => Promise<any>;
  autoCreateCargo?: boolean;
}) {
  const { isOpen, onClose, onImported, importFn, autoCreateCargo = true } = props;
  const { addToast } = useToast();

  const [step, setStep] = useState<WizardStep>(0);
  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState<ParsedCsvRow[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [lastSummary, setLastSummary] = useState<{ ok: number; failed: number } | null>(null);
  const [cargosCache, setCargosCache] = useState<Cargo[]>([]);

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
  const [previewSort, setPreviewSort] = useState<SortState<'line' | 'nome' | 'documento' | 'cargo_nome' | 'status' | 'errors'>>({
    column: 'line',
    direction: 'asc',
  });

  const mappingColumns: TableColumnWidthDef[] = [
    { id: 'campo', defaultWidth: 260, minWidth: 180 },
    { id: 'coluna', defaultWidth: 340, minWidth: 220 },
    { id: 'obrigatorio', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths: mappingWidths, startResize: startMappingResize } = useTableColumnWidths({
    tableId: 'import:colaboradores:mapping',
    columns: mappingColumns,
  });

  const previewColumns: TableColumnWidthDef[] = [
    { id: 'line', defaultWidth: 80, minWidth: 70 },
    { id: 'nome', defaultWidth: 260, minWidth: 180 },
    { id: 'documento', defaultWidth: 160, minWidth: 120 },
    { id: 'cargo_nome', defaultWidth: 200, minWidth: 140 },
    { id: 'status', defaultWidth: 120, minWidth: 100 },
    { id: 'errors', defaultWidth: 420, minWidth: 240 },
  ];
  const { widths: previewWidths, startResize: startPreviewResize } = useTableColumnWidths({
    tableId: 'import:colaboradores:preview',
    columns: previewColumns,
  });

  // Load cargos for cargo_nome → cargo_id resolution
  useEffect(() => {
    if (!isOpen) return;
    void listCargos('', false).then(setCargosCache).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setLastSummary(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setMapping((current) => {
      if (hasCustomMapping) return sanitizeMapping(current, sourceKeys);
      const saved = loadSavedMapping<TargetFieldKey>(MAPPING_STORAGE_KEY, TARGET_KEYS);
      const derived = deriveDefaultMapping({ targetKeys: TARGET_KEYS, sourceKeys, synonyms: FIELD_SYNONYMS });
      return sanitizeMapping({ ...derived, ...(saved ?? {}) } as FieldMapping, sourceKeys);
    });
  }, [isOpen, sourceKeys, hasCustomMapping]);

  useEffect(() => {
    if (!isOpen) return;
    if (!hasCustomMapping) return;
    saveMapping(MAPPING_STORAGE_KEY, mapping);
  }, [isOpen, hasCustomMapping, mapping]);

  const resolveField = (row: Record<string, string>, key: TargetFieldKey) =>
    resolveMappedField({ row, key, mapping, synonyms: FIELD_SYNONYMS, getFirst });

  const cargoLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cargosCache) {
      map.set(c.nome.toLowerCase().trim(), c.id);
    }
    return map;
  }, [cargosCache]);

  function buildPreviewRow(r: ParsedCsvRow): PreviewRow {
    const row = r.raw;
    const errors: string[] = [];

    const maybeUpper = (v: string) => (forceUppercase ? upperPtBr(v) : v);

    const nome = maybeUpper(resolveField(row, 'nome'));
    const email = resolveField(row, 'email').toLowerCase().trim();
    const docRaw = resolveField(row, 'documento');
    const documento = digitsOnly(docRaw) || null;
    const telefone = resolveField(row, 'telefone').trim() || null;
    const matricula = resolveField(row, 'matricula').trim() || null;
    const dataAdmissaoRaw = resolveField(row, 'data_admissao');
    const cargoNome = maybeUpper(resolveField(row, 'cargo_nome'));
    const statusRaw = resolveField(row, 'status');
    const observacoes = resolveField(row, 'observacoes').trim() || null;

    if (!nome) errors.push('nome é obrigatório');

    const dataAdmissao = parseDate(dataAdmissaoRaw);
    if (dataAdmissaoRaw && !dataAdmissao) errors.push('data de admissão inválida');

    const status = resolveStatus(statusRaw);
    const cargoId = cargoNome ? (cargoLookup.get(cargoNome.toLowerCase().trim()) ?? null) : null;

    if (cargoNome && !cargoId && !autoCreateCargo) {
      errors.push(`cargo "${cargoNome}" não encontrado`);
    }

    const payload: ColaboradorPayload | null =
      errors.length > 0
        ? null
        : {
            nome: nome.trim(),
            email: email || null,
            documento,
            telefone,
            matricula,
            data_admissao: dataAdmissao,
            cargo_id: cargoId,
            status: status as any,
            observacoes,
            _cargo_nome: cargoNome || undefined,
          } as any;

    return { line: r.line, nome, documento, cargo_nome: cargoNome || null, cargo_id: cargoId, status, errors, payload };
  }

  const { preview, duplicateKeys } = useMemo(() => {
    const base = parsed.map(buildPreviewRow);
    const keyFn = (r: PreviewRow) => {
      if (dedupeKey === 'documento') return r.documento ? `doc:${r.documento}` : '';
      if (dedupeKey === 'matricula') {
        const mat = r.payload && (r.payload as any).matricula;
        return mat ? `mat:${String(mat).toLowerCase()}` : '';
      }
      return r.nome ? `nome:${String(r.nome).toLowerCase()}` : '';
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
  }, [parsed, mapping, dedupeKey, dedupeStrategy, forceUppercase, cargoLookup]);

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
        { id: 'documento', type: 'string', getValue: (r: PreviewRow) => r.documento ?? '' },
        { id: 'cargo_nome', type: 'string', getValue: (r: PreviewRow) => r.cargo_nome ?? '' },
        { id: 'status', type: 'string', getValue: (r: PreviewRow) => r.status ?? '' },
        { id: 'errors', type: 'string', getValue: (r: PreviewRow) => r.errors.join('; ') ?? '' },
      ] as const,
    );
  }, [preview, previewSort]);

  const handlePickFile = async (file: File) => {
    const { text: t, rows } = await readTabularImportFile(file);
    setText(t);
    setFileRows(rows);
  };

  // Resolve cargo_nome to cargo_id, auto-creating if needed
  const resolveCargoId = async (cargoNome: string): Promise<string | null> => {
    if (!cargoNome) return null;
    const existing = cargoLookup.get(cargoNome.toLowerCase().trim());
    if (existing) return existing;

    if (!autoCreateCargo) return null;

    try {
      const created = await saveCargo({ nome: cargoNome.trim(), ativo: true });
      // Update cache
      setCargosCache((prev) => [...prev, { id: created.id, nome: created.nome, descricao: null, responsabilidades: null, autoridades: null, setor: null, ativo: true }]);
      cargoLookup.set(cargoNome.toLowerCase().trim(), created.id);
      return created.id;
    } catch {
      return null;
    }
  };

  const handleImport = async () => {
    if (preview.length === 0) {
      addToast('Selecione um arquivo CSV/XLSX válido ou cole um CSV (com cabeçalho + linhas).', 'warning');
      return;
    }

    setIsImporting(true);
    setLastSummary(null);
    let ok = 0;
    let failed = 0;

    try {
      for (const row of preview) {
        if (!row.payload) {
          failed += 1;
          continue;
        }
        try {
          const payload = { ...row.payload } as any;
          const cargoNome = payload._cargo_nome;
          delete payload._cargo_nome;

          // Resolve cargo if not already resolved
          if (cargoNome && !payload.cargo_id) {
            const resolvedId = await resolveCargoId(cargoNome);
            if (resolvedId) payload.cargo_id = resolvedId;
          }

          await importFn(payload);
          ok += 1;
        } catch (e: any) {
          failed += 1;
          console.warn('[CSV_IMPORT][COLABORADORES] row failed', { line: row.line, error: e?.message || e });
        }
      }

      const summary = { ok, failed };
      setLastSummary(summary);
      if (ok > 0) {
        addToast(`Importação concluída: ${ok} colaborador(es) criado(s), ${failed} falha(s).`, 'success');
        onImported(summary);
      } else {
        addToast(`Nenhum colaborador importado. ${failed} falha(s).`, 'warning');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const canGoNextFromStep0 = parsed.length > 0;
  const canGoNextFromStep1 = !!mapping.nome;

  const unmatchedCargos = useMemo(() => {
    const names = new Set<string>();
    for (const r of preview) {
      if (r.cargo_nome && !r.cargo_id) names.add(r.cargo_nome);
    }
    return [...names];
  }, [preview]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar Colaboradores (CSV/XLSX)" size="4xl" bodyClassName="p-6 md:p-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className={`rounded-full px-2 py-1 ${step === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>1</span>
            <span className={step === 0 ? 'font-semibold text-gray-900' : ''}>Arquivo/CSV</span>
            <span className="text-gray-300">&rsaquo;</span>
            <span className={`rounded-full px-2 py-1 ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>2</span>
            <span className={step === 1 ? 'font-semibold text-gray-900' : ''}>Mapeamento</span>
            <span className="text-gray-300">&rsaquo;</span>
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
                    addToast('Mapeie o campo obrigatório "Nome".', 'warning');
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
                Campos comuns: <code>nome</code>, <code>email</code>, <code>cpf</code>, <code>telefone</code>, <code>matricula</code>, <code>cargo</code>, <code>data_admissao</code>.
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
              placeholder={'nome;cpf;cargo;email;data_admissao;status\nJoão Silva;123.456.789-00;Analista;joao@email.com;01/03/2024;ativo'}
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
                Dedupe por
                <select
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                  value={dedupeKey}
                  onChange={(e) => setDedupeKey(e.target.value as DedupeKey)}
                >
                  <option value="documento">CPF / Documento</option>
                  <option value="matricula">Matrícula</option>
                  <option value="nome">Nome</option>
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
                    const saved = loadSavedMapping<TargetFieldKey>(MAPPING_STORAGE_KEY, TARGET_KEYS);
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
                Detectamos {duplicateKeys.length} registro(s) duplicado(s) no arquivo.
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

              {unmatchedCargos.length > 0 && autoCreateCargo ? (
                <div className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  {unmatchedCargos.length} cargo(s) não encontrado(s) serão criados automaticamente: {unmatchedCargos.slice(0, 5).join(', ')}
                  {unmatchedCargos.length > 5 ? `, +${unmatchedCargos.length - 5} mais` : ''}.
                </div>
              ) : null}

              {preview.length === 0 ? (
                <div className="mt-2 text-sm text-gray-600">Volte e cole um CSV (ou envie um XLS/XLSX).</div>
              ) : (
                <div className="mt-3 max-h-[260px] overflow-auto rounded-lg border border-gray-200 bg-white">
                  <table className="min-w-full text-sm table-fixed">
                    <TableColGroup columns={previewColumns} widths={previewWidths} />
                    <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <ResizableSortableTh columnId="line" label="Linha" sort={previewSort} onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))} onResizeStart={startPreviewResize} className="px-3 py-2" />
                        <ResizableSortableTh columnId="nome" label="Nome" sort={previewSort} onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))} onResizeStart={startPreviewResize} className="px-3 py-2" />
                        <ResizableSortableTh columnId="documento" label="CPF" sort={previewSort} onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))} onResizeStart={startPreviewResize} className="px-3 py-2" />
                        <ResizableSortableTh columnId="cargo_nome" label="Cargo" sort={previewSort} onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))} onResizeStart={startPreviewResize} className="px-3 py-2" />
                        <ResizableSortableTh columnId="status" label="Status" sort={previewSort} onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))} onResizeStart={startPreviewResize} className="px-3 py-2" />
                        <ResizableSortableTh columnId="errors" label="Erros" sort={previewSort} onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))} onResizeStart={startPreviewResize} className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewSorted.slice(0, 120).map((r) => (
                        <tr key={r.line} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.line}</td>
                          <td className="px-3 py-2">{r.nome || '—'}</td>
                          <td className="px-3 py-2">{r.documento || '—'}</td>
                          <td className="px-3 py-2">
                            {r.cargo_nome ? (
                              <span className={r.cargo_id ? '' : 'text-blue-600'} title={r.cargo_id ? 'Cargo existente' : 'Será criado automaticamente'}>
                                {r.cargo_nome}{!r.cargo_id ? ' *' : ''}
                              </span>
                            ) : '—'}
                          </td>
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
                {unmatchedCargos.length > 0 && autoCreateCargo
                  ? '* Cargos marcados com asterisco serão criados automaticamente.'
                  : 'Dica: corrija as linhas destacadas em vermelho antes de importar.'}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isImporting}>
                  Cancelar
                </Button>
                <Button type="button" onClick={() => void handleImport()} disabled={isImporting || totals.valid === 0}>
                  {isImporting ? <Loader2 className="animate-spin" size={18} /> : null}
                  <span className="ml-2">Importar {totals.valid} colaborador(es)</span>
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
