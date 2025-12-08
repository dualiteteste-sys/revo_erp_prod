import { supabase } from '../lib/supabaseClient';
import { Database } from '../types/database.types';

export type Embalagem = Database['public']['Tables']['embalagens']['Row'];
export type EmbalagemInsert = Database['public']['Tables']['embalagens']['Insert'];
export type EmbalagemUpdate = Database['public']['Tables']['embalagens']['Update'];

export const listEmbalagens = async (search?: string) => {
    let query = supabase
        .from('embalagens')
        .select('*')
        .order('nome');

    if (search) {
        query = query.ilike('nome', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
};

export const getEmbalagem = async (id: string) => {
    const { data, error } = await supabase
        .from('embalagens')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
};

export const createEmbalagem = async (embalagem: EmbalagemInsert) => {
    const { data, error } = await supabase
        .from('embalagens')
        .insert(embalagem)
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const updateEmbalagem = async (id: string, embalagem: EmbalagemUpdate) => {
    const { data, error } = await supabase
        .from('embalagens')
        .update(embalagem)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const deleteEmbalagem = async (id: string) => {
    const { error } = await supabase
        .from('embalagens')
        .delete()
        .eq('id', id);
    if (error) throw error;
};
