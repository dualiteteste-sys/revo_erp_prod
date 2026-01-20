import { Database } from '../types/database.types';
import { callRpc } from '@/lib/api';

export type Embalagem = Database['public']['Tables']['embalagens']['Row'];
export type EmbalagemInsert = Database['public']['Tables']['embalagens']['Insert'];
export type EmbalagemUpdate = Database['public']['Tables']['embalagens']['Update'];

export const listEmbalagens = async (search?: string) => {
    const data = await callRpc<Embalagem[]>('embalagens_list_for_current_empresa', {
        p_search: search || null,
        p_limit: 2000,
    });
    return (data ?? []) as Embalagem[];
};

export const getEmbalagem = async (id: string) => {
    return callRpc<Embalagem>('embalagens_get_for_current_empresa', { p_id: id });
};

export const createEmbalagem = async (embalagem: EmbalagemInsert) => {
    return callRpc<Embalagem>('embalagens_upsert_for_current_empresa', { p_payload: embalagem as any });
};

export const updateEmbalagem = async (id: string, embalagem: EmbalagemUpdate) => {
    return callRpc<Embalagem>('embalagens_upsert_for_current_empresa', { p_payload: { ...embalagem, id } as any });
};

export const deleteEmbalagem = async (id: string) => {
    await callRpc('embalagens_delete_for_current_empresa', { p_id: id });
};
