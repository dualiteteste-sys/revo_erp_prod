export type SortDir = 'asc' | 'desc';

export type SortState<Id extends string = string> = {
  column: Id;
  direction: SortDir;
} | null;

export type SortValueType = 'string' | 'number' | 'boolean' | 'date' | 'custom';

export type SortColumnDef<Row, Id extends string = string> = {
  id: Id;
  type?: SortValueType;
  getValue: (row: Row) => unknown;
  compare?: (a: unknown, b: unknown) => number;
  nulls?: 'first' | 'last';
};

function isNullish(v: unknown) {
  return v === null || v === undefined || v === '';
}

function dirMul(dir: SortDir) {
  return dir === 'asc' ? 1 : -1;
}

function compareNulls(a: unknown, b: unknown, nulls: 'first' | 'last') {
  const aN = isNullish(a);
  const bN = isNullish(b);
  if (aN && bN) return 0;
  if (aN) return nulls === 'first' ? -1 : 1;
  if (bN) return nulls === 'first' ? 1 : -1;
  return 0;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const normalized = v.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toTime(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function defaultCompare(type: SortValueType, a: unknown, b: unknown) {
  if (type === 'boolean') return Number(Boolean(a)) - Number(Boolean(b));

  if (type === 'number') {
    const an = toNumber(a);
    const bn = toNumber(b);
    if (an === null && bn === null) return 0;
    if (an === null) return -1;
    if (bn === null) return 1;
    return an - bn;
  }

  if (type === 'date') {
    const at = toTime(a);
    const bt = toTime(b);
    if (at === null && bt === null) return 0;
    if (at === null) return -1;
    if (bt === null) return 1;
    return at - bt;
  }

  // string (default)
  const as = String(a ?? '');
  const bs = String(b ?? '');
  return as.localeCompare(bs, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function toggleSort<Id extends string>(prev: SortState<Id>, column: Id): SortState<Id> {
  if (!prev || prev.column !== column) return { column, direction: 'asc' };
  return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
}

export function sortRows<Row, Id extends string>(
  rows: Row[],
  sort: SortState<Id>,
  columns: readonly SortColumnDef<Row, Id>[]
): Row[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.id === sort.column);
  if (!col) return rows;

  const dir = dirMul(sort.direction);
  const type = col.type ?? 'string';
  const compare = col.compare ?? ((a: unknown, b: unknown) => defaultCompare(type, a, b));
  const nulls = col.nulls ?? (type === 'number' || type === 'date' ? 'last' : 'last');

  const withIndex = rows.map((row, idx) => ({ row, idx }));
  withIndex.sort((ra, rb) => {
    const av = col.getValue(ra.row);
    const bv = col.getValue(rb.row);

    const n = compareNulls(av, bv, nulls);
    if (n !== 0) return n * dir;

    const c = compare(av, bv);
    if (c !== 0) return c * dir;

    return ra.idx - rb.idx; // stable
  });
  return withIndex.map((x) => x.row);
}

