export type CapturedNetworkError = {
  at: string;
  requestId?: string;
  url: string;
  method: string;
  status: number;
  isRpc: boolean;
  isEdgeFn: boolean;
  responseText?: string;
};

const MAX_ITEMS = 8;
const MAX_TEXT = 4000;

let buffer: CapturedNetworkError[] = [];

function safeTruncate(text: string) {
  if (text.length <= MAX_TEXT) return text;
  return `${text.slice(0, MAX_TEXT)}…`;
}

export function recordNetworkError(input: CapturedNetworkError) {
  const item: CapturedNetworkError = {
    ...input,
    responseText: input.responseText ? safeTruncate(input.responseText) : undefined,
  };

  buffer = [item, ...buffer].slice(0, MAX_ITEMS);
}

export function getRecentNetworkErrors() {
  return [...buffer];
}

export function clearRecentNetworkErrors() {
  buffer = [];
}

