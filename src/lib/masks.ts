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
