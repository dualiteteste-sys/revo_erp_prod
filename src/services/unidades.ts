import { supabase } from '../lib/supabase';

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
    const { data, error } = await supabase
        .from('unidades_medida')
        .select('*')
        .order('sigla');

    if (error) throw error;
    return data as UnidadeMedida[];
};

export const createUnidade = async (unidade: Omit<UnidadeMedida, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
        .from('unidades_medida' as any)
        .insert(unidade as any)
        .select()
        .single();

    if (error) throw error;
    return data as UnidadeMedida;
};

export const updateUnidade = async (id: string, unidade: Partial<UnidadeMedida>) => {
    const { data, error } = await supabase
        .from('unidades_medida' as any)
        // @ts-ignore
        .update(unidade as any)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data as UnidadeMedida;
};

export const deleteUnidade = async (id: string) => {
    const { error } = await supabase
        .from('unidades_medida' as any)
        .delete()
        .eq('id', id);

    if (error) throw error;
};
