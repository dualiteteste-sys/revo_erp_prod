import { supabase } from '@/lib/supabaseClient';

export interface ProdutoGrupo {
    id: string;
    nome: string;
    parent_id?: string | null;
    parent_nome?: string | null;
    created_at?: string;
}

export interface ProdutoGrupoPayload {
    id?: string;
    nome: string;
    parent_id?: string | null;
}

export async function listProdutoGrupos(search?: string): Promise<ProdutoGrupo[]> {
    // @ts-ignore
    const { data, error } = await supabase.rpc('list_produto_grupos', {
        p_search: search || null
    });

    if (error) throw error;
    return data || [];
}

export async function upsertProdutoGrupo(payload: ProdutoGrupoPayload): Promise<ProdutoGrupo> {
    // @ts-ignore
    const { data, error } = await supabase.rpc('upsert_produto_grupo', {
        p_payload: payload
    });

    if (error) throw error;
    return data;
}

export async function deleteProdutoGrupo(id: string): Promise<void> {
    // @ts-ignore
    const { error } = await supabase.rpc('delete_produto_grupo', {
        p_id: id
    });

    if (error) throw error;
}
