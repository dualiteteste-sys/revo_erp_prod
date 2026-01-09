import React, { useEffect, useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import type { PartnerPayload } from '@/services/partners';
import { digitsOnly, getFirst, parseCsv, type ParsedCsvRow } from '@/lib/csvImport';
import { readTabularImportFile, TABULAR_IMPORT_ACCEPT } from '@/lib/tabularImport';

type PreviewRow = {
  line: number;
  nome: string;
  tipo: 'cliente' | 'fornecedor' | 'ambos';
  doc: string | null;
  email: string | null;
  telefone: string | null;
  enderecoResumo: string | null;
  errors: string[];
  payload: PartnerPayload | null;
};

type WizardStep = 0 | 1 | 2;

type TargetFieldKey =
  | 'nome'
  | 'tipo'
  | 'documento'
  | 'fantasia'
  | 'email'
  | 'telefone'
  | 'cep'
  | 'logradouro'
  | 'numero'
  | 'bairro'
  | 'complemento'
  | 'cidade'
  | 'uf';

type FieldMapping = Record<TargetFieldKey, string | null>;

type DedupeKey = 'documento' | 'email';
type DedupeStrategy = 'none' | 'first' | 'last';

const MAPPING_STORAGE_KEY = 'revo:import_mapping:partners:v1';

const TARGET_FIELDS: Array<{ key: TargetFieldKey; label: string; required?: boolean; group: 'pessoa' | 'endereco' }> = [
  { key: 'nome', label: 'Nome / Razão social', required: true, group: 'pessoa' },
  { key: 'tipo', label: 'Tipo (cliente/fornecedor/ambos)', group: 'pessoa' },
  { key: 'documento', label: 'Documento (CPF/CNPJ)', group: 'pessoa' },
  { key: 'fantasia', label: 'Fantasia', group: 'pessoa' },
  { key: 'email', label: 'E-mail', group: 'pessoa' },
  { key: 'telefone', label: 'Telefone', group: 'pessoa' },
  { key: 'cep', label: 'CEP', group: 'endereco' },
  { key: 'logradouro', label: 'Logradouro / Endereço', group: 'endereco' },
  { key: 'numero', label: 'Número', group: 'endereco' },
  { key: 'bairro', label: 'Bairro', group: 'endereco' },
  { key: 'complemento', label: 'Complemento', group: 'endereco' },
  { key: 'cidade', label: 'Cidade', group: 'endereco' },
  { key: 'uf', label: 'UF', group: 'endereco' },
];

const FIELD_SYNONYMS: Record<TargetFieldKey, string[]> = {
  nome: ['nome', 'razao_social', 'fantasia', 'name'],
  tipo: ['tipo', 'perfil', 'categoria'],
  documento: ['doc_unico', 'documento', 'cpf', 'cnpj', 'doc', 'cnpj_cpf'],
  fantasia: ['fantasia', 'nome_fantasia'],
  email: ['email', 'e_mail'],
  telefone: ['telefone', 'fone', 'celular', 'whatsapp'],
  cep: ['cep', 'codigo_postal', 'postal_code', 'zip'],
  logradouro: ['logradouro', 'endereco', 'rua', 'address', 'address_line1', 'endereco_logradouro'],
  numero: ['numero', 'num', 'number', 'endereco_numero'],
  bairro: ['bairro', 'neighborhood'],
  complemento: ['complemento', 'address_line2'],
  cidade: ['cidade', 'municipio', 'city'],
  uf: ['uf', 'estado', 'state'],
};

function emptyMapping(): FieldMapping {
  return {
    nome: null,
    tipo: null,
    documento: null,
    fantasia: null,
    email: null,
    telefone: null,
    cep: null,
    logradouro: null,
    numero: null,
    bairro: null,
    complemento: null,
    cidade: null,
    uf: null,
  };
}

function deriveDefaultMapping(sourceKeys: string[]): FieldMapping {
  const keysSet = new Set(sourceKeys);
  const out: FieldMapping = emptyMapping();
  for (const f of TARGET_FIELDS) {
    const candidates = FIELD_SYNONYMS[f.key] ?? [];
    const found = candidates.find((c) => keysSet.has(c)) ?? null;
    out[f.key] = found;
  }
  return out;
}

function sanitizeMapping(mapping: FieldMapping, sourceKeys: string[]): FieldMapping {
  const keysSet = new Set(sourceKeys);
  const out: FieldMapping = { ...mapping };
  (Object.keys(out) as TargetFieldKey[]).forEach((k) => {
    const v = out[k];
    if (v && !keysSet.has(v)) out[k] = null;
  });
  return out;
}

function loadSavedMapping(): FieldMapping | null {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FieldMapping>;
    const base = emptyMapping();
    (Object.keys(base) as TargetFieldKey[]).forEach((k) => {
      const v = parsed[k];
      base[k] = typeof v === 'string' ? v : null;
    });
    return base;
  } catch {
    return null;
  }
}

