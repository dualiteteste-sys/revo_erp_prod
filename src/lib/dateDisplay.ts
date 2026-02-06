const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatDatePtBR(
  value?: string | null,
  options?: { timeZone?: string },
): string {
  if (!value) return '—';

  // Date-only values coming from Postgres `date` should be rendered as-is
  // (no timezone shift).
  if (ISO_DATE_ONLY_RE.test(value)) {
    const [yyyy, mm, dd] = value.split('-');
    if (!yyyy || !mm || !dd) return value;
    return `${dd}/${mm}/${yyyy}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const timeZone = options?.timeZone ?? 'America/Sao_Paulo';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

