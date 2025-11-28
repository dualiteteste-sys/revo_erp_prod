import { supabase } from '@/lib/supabase';
import { callRpc } from '@/lib/api';

export type RecebimentoStatus = 'pendente' | 'em_conferencia' | 'divergente' | 'concluido' | 'cancelado';

export type Recebimento = {
    id: string;
    empresa_id: string;
    fiscal_nfe_import_id: string;
    status: RecebimentoStatus;
    data_recebimento: string;
    responsavel_id: string | null;
    observacao: string | null;
    created_at: string;
    updated_at: string;
    // Joins
    fiscal_nfe_imports?: {
        chave_acesso: string;
        emitente_nome: string;
        emitente_cnpj: string; // Adicionado
        numero: string;
        serie: string;
        total_nf: number;
    };
};

export type RecebimentoItem = {
    id: string;
    recebimento_id: string;
    fiscal_nfe_item_id: string;
    produto_id: string | null;
    quantidade_xml: number;
    quantidade_conferida: number;
    status: 'pendente' | 'ok' | 'divergente';
    // Joins
    produtos?: {
        nome: string;
        sku: string | null;
        unidade: string;
    };
    fiscal_nfe_import_items?: {
        xprod: string;
        cprod: string;
        ean: string;
    };
};

export async function listRecebimentos(status?: RecebimentoStatus): Promise<Recebimento[]> {
    let query = supabase
        .from('recebimentos')
        .select(`
      *,
      fiscal_nfe_imports (
        chave_acesso,
        emitente_nome,
        emitente_cnpj,
        numero,
        serie,
        total_nf
      )
    `)
        .order('created_at', { ascending: false });

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Recebimento[];
}

export async function getRecebimento(id: string): Promise<Recebimento> {
    const { data, error } = await supabase
        .from('recebimentos')
        .select(`
      *,
      fiscal_nfe_imports (
        chave_acesso,
        emitente_nome,
        emitente_cnpj,
        numero,
        serie,
        total_nf
      )
    `)
        .eq('id', id)
        .single();

    if (error) throw error;
    return data as Recebimento;
}

export async function listRecebimentoItens(recebimentoId: string): Promise<RecebimentoItem[]> {
    const { data, error } = await supabase
        .from('recebimento_itens')
        .select(`
      *,
      produtos (
        nome,
        sku,
        unidade
      ),
      fiscal_nfe_import_items (
        xprod,
        cprod,
        ean
      )
    `)
        .eq('recebimento_id', recebimentoId);

    if (error) throw error;
    return data as RecebimentoItem[];
}

export async function createRecebimentoFromXml(importId: string): Promise<{ id: string; status: string }> {
    return callRpc('create_recebimento_from_xml', { p_import_id: importId });
}

export async function conferirItem(itemId: string, quantidade: number): Promise<void> {
    return callRpc('conferir_item_recebimento', {
        p_recebimento_item_id: itemId,
        p_quantidade: quantidade
    });
}

export async function finalizarRecebimento(id: string): Promise<{ status: string; message: string }> {
    return callRpc('finalizar_recebimento', { p_recebimento_id: id });
}

export async function updateRecebimentoItemProduct(itemId: string, productId: string | null): Promise<void> {
    const { error } = await supabase
        .from('recebimento_itens')
        .update({ produto_id: productId })
        .eq('id', itemId);

    if (error) throw error;
}
