export type ImportFieldMapping<K extends string> = Record<K, string | null>;

export function makeEmptyMapping<K extends string>(targetKeys: readonly K[]): ImportFieldMapping<K> {
  const out = {} as ImportFieldMapping<K>;
  for (const k of targetKeys) out[k] = null;
  return out;
}

export function deriveDefaultMapping<K extends string>(params: {
  targetKeys: readonly K[];
  sourceKeys: string[];
  synonyms: Record<K, string[]>;
}): ImportFieldMapping<K> {
  const keysSet = new Set(params.sourceKeys);
  const out = makeEmptyMapping(params.targetKeys);
  for (const k of params.targetKeys) {
    const candidates = params.synonyms[k] ?? [];
    const found = candidates.find((c) => keysSet.has(c)) ?? null;
    out[k] = found;
  }
  return out;
}

export function sanitizeMapping<K extends string>(mapping: ImportFieldMapping<K>, sourceKeys: string[]): ImportFieldMapping<K> {
  const keysSet = new Set(sourceKeys);
  const out = { ...mapping } as ImportFieldMapping<K>;
  (Object.keys(out) as K[]).forEach((k) => {
    const v = out[k];
    if (v && !keysSet.has(v)) out[k] = null;
  });
  return out;
}

export function loadSavedMapping<K extends string>(storageKey: string, targetKeys: readonly K[]): ImportFieldMapping<K> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImportFieldMapping<K>>;
    const base = makeEmptyMapping(targetKeys);
    (Object.keys(base) as K[]).forEach((k) => {
      const v = parsed[k];
      base[k] = typeof v === 'string' ? v : null;
    });
    return base;
  } catch {
    return null;
  }
}

export function saveMapping(storageKey: string, mapping: Record<string, string | null>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(mapping));
  } catch {
    // ignore
  }
}

export function resolveMappedField<K extends string>(params: {
  row: Record<string, string>;
  key: K;
  mapping: ImportFieldMapping<K>;
  synonyms: Record<K, string[]>;
  getFirst: (row: Record<string, string>, keys: string[]) => string;
}): string {
  const mapped = params.mapping[params.key];
  if (mapped) return String(params.row[mapped] ?? '').trim();
  return params.getFirst(params.row, params.synonyms[params.key] ?? []);
}

export function upperPtBr(raw: string) {
  try {
    return raw.toLocaleUpperCase('pt-BR');
  } catch {
    return raw.toUpperCase();
  }
}

