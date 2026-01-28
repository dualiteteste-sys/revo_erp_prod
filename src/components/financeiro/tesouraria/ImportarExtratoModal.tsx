import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import TextArea from '@/components/ui/forms/TextArea';
import { FileUp, Loader2, UploadCloud, DatabaseBackup, FileText } from 'lucide-react';
import { ImportarExtratoPayload, seedExtratos } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';
import { Button } from '@/components/ui/button';
import { isSeedEnabled } from '@/utils/seed';
import { readTabularImportFile, TABULAR_IMPORT_ACCEPT } from '@/lib/tabularImport';
import { getFirst, parseCsv, type ParsedCsvRow } from '@/lib/csvImport';
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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImport: (itens: ImportarExtratoPayload[]) => Promise<void>;
  contaCorrenteId: string;
  onImported?: () => void;
}

type WizardStep = 0 | 1 | 2;

type TargetFieldKey = 'data' | 'descricao' | 'valor' | 'documento';
type FieldMapping = ImportFieldMapping<TargetFieldKey>;

type DedupeStrategy = 'none' | 'first' | 'last';

const MAPPING_STORAGE_KEY = 'revo:import_mapping:extrato:v1';
const TARGET_KEYS: TargetFieldKey[] = ['data', 'descricao', 'valor', 'documento'];

const FIELD_SYNONYMS: Record<TargetFieldKey, string[]> = {
  data: ['data', 'dt', 'data_lancamento', 'data_movimento', 'dt_posted', 'dtposted'],
  descricao: ['descricao', 'descrição', 'historico', 'hist', 'lancamento', 'lançamento', 'memo', 'name'],
  valor: ['valor', 'vl', 'valor_lancamento', 'valor_movimento', 'trnamt', 'amount'],
  documento: ['documento', 'doc', 'documento_ref', 'num_documento', 'fitid', 'id', 'checknum'],
};

type PreviewRow = {
  line: number;
  data: string | null;
  descricao: string;
  valor: number | null;
  tipo: 'credito' | 'debito' | null;
  documento?: string;
  errors: string[];
  payload: ImportarExtratoPayload | null;
  dedupeKey: string | null;
};

const parseDateToISO = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const m = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
};

const parseMoney = (raw: string): number | null => {
  const value = raw.trim();
  if (!value) return null;
  const normalized = value
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const hashString = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const readFileAsText = (f: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(f);
  });
};

