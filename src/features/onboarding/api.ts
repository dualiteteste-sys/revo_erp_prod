import { supabase } from '@/lib/supabaseClient';

export type ProvisionEmpresaInput = {
  razao_social: string;
  fantasia: string;
  email?: string | null;
};

export type Empresa = {
  id: string;
  created_at: string;
  updated_at: string | null;
  razao_social: string | null;
  fantasia: string | null;
  cnpj: string | null;
  logotipo_url: string | null;
  telefone: string | null;
  email: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_uf: string | null;
  endereco_cep: string | null;
  stripe_customer_id: string | null;
};

export async function provisionEmpresa(input: ProvisionEmpresaInput): Promise<Empresa> {
  // Verifica sessão (JWT) antes de chamar a RPC
  const { data: sessionRes } = await supabase.auth.getSession();
  const hasJWT = !!sessionRes?.session?.access_token;
  console.log('[ONBOARD] hasJWT:', hasJWT, 'input:', input);
  if (!hasJWT) throw new Error('NO_SESSION: usuário não autenticado.');

  const { data, error } = await supabase.rpc('provision_empresa_for_current_user', {
    p_razao_social: input.razao_social,
    p_fantasia: input.fantasia,
    p_email: input.email ?? null,
  }).single();

  if (error) {
    console.error('[ONBOARD] RPC provision_empresa_for_current_user error', error);
    throw error;
  }

  // Retorna a empresa criada (usar para setar activeEmpresa)
  return data as unknown as Empresa;
}
