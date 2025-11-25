import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amountInCents: number) {
  const amount = amountInCents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

export function classNames(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Remove caracteres não numéricos para exibição de números de ordem.
 * Garante que prefixos como '#' sejam removidos.
 */
export function formatOrderNumber(num: number | string | undefined | null): string {
  if (num === undefined || num === null) return '';
  return String(num).replace(/[^0-9]/g, '');
}
