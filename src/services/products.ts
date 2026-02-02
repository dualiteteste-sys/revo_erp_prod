import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';
import { normalizeProductPayload } from './products.normalize';
import { validatePackaging, validateProductCore } from './products.validate';

// Type for the product list, now derived from the RPC's return type.
export type Product = {
  id: string;
  nome: string | null;
  sku: string | null;
  slug: string | null;
  status: "ativo" | "inativo" | null;
  preco_venda: number | null;
  unidade: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Type for the full product data, used in forms
export type FullProduct = Database['public']['Tables']['produtos']['Row'];

// Type for the payload sent to create/update functions
export type ProductPayload = Partial<FullProduct>;

/**
 * Fetches a paginated, sorted, and filtered list of products using RPCs.
 */
export async function getProducts(options: {
  page: number;
  pageSize: number;
  searchTerm: string;
  status: 'ativo' | 'inativo' | null;
  sortBy: { column: keyof Product; ascending: boolean };
}): Promise<{ data: Product[]; count: number }> {
  const { page, pageSize, searchTerm, status, sortBy } = options;

  const offset = (page - 1) * pageSize;
  const orderString = `${sortBy.column} ${sortBy.ascending ? 'asc' : 'desc'}`;

  try {
    const count = await callRpc<number>('produtos_count_for_current_user', {
        p_q: searchTerm || null,
        p_status: status,
    });

    if (Number(count) === 0) {
        return { data: [], count: 0 };
    }
    
    const data = await callRpc<Product[]>('produtos_list_for_current_user', {
        p_limit: pageSize,
        p_offset: offset,
        p_q: searchTerm || null,
        p_status: status,
        p_order: orderString,
    });

    return { data: data ?? [], count: Number(count) };
  } catch (error) {
    console.error('[SERVICE] [GET_PRODUCTS_RPC] error:', error);
    throw new Error('Não foi possível listar os produtos.');
  }
}


/**
 * Fetches the full details of a single product for editing.
 * Returns null if it's a legacy product that can't be edited from the 'produtos' table.
 */
export async function getProductDetails(id: string): Promise<FullProduct | null> {
  try {
    const data = await callRpc<FullProduct | null>('produtos_get_for_current_user', { p_id: id });
    return (data ?? null) as FullProduct | null;
  } catch (error: any) {
    const msg = String(error?.message ?? '');
    // compat: produto inexistente/legado => null
    if (/not found|não encontrada|nao encontrada|P0002/i.test(msg)) return null;
    console.error('[SERVICE] [GET_PRODUCT_DETAILS_RPC] error:', error);
    throw new Error('Erro ao buscar detalhes do produto.');
  }
}

/**
 * Creates or updates a product using the secure RPCs.
 */
export async function saveProduct(productData: ProductPayload, empresaId: string): Promise<FullProduct> {
  const normalizedPayload = normalizeProductPayload({ ...productData, empresa_id: empresaId });
  
  const validationErrors = [...validateProductCore(normalizedPayload), ...validatePackaging(normalizedPayload)];
  if (validationErrors.length > 0) {
    const error = new Error(`[VALIDATION] ${validationErrors.join(' | ')}`);
    (error as any).code = 'CLIENT_VALIDATION';
    throw error;
  }

  try {
    if (normalizedPayload.id) {
      const { id, ...patch } = normalizedPayload;
      const data = await callRpc<FullProduct>('update_product_for_current_user', {
        p_id: id,
        patch: patch as any,
      });
      return data;
    } else {
      const data = await callRpc<FullProduct>('create_product_for_current_user', {
        payload: normalizedPayload as any,
      });
      return data;
    }
  } catch (error: any) {
    console.error('[RPC] [SAVE_PRODUCT] error:', error);
    const msg = String(error?.message ?? '');
    const code = String(error?.code ?? '');
    // UX "estado da arte": se SKU já existe, sugerir automaticamente o próximo e orientar o usuário.
    if ((code === '23505' || /duplicate key/i.test(msg)) && /idx_produtos_empresa_sku_unique/i.test(msg)) {
      const currentSku = String(normalizedPayload?.sku ?? '').trim();
      try {
        const suggested = await callRpc<string>('produtos_sku_suggest_next_for_current_user', {
          p_current_sku: currentSku,
          p_width: 3,
        } as any);
        const nice = suggested && suggested !== currentSku ? ` Sugestão: ${suggested}.` : '';
        throw new Error(`SKU já existe nesta empresa.${nice} Altere o SKU e tente novamente.`);
      } catch {
        throw new Error('SKU já existe nesta empresa. Altere o SKU e tente novamente.');
      }
    }
    throw new Error(msg || 'Não foi possível salvar o produto.');
  }
}

/**
 * Deletes a product using the secure RPC.
 */
export async function deleteProductById(productId: string): Promise<void> {
  try {
    await callRpc('delete_product_for_current_user', { p_id: productId });
  } catch (error: any) {
    console.error('[RPC] [DELETE_PRODUCT] error:', error);
    throw new Error('Não foi possível excluir o produto.');
  }
}

/**
 * Clones a product using the secure RPC.
 */
export async function cloneProduct(
  productId: string,
  overrides?: { nome?: string; sku?: string }
): Promise<FullProduct> {
  const data = await callRpc<FullProduct>('create_product_clone_for_current_user', {
    p_source_product_id: productId,
    p_overrides: overrides || {},
  });
  return data;
}

export async function seedDefaultProducts(): Promise<FullProduct[]> {
  console.log('[RPC] seed_products_for_current_user');
  return callRpc<FullProduct[]>('seed_products_for_current_user');
}
