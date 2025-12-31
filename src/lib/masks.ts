export const cpfMask = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .slice(0, 14); // 11 digits + 3 formatting chars
};

export const cnpjMask = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18); // 14 digits + 4 formatting chars
};

export const cepMask = (value: string) => {
    return value
        .replace(/\D/g, '')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 9); // 8 digits + 1 formatting char
}

/**
 * Applies CPF or CNPJ mask based on the length of the input value.
 */
export const documentMask = (value: string) => {
  const cleanedValue = value.replace(/\D/g, '');
  if (cleanedValue.length <= 11) {
    return cpfMask(cleanedValue);
  }
  return cnpjMask(cleanedValue);
};

export const phoneMask = (value: string) => {
    if (!value) return "";
    const cleaned = value.replace(/\D/g, '');
    const length = cleaned.length;
    if (length <= 10) { // (XX) XXXX-XXXX
        return cleaned
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2')
            .slice(0, 14);
    }
    // (XX) XXXXX-XXXX
    return cleaned
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 15);
};

export function isValidCPF(value: string): boolean {
  const cpf = (value || '').replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;

  const calcDigit = (base: string, factor: number) => {
    let total = 0;
    for (let i = 0; i < base.length; i++) {
      total += Number(base[i]) * (factor - i);
    }
    const mod = total % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calcDigit(cpf.slice(0, 9), 10);
  const d2 = calcDigit(cpf.slice(0, 10), 11);
  return cpf.endsWith(`${d1}${d2}`);
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = (value || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    let total = 0;
    for (let i = 0; i < base.length; i++) {
      total += Number(base[i]) * weights[i];
    }
    const mod = total % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(cnpj.slice(0, 12), w1);
  const d2 = calcDigit(cnpj.slice(0, 13), w2);
  return cnpj.endsWith(`${d1}${d2}`);
}

export function isValidCpfOrCnpj(value: string): boolean {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return true; // opcional
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
}