const parseOfxText = (text: string): ImportarExtratoPayload[] => {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const itens: ImportarExtratoPayload[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const dt = b.match(/<DTPOSTED>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const trntype = (b.match(/<TRNTYPE>([^<\r\n]+)/i)?.[1]?.trim() ?? '').toUpperCase();
    const trnamtRaw = b.match(/<TRNAMT>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const fitid = b.match(/<FITID>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const checknum = b.match(/<CHECKNUM>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const name = b.match(/<NAME>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const memo = b.match(/<MEMO>([^<\r\n]+)/i)?.[1]?.trim() ?? '';

    const dt8 = dt.match(/\d{8}/)?.[0] ?? '';
    const dataISO = parseDateToISO(dt8);
    const parsedAmount = parseMoney(trnamtRaw);
    const descricao = (memo || name || 'Lançamento').trim();
    const documento = (checknum || fitid || '').trim() || undefined;

    if (!dataISO || parsedAmount === null) continue;

    let signedAmount = parsedAmount;
    if (trntype === 'DEBIT' && signedAmount > 0) signedAmount = -signedAmount;
    if (trntype === 'CREDIT' && signedAmount < 0) signedAmount = Math.abs(signedAmount);

    const tipo = signedAmount >= 0 ? 'credito' : 'debito';
    const valorAbs = Math.abs(signedAmount);
    if (valorAbs <= 0) continue;

    const fitIdOrFallback = fitid || '';
    const raw = `${dataISO}|${descricao}|${signedAmount}|${documento ?? ''}|${fitIdOrFallback}|${trntype}|${i + 1}`;
    itens.push({
      data_lancamento: dataISO,
      descricao,
      valor: valorAbs,
      tipo_lancamento: tipo,
      documento_ref: documento,
      identificador_banco: fitid || `OFX-${hashString(raw)}-${i + 1}`,
      hash_importacao: fitid ? hashString(`${dataISO}|${descricao}|${signedAmount}|${documento ?? ''}|${fitIdOrFallback}|${trntype}`) : hashString(raw),
      linha_bruta: raw,
    });
  }

  return itens;
};

function parseLegacyCsvText(text: string): ImportarExtratoPayload[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';

  const itens: ImportarExtratoPayload[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(delimiter).map((p) => p.trim());

    if (i === 0 && /data/i.test(parts[0] || '')) continue;
    if (parts.length < 3) continue;

    const dataISO = parseDateToISO(parts[0] || '');
    const descricao = (parts[1] || '').trim();
    const valorNum = parseMoney(parts[2] || '');
    const doc = (parts[3] || '').trim() || undefined;

    if (!dataISO || !descricao || valorNum === null) continue;

    const tipo = valorNum >= 0 ? 'credito' : 'debito';
    const valorAbs = Math.abs(valorNum);
    if (valorAbs <= 0) continue;

    const raw = `${dataISO}|${descricao}|${valorNum}|${doc ?? ''}|${i + 1}`;
    itens.push({
      data_lancamento: dataISO,
      descricao,
      valor: valorAbs,
      tipo_lancamento: tipo,
      documento_ref: doc,
      identificador_banco: `CSV-${hashString(raw)}-${i + 1}`,
      hash_importacao: hashString(raw),
      linha_bruta: line,
    });
  }
  return itens;
}

export default function ImportarExtratoModal({ isOpen, onClose, onImport, contaCorrenteId, onImported }: Props) {
  const enableSeed = isSeedEnabled();
  const { addToast } = useToast();

  const [step, setStep] = useState<WizardStep>(0);
  const [csvText, setCsvText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileRows, setFileRows] = useState<ParsedCsvRow[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [lastSummary, setLastSummary] = useState<{ ok: number; failed: number } | null>(null);

  const [mapping, setMapping] = useState<FieldMapping>(() =>
    deriveDefaultMapping({ targetKeys: TARGET_KEYS, sourceKeys: [], synonyms: FIELD_SYNONYMS }),
  );
  const [hasCustomMapping, setHasCustomMapping] = useState(false);
  const [dedupeStrategy, setDedupeStrategy] = useState<DedupeStrategy>('first');
  const [forceUppercase, setForceUppercase] = useState(false);
  const [previewSort, setPreviewSort] = useState<SortState<'line' | 'data' | 'descricao' | 'valor' | 'tipo' | 'doc' | 'errors'>>({
    column: 'data',
    direction: 'desc',
  });

  const mappingColumns: TableColumnWidthDef[] = [
    { id: 'campo', defaultWidth: 240, minWidth: 180 },
    { id: 'coluna', defaultWidth: 340, minWidth: 220 },
    { id: 'obrigatorio', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths: mappingWidths, startResize: startMappingResize } = useTableColumnWidths({
    tableId: 'import:extrato:mapping',
    columns: mappingColumns,
  });

  const previewColumns: TableColumnWidthDef[] = [
    { id: 'line', defaultWidth: 90, minWidth: 80 },
    { id: 'data', defaultWidth: 140, minWidth: 120 },
    { id: 'descricao', defaultWidth: 360, minWidth: 220 },
    { id: 'valor', defaultWidth: 140, minWidth: 120 },
    { id: 'tipo', defaultWidth: 120, minWidth: 110 },
    { id: 'doc', defaultWidth: 200, minWidth: 160 },
    { id: 'errors', defaultWidth: 520, minWidth: 260 },
  ];
  const { widths: previewWidths, startResize: startPreviewResize } = useTableColumnWidths({
    tableId: 'import:extrato:preview',
    columns: previewColumns,
  });

  const exampleCsv = useMemo(() => {
    return [
      'Data;Descrição;Valor;Documento',
      '2025-01-10;Depósito;1500.00;DEP001',
      '2025-01-11;Pagamento fornecedor;-250.90;DOC123',
      '2025-01-12;Tarifa bancária;-12.50;',
    ].join('\n');
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setLastSummary(null);
    setFile(null);
    setFileRows(null);
  }, [isOpen]);

  const parsed = useMemo(() => fileRows ?? parseCsv(csvText), [fileRows, csvText]);
  const sourceKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of parsed) Object.keys(r.raw).forEach((k) => s.add(k));
    return [...s].sort();
  }, [parsed]);

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

  const fileNameLower = (file?.name || '').toLowerCase();
  const isOfx = !!file && fileNameLower.endsWith('.ofx');
  const canUseMapping = parsed.length > 0 && !isOfx;

  const { preview, duplicatesCount } = useMemo(() => {
    if (!canUseMapping) return { preview: [] as PreviewRow[], duplicatesCount: 0 };

    const base: PreviewRow[] = parsed.map((r) => {
      const row = r.raw;
      const errors: string[] = [];

      const maybeUpper = (v: string, k: TargetFieldKey) => {
        if (!forceUppercase) return v;
        if (k === 'valor') return v;
        if (k === 'data') return v;
        return upperPtBr(v);
      };

      const rawDate = resolveField(row, 'data');
      const rawDescricao = maybeUpper(resolveField(row, 'descricao'), 'descricao');
      const rawValor = resolveField(row, 'valor');
      const rawDoc = resolveField(row, 'documento');

      const dataISO = parseDateToISO(rawDate || '');
      const descricao = (rawDescricao || '').trim();
      const valorNum = parseMoney(rawValor || '');
      const doc = (rawDoc || '').trim() || undefined;

      if (!dataISO) errors.push('data inválida');
      if (!descricao) errors.push('descrição é obrigatória');
      if (valorNum === null) errors.push('valor inválido');

      const tipo = valorNum === null ? null : valorNum >= 0 ? 'credito' : 'debito';
      const valorAbs = valorNum === null ? null : Math.abs(valorNum);
      if (valorAbs !== null && valorAbs <= 0) errors.push('valor deve ser > 0');

      const raw = dataISO && valorNum !== null ? `${dataISO}|${descricao}|${valorNum}|${doc ?? ''}` : null;
      const dedupeKey = raw ? hashString(raw) : null;

      const payload: ImportarExtratoPayload | null =
        errors.length > 0 || !dataISO || valorNum === null || !tipo || valorAbs === null
          ? null
          : {
              data_lancamento: dataISO,
              descricao,
              valor: valorAbs,
              tipo_lancamento: tipo,
              documento_ref: doc,
              identificador_banco: `CSV-${dedupeKey}-${r.line}`,
              hash_importacao: dedupeKey,
              linha_bruta: JSON.stringify(row),
            };

      return { line: r.line, data: dataISO, descricao, valor: valorAbs, tipo, documento: doc, errors, payload, dedupeKey };
    });

    const groups = new Map<string, PreviewRow[]>();
    for (const r of base) {
      if (!r.dedupeKey) continue;
      const arr = groups.get(r.dedupeKey) ?? [];
      arr.push(r);
      groups.set(r.dedupeKey, arr);
    }

    const dupCount = [...groups.values()].filter((rows) => rows.length > 1).length;
    if (dedupeStrategy === 'none' || dupCount === 0) return { preview: base, duplicatesCount: dupCount };

    const pickIndex = dedupeStrategy === 'last' ? -1 : 0;
    const keepLine = new Map<number, boolean>();
    for (const r of base) keepLine.set(r.line, true);
    for (const rows of groups.values()) {
      if (rows.length <= 1) continue;
      const picked = pickIndex === -1 ? rows[rows.length - 1] : rows[0];
      for (const rr of rows) keepLine.set(rr.line, rr.line === picked.line);
    }
    return { preview: base.filter((r) => keepLine.get(r.line)), duplicatesCount: dupCount };
  }, [canUseMapping, parsed, forceUppercase, dedupeStrategy, resolveField]);

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
        { id: 'data', type: 'date', getValue: (r: PreviewRow) => r.data ?? '' },
        { id: 'descricao', type: 'string', getValue: (r: PreviewRow) => r.descricao ?? '' },
        { id: 'valor', type: 'number', getValue: (r: PreviewRow) => r.valor ?? NaN },
        { id: 'tipo', type: 'string', getValue: (r: PreviewRow) => r.tipo ?? '' },
        { id: 'doc', type: 'string', getValue: (r: PreviewRow) => r.documento ?? '' },
        { id: 'errors', type: 'string', getValue: (r: PreviewRow) => r.errors.join('; ') ?? '' },
      ] as const
    );
  }, [preview, previewSort]);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedExtratos(contaCorrenteId);
      addToast('Dados de exemplo importados com sucesso!', 'success');
      onImported?.();
      onClose();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const handlePickFile = async (f: File) => {
    const name = f.name.toLowerCase();
    setFile(f);
    setLastSummary(null);
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      const { text, rows } = await readTabularImportFile(f);
      setCsvText(text);
      setFileRows(rows);
      return;
    }
    setFileRows(null);
  };

  const handleImport = async () => {
    if (!csvText.trim() && !file) {
      addToast('Envie um arquivo ou cole o conteúdo do extrato.', 'warning');
      return;
    }

    setIsProcessing(true);
    setLastSummary(null);
    try {
      let itens: ImportarExtratoPayload[] = [];

      if (file) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.ofx')) {
          const content = await readFileAsText(file);
          itens = parseOfxText(content);
        } else if (name.endsWith('.txt')) {
          const content = await readFileAsText(file);
          itens = parseLegacyCsvText(content);
        } else if (canUseMapping) {
          itens = preview.filter((p) => p.payload).map((p) => p.payload!) as ImportarExtratoPayload[];
        } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
          const { rows } = await readTabularImportFile(file);
          // fallback: tenta heurísticas antigas se vier sem header detectável
          const fallback = rows.length ? rows : [];
          if (fallback.length === 0) {
            const content = await readFileAsText(file);
            itens = parseLegacyCsvText(content);
          } else {
            const bestEffort = fallback.map((r) => ({
              line: (r as any).line ?? 0,
              raw: (r as any).raw ?? {},
            })) as ParsedCsvRow[];
            // Se a planilha veio sem header “bom”, o usuário precisa colar um CSV com cabeçalho.
            if (bestEffort.length === 0) itens = [];
          }
        } else {
          const content = await readFileAsText(file);
          itens = parseLegacyCsvText(content);
        }
      } else if (canUseMapping) {
        itens = preview.filter((p) => p.payload).map((p) => p.payload!) as ImportarExtratoPayload[];
      } else {
        itens = parseLegacyCsvText(csvText);
      }

      if (itens.length === 0) {
        addToast('Nenhum item válido encontrado. Verifique o formato.', 'error');
        return;
      }

      await onImport(itens);
      setLastSummary({ ok: itens.length, failed: 0 });
      addToast(`${itens.length} lançamentos importados.`, 'success');
      setCsvText('');
      setFile(null);
      setFileRows(null);
      onImported?.();
      onClose();
    } catch (e: any) {
      addToast('Erro ao importar: ' + e.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const canGoNextFromStep0 = (!!csvText.trim() || !!file) && (isOfx || parsed.length > 0 || parseLegacyCsvText(csvText).length > 0);
  const canGoNextFromStep1 = isOfx || !!mapping.data || !canUseMapping;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar Extrato Bancário" size="4xl" bodyClassName="p-6 md:p-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className={`rounded-full px-2 py-1 ${step === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>1</span>
            <span className={step === 0 ? 'font-semibold text-gray-900' : ''}>Arquivo/Texto</span>
            <span className="text-gray-300">›</span>
            <span className={`rounded-full px-2 py-1 ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>2</span>
            <span className={step === 1 ? 'font-semibold text-gray-900' : ''}>Mapeamento</span>
            <span className="text-gray-300">›</span>
            <span className={`rounded-full px-2 py-1 ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>3</span>
            <span className={step === 2 ? 'font-semibold text-gray-900' : ''}>Prévia</span>
          </div>

          <div className="flex gap-2">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((s) => (s - 1) as WizardStep)} disabled={isProcessing}>
                Voltar
              </Button>
            ) : null}
            {step < 2 ? (
              <Button
                type="button"
                onClick={() => {
                  if (step === 0) {
                    if (!canGoNextFromStep0) {
                      addToast('Envie um arquivo ou cole o conteúdo do extrato.', 'warning');
                      return;
                    }
                    setStep(1);
                    return;
                  }
                  if (!canGoNextFromStep1) {
                    addToast('Mapeie ao menos o campo “Data”.', 'warning');
                    return;
                  }
                  setStep(2);
                }}
                disabled={isProcessing}
              >
                Próximo
              </Button>
            ) : null}
          </div>
        </div>

        {step === 0 ? (
          <>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
              <p className="font-bold mb-1">Formato esperado (CSV com cabeçalho):</p>
              <code className="block bg-white p-2 rounded border border-blue-200 mt-2">
                Data;Descrição;Valor;Documento
              </code>
              <p className="mt-2 text-xs">Ex.: 2025-01-11;Pagamento fornecedor;-250.90;DOC123</p>
              <p className="mt-2 text-xs">Suporta também arquivo <b>.ofx</b> e CSV com “,”.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCsvText(exampleCsv);
                    setFile(null);
                    setFileRows(null);
                    addToast('Exemplo colado no campo.', 'info');
                  }}
                  className="gap-2"
                >
                  <FileText size={16} />
                  Colar exemplo
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">Enviar arquivo</div>
                  <div className="text-xs text-gray-500">CSV/XLSX ou OFX. O conteúdo também pode ser colado abaixo.</div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <FileUp size={16} />
                  Selecionar
                  <input
                    type="file"
                    accept={`${TABULAR_IMPORT_ACCEPT},.txt,.ofx,text/plain`}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) void handlePickFile(f);
                      else setFile(null);
                    }}
                  />
                </label>
              </div>
              {file ? (
                <div className="mt-3 text-sm text-gray-700">
                  Arquivo selecionado: <span className="font-semibold">{file.name}</span>{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setFileRows(null);
                    }}
                    className="ml-2 text-xs text-red-600 hover:underline"
                  >
                    remover
                  </button>
                </div>
              ) : null}
            </div>

            <TextArea
              label="Conteúdo do arquivo (copie e cole)"
              name="csv"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setFile(null);
                setFileRows(null);
              }}
              rows={10}
              placeholder="Cole aqui as linhas do seu extrato..."
            />
          </>
        ) : null}

        {step === 1 ? (
          <div className="rounded-xl border border-gray-200 bg-white/70 p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-800">Mapeamento de campos</div>
                <div className="text-xs text-gray-600">
                  {isOfx ? 'Arquivo OFX não precisa de mapeamento.' : canUseMapping ? 'Escolha quais colunas do arquivo mapeiam Data/Descrição/Valor.' : 'Não foi possível detectar cabeçalho para mapeamento (use o exemplo com cabeçalho).'}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={forceUppercase}
                  onChange={(e) => setForceUppercase(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                  disabled={isOfx || !canUseMapping}
                />
                Maiúsculo
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm text-gray-700">
                Dedupe (linhas idênticas)
                <select
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                  value={dedupeStrategy}
                  onChange={(e) => setDedupeStrategy(e.target.value as DedupeStrategy)}
                  disabled={isOfx || !canUseMapping}
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
                  disabled={isOfx || !canUseMapping}
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
              <div className="flex items-end justify-end text-xs text-gray-600">
                {duplicatesCount > 0 && !isOfx && canUseMapping ? `${duplicatesCount} grupo(s) duplicado(s) detectado(s)` : null}
              </div>
            </div>

            {canUseMapping ? (
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
                    {([
                      { key: 'data', label: 'Data', required: true },
                      { key: 'descricao', label: 'Descrição', required: true },
                      { key: 'valor', label: 'Valor (positivo/negativo)', required: true },
                      { key: 'documento', label: 'Documento', required: false },
                    ] as const).map((f) => (
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
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-800">Pré-visualização</div>
                <div className="text-xs text-gray-600">
                  {canUseMapping ? (
                    <>
                      {totals.total} linha(s) · {totals.valid} válida(s) · {totals.invalid} com erro
                    </>
                  ) : (
                    <>OFX/TXT/CSV simples</>
                  )}
                  {lastSummary ? ` · Última: ${lastSummary.ok} importado(s)` : ''}
                </div>
              </div>

              {canUseMapping ? (
                preview.length === 0 ? (
                  <div className="mt-2 text-sm text-gray-600">Volte e cole um CSV com cabeçalho (ou envie um XLS/XLSX).</div>
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
                            columnId="data"
                            label="Data"
                            sort={previewSort}
                            onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                            onResizeStart={startPreviewResize}
                            className="px-3 py-2"
                          />
                          <ResizableSortableTh
                            columnId="descricao"
                            label="Descrição"
                            sort={previewSort}
                            onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                            onResizeStart={startPreviewResize}
                            className="px-3 py-2"
                          />
                          <ResizableSortableTh
                            columnId="valor"
                            label="Valor"
                            sort={previewSort}
                            onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                            onResizeStart={startPreviewResize}
                            className="px-3 py-2"
                          />
                          <ResizableSortableTh
                            columnId="tipo"
                            label="Tipo"
                            sort={previewSort}
                            onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                            onResizeStart={startPreviewResize}
                            className="px-3 py-2"
                          />
                          <ResizableSortableTh
                            columnId="doc"
                            label="Documento"
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
                            <td className="px-3 py-2">{r.data || '—'}</td>
                            <td className="px-3 py-2">{r.descricao || '—'}</td>
                            <td className="px-3 py-2">{typeof r.valor === 'number' ? r.valor.toFixed(2) : '—'}</td>
                            <td className="px-3 py-2">{r.tipo || '—'}</td>
                            <td className="px-3 py-2">{r.documento || '—'}</td>
                            <td className="px-3 py-2 text-rose-700">{r.errors.join('; ') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="mt-2 text-sm text-gray-600">
                  Para importação “estado da arte” (mapeamento/preview), use CSV/XLSX com cabeçalho (ex.: o botão “Colar exemplo”).
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              {enableSeed ? (
                <Button variant="secondary" onClick={handleSeed} disabled={isSeeding || isProcessing} className="gap-2">
                  {isSeeding ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />}
                  Gerar dados de teste
                </Button>
              ) : (
                <div />
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} disabled={isProcessing}>
                  Cancelar
                </Button>
                <Button onClick={handleImport} disabled={isProcessing || (canUseMapping && totals.valid === 0)} className="gap-2">
                  {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                  Importar
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
