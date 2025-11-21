import axios from 'axios';

// --- CNPJ (BrasilAPI) ---
interface CnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  ddd_telefone_1: string;
}

export const fetchCnpjData = async (cnpj: string): Promise<Partial<CnpjData>> => {
  const cleanedCnpj = cnpj.replace(/\D/g, '');
  if (cleanedCnpj.length !== 14) {
    throw new Error('CNPJ inválido. Deve conter 14 dígitos.');
  }
  try {
    const { data } = await axios.get<CnpjData>(`https://brasilapi.com.br/api/cnpj/v1/${cleanedCnpj}`);
    return data;
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      throw new Error('CNPJ não encontrado na base da Receita Federal.');
    }
    throw new Error('Falha ao consultar o CNPJ. Verifique sua conexão.');
  }
};


// --- CEP (ViaCEP) ---
export interface CepData {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string; // cidade
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}

export const fetchCepData = async (cep: string): Promise<Partial<CepData>> => {
  const cleanedCep = cep.replace(/\D/g, '');
  if (cleanedCep.length !== 8) {
    throw new Error('CEP inválido. Deve conter 8 dígitos.');
  }
  try {
    const { data } = await axios.get<CepData>(`https://viacep.com.br/ws/${cleanedCep}/json/`);
    if (data.erro) {
      throw new Error('CEP não encontrado.');
    }
    return data;
  } catch (error: any) {
    throw new Error(error.message || 'Falha ao consultar o CEP.');
  }
};
