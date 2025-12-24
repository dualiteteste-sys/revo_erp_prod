import { supabase } from '@/lib/supabase';
import { callRpc } from '@/lib/api';

export type RecebimentoStatus = 'pendente' | 'em_conferencia' | 'divergente' | 'concluido' | 'cancelado';

export type Recebimento = {
    id: string;
    empresa_id: string;
    fiscal_nfe_import_id: string;
    status: RecebimentoStatus;
    classificacao?: 'estoque_proprio' | 'material_cliente' | null;
    cliente_id?: string | null;
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
        pedido_numero?: string | null;
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
        ucom?: string | null;
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
        total_nf,
        pedido_numero
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
        total_nf,
        pedido_numero
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
        ean,
        ucom
      )
    `)
        .eq('recebimento_id', recebimentoId);

    if (error) throw error;
    return data as RecebimentoItem[];
}

export type CreateRecebimentoFromXmlStatus = 'created' | 'exists' | 'reopened';

export async function createRecebimentoFromXml(importId: string): Promise<{ id: string; status: CreateRecebimentoFromXmlStatus }> {
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

export type FinalizarRecebimentoResult = {
    status: string;
    message: string;
    materiais_cliente_sync?: {
        status?: string;
        reason?: string;
        error?: string;
        upserted?: number;
        cliente_id?: string;
    };
};

export async function finalizarRecebimentoV2(id: string): Promise<FinalizarRecebimentoResult> {
    return callRpc('finalizar_recebimento', { p_recebimento_id: id });
}

export async function setRecebimentoClassificacao(
    recebimentoId: string,
    classificacao: 'estoque_proprio' | 'material_cliente',
    clienteId?: string | null
): Promise<{ status: string; classificacao: string; cliente_id?: string | null }> {
    return callRpc('recebimento_set_classificacao', {
        p_recebimento_id: recebimentoId,
        p_classificacao: classificacao,
        p_cliente_id: clienteId ?? null,
    });
}

export async function syncMateriaisClienteFromRecebimento(
    recebimentoId: string
): Promise<{ status: string; reason?: string; error?: string; upserted?: number; cliente_id?: string }> {
    try {
        return await callRpc('recebimento_sync_materiais_cliente', { p_recebimento_id: recebimentoId });
    } catch (e: any) {
        const msg = String(e?.message || '');
        if (/no unique or exclusion constraint matching the ON CONFLICT specification/i.test(msg)) {
            throw new Error(
                'O banco de dados ainda não está com o índice necessário para sincronizar Materiais de Clientes. ' +
                    'Atualize as migrations do Supabase e tente novamente.'
            );
        }
        throw e;
    }
}

export async function deleteRecebimento(recebimentoId: string, opts?: { force?: boolean }): Promise<void> {
    await callRpc('recebimento_delete', { p_recebimento_id: recebimentoId, p_force: opts?.force ?? false });
}

export async function cancelarRecebimento(recebimentoId: string, motivo?: string | null): Promise<{ status: string }> {
    return callRpc('recebimento_cancelar', {
        p_recebimento_id: recebimentoId,
        p_motivo: motivo ?? null,
    });
}

export async function updateRecebimentoItemProduct(itemId: string, productId: string | null): Promise<void> {
    const { error } = await supabase
        .from('recebimento_itens')
        .update({ produto_id: productId })
        .eq('id', itemId);

    if (error) throw error;
}
