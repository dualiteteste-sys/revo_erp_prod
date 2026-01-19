import { callRpc } from '@/lib/api';

export type RecebimentoStatus = 'pendente' | 'em_conferencia' | 'divergente' | 'concluido' | 'cancelado';

export type Recebimento = {
    id: string;
    empresa_id: string;
    fiscal_nfe_import_id: string;
    status: RecebimentoStatus;
    classificacao?: 'estoque_proprio' | 'material_cliente' | null;
    cliente_id?: string | null;
    custo_frete?: number;
    custo_seguro?: number;
    custo_impostos?: number;
    custo_outros?: number;
    rateio_base?: 'valor' | 'quantidade';
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

function unwrapRpcRow<T>(data: unknown, key: string): T {
    if (data && typeof data === 'object' && key in (data as any)) {
        return (data as any)[key] as T;
    }
    return data as T;
}

function unwrapRpcRows<T>(data: unknown, key: string): T[] {
    if (!Array.isArray(data)) return (data ?? []) as T[];
    if (data.length && data[0] && typeof data[0] === 'object' && key in (data[0] as any)) {
        return (data as any[]).map((row) => (row as any)[key]) as T[];
    }
    return data as T[];
}

export async function listRecebimentos(status?: RecebimentoStatus): Promise<Recebimento[]> {
    const rows = await callRpc('suprimentos_recebimentos_list', {
        p_status: status ?? null,
    });
    return unwrapRpcRows<Recebimento>(rows, 'suprimentos_recebimentos_list');
}

export async function getRecebimento(id: string): Promise<Recebimento> {
    const row = await callRpc('suprimentos_recebimento_get', { p_recebimento_id: id });
    return unwrapRpcRow<Recebimento>(row, 'suprimentos_recebimento_get');
}

export async function listRecebimentoItens(recebimentoId: string): Promise<RecebimentoItem[]> {
    const rows = await callRpc('suprimentos_recebimento_itens_list', { p_recebimento_id: recebimentoId });
    return unwrapRpcRows<RecebimentoItem>(rows, 'suprimentos_recebimento_itens_list');
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
    await callRpc('suprimentos_recebimento_item_set_produto', {
        p_recebimento_item_id: itemId,
        p_produto_id: productId,
    });
}

export async function updateRecebimentoCustos(
    recebimentoId: string,
    patch: {
        custo_frete?: number;
        custo_seguro?: number;
        custo_impostos?: number;
        custo_outros?: number;
        rateio_base?: 'valor' | 'quantidade';
    }
): Promise<Recebimento> {
    const row = await callRpc('suprimentos_recebimento_update_custos', {
        p_recebimento_id: recebimentoId,
        p_custo_frete: patch.custo_frete ?? null,
        p_custo_seguro: patch.custo_seguro ?? null,
        p_custo_impostos: patch.custo_impostos ?? null,
        p_custo_outros: patch.custo_outros ?? null,
        p_rateio_base: patch.rateio_base ?? null,
    });
    return unwrapRpcRow<Recebimento>(row, 'suprimentos_recebimento_update_custos');
}