function saveMapping(mapping: FieldMapping) {
  try {
    localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mapping));
  } catch {
    // ignore
  }
}

function normalizeTipo(raw: string): 'cliente' | 'fornecedor' | 'ambos' {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'cliente';
  if (v.includes('ambos') || v.includes('cliente_fornecedor')) return 'ambos';
  if (v.includes('forn')) return 'fornecedor';
  if (v.includes('clie')) return 'cliente';
  return 'cliente';
}

function inferTipoPessoa(docDigits: string): 'fisica' | 'juridica' {
  if (docDigits.length === 11) return 'fisica';
  return 'juridica';
}

function upperPtBr(raw: string) {
  try {
    return raw.toLocaleUpperCase('pt-BR');
  } catch {
    return raw.toUpperCase();
  }
}

export default function ImportPartnersCsvModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported: (summary: { ok: number; failed: number }) => void;
  importFn: (payload: PartnerPayload) => Promise<any>;
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

  const [mapping, setMapping] = useState<FieldMapping>(() => emptyMapping());
  const [hasCustomMapping, setHasCustomMapping] = useState(false);
  const [dedupeKey, setDedupeKey] = useState<DedupeKey>('documento');
  const [dedupeStrategy, setDedupeStrategy] = useState<DedupeStrategy>('first');
  const [forceUppercase, setForceUppercase] = useState(false);

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
      const saved = loadSavedMapping();
      const derived = deriveDefaultMapping(sourceKeys);
      return sanitizeMapping({ ...derived, ...(saved ?? {}) }, sourceKeys);
    });
  }, [isOpen, sourceKeys, hasCustomMapping]);

  useEffect(() => {
    if (!isOpen) return;
    if (!hasCustomMapping) return;
    saveMapping(mapping);
  }, [isOpen, hasCustomMapping, mapping]);

  const resolveField = (row: Record<string, string>, key: TargetFieldKey) => {
    const mapped = mapping[key];
    if (mapped) return String(row[mapped] ?? '').trim();
    return getFirst(row, FIELD_SYNONYMS[key] ?? []);
  };

  function buildPreviewRow(r: ParsedCsvRow): PreviewRow {
    const row = r.raw;
    const errors: string[] = [];

    const maybeUpper = (v: string, k: TargetFieldKey) => {
      if (!forceUppercase) return v;
      // não mexe nos campos que não deveriam ser uppercased
      if (k === 'email') return v;
      if (k === 'tipo') return v;
      return upperPtBr(v);
    };

    const nome = maybeUpper(resolveField(row, 'nome'), 'nome');
    const tipo = normalizeTipo(resolveField(row, 'tipo'));
    const doc = digitsOnly(resolveField(row, 'documento')) || null;
    const email = resolveField(row, 'email') || null;
    const telefone = digitsOnly(resolveField(row, 'telefone')) || null;
    const fantasia = (() => {
      const v = resolveField(row, 'fantasia');
      return v ? maybeUpper(v, 'fantasia') : null;
    })();

    if (!nome) errors.push('nome é obrigatório');
    if (doc && doc.length !== 11 && doc.length !== 14) errors.push('documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos');

    const tipo_pessoa = inferTipoPessoa(doc || '');

    const payload: PartnerPayload | null =
      errors.length > 0
        ? null
        : {
            pessoa: {
              nome,
              fantasia,
              tipo,
              tipo_pessoa,
              doc_unico: doc,
              email,
              telefone,
              isento_ie: false,
              contribuinte_icms: '9',
            },
            enderecos: [],
            contatos: [],
          };

    if (payload) {
      const cep = digitsOnly(resolveField(row, 'cep'));
      let uf = maybeUpper(resolveField(row, 'uf'), 'uf');
      let cidade = maybeUpper(resolveField(row, 'cidade'), 'cidade');
      let logradouro = maybeUpper(resolveField(row, 'logradouro'), 'logradouro');
      let numero = maybeUpper(resolveField(row, 'numero'), 'numero');

      // Heurísticas úteis para dados legados:
      // - "Cidade/UF" em uma coluna só
      if ((!uf || !cidade) && cidade && cidade.includes('/')) {
        const parts = cidade.split('/').map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          if (!cidade) cidade = parts[0] ?? cidade;
          if (!uf) uf = parts[1] ?? uf;
          cidade = parts[0] ?? cidade;
        }
      }
      // - Endereço em uma coluna só com número no final ("Rua X, 100")
      if (!numero && logradouro) {
        const m = logradouro.match(/(?:,|\s)\s*(\d{1,6})\s*$/);
        if (m?.[1]) {
          numero = m[1];
          logradouro = logradouro.replace(m[0], '').trim();
        }
      }

      const bairro = (() => {
        const v = resolveField(row, 'bairro');
        return v ? maybeUpper(v, 'bairro') : '';
      })();
      const complemento = (() => {
        const v = resolveField(row, 'complemento');
        return v ? maybeUpper(v, 'complemento') : '';
      })();

      // Se qualquer campo de endereço estiver presente, cria endereço (evita "não veio endereço" quando só há bairro/numero/complemento).
      if (cep || uf || cidade || logradouro || numero || bairro || complemento) {
        payload.enderecos = [
          {
            tipo_endereco: 'PRINCIPAL',
            cep: cep || null,
            uf: uf || null,
            cidade: cidade || null,
            logradouro: logradouro || null,
            numero: numero || null,
            bairro: bairro || null,
            complemento: complemento || null,
            pais: 'Brasil',
            pais_codigo: '1058',
          },
        ];
      }
    }

    const enderecoResumo = payload?.enderecos?.[0]
      ? [payload.enderecos[0].logradouro, payload.enderecos[0].numero, payload.enderecos[0].bairro, payload.enderecos[0].cidade, payload.enderecos[0].uf]
          .filter((x) => x && String(x).trim())
          .join(' - ')
      : null;

    return { line: r.line, nome, tipo, doc, email, telefone, enderecoResumo, errors, payload };
  }

  const { preview, duplicateKeys } = useMemo(() => {
    const base = parsed.map(buildPreviewRow);
    const keyFn = (r: PreviewRow) => {
      if (dedupeKey === 'documento') return r.doc ? `doc:${r.doc}` : '';
      return r.email ? `email:${String(r.email).toLowerCase()}` : '';
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
  }, [parsed, dedupeKey, dedupeStrategy, mapping, forceUppercase]);

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
    let sawAddressPersistError = false;

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

          const expectedAddress = (row.payload.enderecos || []).some((e) =>
            [e.cep, e.uf, e.cidade, e.logradouro, e.numero, e.bairro, e.complemento].some((v) => v && String(v).trim() !== ''),
          );
          const createdAddresses = Array.isArray(created?.enderecos) ? created.enderecos : [];
          if (expectedAddress && createdAddresses.length === 0) {
            if (deleteFn && id) {
              try {
                await deleteFn(id);
                localCreated.splice(localCreated.indexOf(id), 1);
              } catch {
                // ignore best-effort cleanup
              }
            }
            throw new Error(
              'Endereço não foi persistido no banco. Isso indica um problema no RPC `create_update_partner`/migrations do Supabase (não é o preview).',
            );
          }

          ok += 1;
        } catch (e: any) {
          const msg = String(e?.message || '');
          if (msg.includes('Endereço não foi persistido no banco')) {
            sawAddressPersistError = true;
          }
          failed += 1;
          console.warn('[CSV_IMPORT][PARTNERS] row failed', { line: row.line, error: e?.message || e });
        }
      }

      const summary = { ok, failed };
      setLastSummary(summary);
      setCreatedIds(localCreated);
      if (sawAddressPersistError) {
        addToast(
          'Falha ao persistir endereços no banco. É necessário aplicar a migration que corrige o RPC `create_update_partner` no Supabase.',
          'error',
        );
      }
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
      title="Importar Clientes/Fornecedores (CSV/XLSX)"
      size="4xl"
      bodyClassName="p-6 md:p-8"
    >
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
                    if (parsed.length === 0) {
                      addToast('Selecione um arquivo CSV/XLSX válido ou cole um CSV (com cabeçalho + linhas).', 'warning');
                      return;
                    }
                    setStep(1);
                    return;
                  }

                  if (!mapping.nome) {
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
            Campos comuns: <code>nome</code>, <code>tipo</code> (cliente/fornecedor/ambos), <code>documento</code>,{' '}
            <code>email</code>, <code>telefone</code>, <code>cep</code>, <code>logradouro</code>, <code>numero</code>, <code>cidade</code>, <code>uf</code>.
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
          placeholder={'nome;tipo;documento;email;telefone;cep;logradouro;numero;cidade;uf\nCliente A;cliente;12345678901;cliente@email.com;11999999999;01001000;Rua X;100;São Paulo;SP'}
          rows={12}
        />
          </>
        ) : null}

        {step === 1 ? (
          <div className="rounded-xl border border-gray-200 bg-white/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-800">Mapeamento de colunas</div>
                <div className="mt-1 text-xs text-gray-600">
                  Se o arquivo antigo usa nomes diferentes, selecione quais colunas vão para quais campos do sistema (o restante será ignorado).
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setHasCustomMapping(false);
                    setMapping(sanitizeMapping({ ...deriveDefaultMapping(sourceKeys), ...(loadSavedMapping() ?? {}) }, sourceKeys));
                    addToast('Mapeamento sugerido aplicado.', 'info');
                  }}
                >
                  Auto
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setHasCustomMapping(true);
                    setMapping(deriveDefaultMapping(sourceKeys));
                    addToast('Mapeamento resetado para o padrão detectado.', 'info');
                  }}
                >
                  Resetar
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {TARGET_FIELDS.map((f) => {
                const sample = (() => {
                  const k = mapping[f.key];
                  if (!k) return '';
                  for (const r of parsed) {
                    const v = String(r.raw[k] ?? '').trim();
                    if (v) return v.length > 32 ? `${v.slice(0, 32)}…` : v;
                  }
                  return '';
                })();

                return (
                  <div key={f.key} className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-800">
                        {f.label} {f.required ? <span className="text-rose-600">*</span> : null}
                      </div>
                      <div className="text-[11px] text-gray-500">{f.group === 'pessoa' ? 'Pessoa' : 'Endereço'}</div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                        value={mapping[f.key] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          setHasCustomMapping(true);
                          setMapping((m) => ({ ...m, [f.key]: v }));
                        }}
                      >
                        <option value="">(Não importar)</option>
                        {sourceKeys.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      Exemplo: <span className="font-mono">{sample || '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
        <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-800">Pré-visualização</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
              <span className="rounded-md bg-gray-100 px-2 py-1">
                {totals.total} linha(s) · {totals.valid} válida(s) · {totals.invalid} com erro
              </span>
              {duplicateKeys.length > 0 ? (
                <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-900">
                  {duplicateKeys.length} chave(s) repetida(s) na planilha
                </span>
              ) : null}
              {lastSummary ? (
                <span className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-900">
                  Última: {lastSummary.ok} ok, {lastSummary.failed} falharam
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium text-gray-700">Duplicidade:</div>
              <select
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                value={dedupeKey}
                onChange={(e) => setDedupeKey(e.target.value as DedupeKey)}
              >
                <option value="documento">Documento</option>
                <option value="email">E-mail</option>
              </select>
              <select
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                value={dedupeStrategy}
                onChange={(e) => setDedupeStrategy(e.target.value as DedupeStrategy)}
              >
                <option value="first">Manter primeira ocorrência</option>
                <option value="last">Manter última ocorrência</option>
                <option value="none">Importar todas</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={forceUppercase}
                onChange={(e) => setForceUppercase(e.target.checked)}
              />
              Maiúsculo (normalizar textos para CAIXA ALTA)
            </label>
            <div className="text-xs text-gray-500">Dica: corrija as linhas destacadas em vermelho antes de importar.</div>
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
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Doc</th>
                    <th className="px-3 py-2 text-left">Endereço</th>
                    <th className="px-3 py-2 text-left">Erros</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.slice(0, 80).map((r) => (
                    <tr key={r.line} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.line}</td>
                      <td className="px-3 py-2">{r.nome || '—'}</td>
                      <td className="px-3 py-2">{r.tipo}</td>
                      <td className="px-3 py-2">{r.doc || '—'}</td>
                      <td className="px-3 py-2">{r.enderecoResumo || '—'}</td>
                      <td className="px-3 py-2 text-rose-700">{r.errors.join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        ) : null}

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {step === 2 ? (
              <>
                Campos sem mapeamento não serão importados. Para dados legados, ajuste o mapeamento para trazer endereço e outros campos.
              </>
            ) : (
              <>Dica: você pode colar CSV ou enviar XLS/XLSX.</>
            )}
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
            {step === 2 ? (
              <Button type="button" onClick={() => void handleImport()} disabled={isImporting || totals.valid === 0}>
                {isImporting ? <Loader2 className="animate-spin" size={18} /> : null}
                <span className="ml-2">Importar</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
