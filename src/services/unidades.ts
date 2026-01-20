import { callRpc } from '@/lib/api';

export interface UnidadeMedida {
  id: string;
  empresa_id: string | null;
  sigla: string;
  descricao: string;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

export const listUnidades = async () => {
  const data = await callRpc<UnidadeMedida[]>('unidades_medida_list_for_current_user');
  return (data ?? []) as UnidadeMedida[];
};

export const createUnidade = async (
  unidade: Omit<UnidadeMedida, 'id' | 'created_at' | 'updated_at'>,
) => {
  const data = await callRpc<UnidadeMedida>('unidades_medida_upsert_for_current_user', {
    p_id: null,
    p_sigla: unidade.sigla,
    p_descricao: unidade.descricao,
    p_ativo: unidade.ativo,
  });
  return data as UnidadeMedida;
};

export const updateUnidade = async (
  id: string,
  unidade: Partial<UnidadeMedida>,
) => {
  if (!unidade.sigla || !unidade.descricao) {
    throw new Error('Sigla e descrição são obrigatórias para atualizar a unidade.');
  }
  const data = await callRpc<UnidadeMedida>('unidades_medida_upsert_for_current_user', {
    p_id: id,
    p_sigla: unidade.sigla,
    p_descricao: unidade.descricao,
    p_ativo: typeof unidade.ativo === 'boolean' ? unidade.ativo : null,
  });
  return data as UnidadeMedida;
};

export const deleteUnidade = async (id: string) => {
  await callRpc('unidades_medida_delete_for_current_user', { p_id: id });
};
