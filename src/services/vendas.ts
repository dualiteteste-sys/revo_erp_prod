import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';
import { getPartners, savePartner } from './partners';
import { getProducts } from './products';

export type StatusVenda = 'orcamento' | 'aprovado' | 'cancelado' | 'concluido';

export type VendaPedido = {
  id: string;
  numero: number;
  cliente_id: string;
  cliente_nome?: string;
  data_emissao: string;
  data_entrega: string | null;
  status: StatusVenda;
  total_produtos: number;
  frete: number;
  desconto: number;
  total_geral: number;
  condicao_pagamento: string | null;
  observacoes: string | null;
  total_count?: number;
};

export type VendaItem = {
  id: string;
  pedido_id: string;
  produto_id: string;
  produto_nome?: string;
  produto_ncm?: string | null;
  produto_cfop?: string | null;
  produto_cst?: string | null;
  produto_csosn?: string | null;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  total: number;
  observacoes?: string | null;
};

export type VendaDetails = VendaPedido & {
  itens: VendaItem[];
};

export type VendaPayload = Partial<Omit<VendaPedido, 'numero' | 'total_produtos' | 'total_geral' | 'cliente_nome'>>;

/**
 * Lista pedidos de venda.
 * Nota: A RPC atual retorna todos os registros filtrados, sem paginação no servidor (limit/offset).
 */
export async function listVendas(search?: string, status?: string): Promise<VendaPedido[]> {
  return callRpc<VendaPedido[]>('vendas_list_pedidos', {
    p_search: search || null,
    p_status: status || null,
  });
}

export async function getVendaDetails(id: string): Promise<VendaDetails> {
  return callRpc<VendaDetails>('vendas_get_pedido_details', { p_id: id });
}

export async function saveVenda(payload: VendaPayload): Promise<VendaDetails> {
  return callRpc<VendaDetails>('vendas_upsert_pedido', { p_payload: payload });
}

export async function manageVendaItem(
  pedidoId: string,
  itemId: string | null,
  produtoId: string,
  quantidade: number,
  precoUnitario: number,
  desconto: number,
  action: 'add' | 'update' | 'remove' = 'add'
): Promise<void> {
  await callRpc('vendas_manage_item', {
    p_pedido_id: pedidoId,
    p_item_id: itemId,
    p_produto_id: produtoId,
    p_quantidade: quantidade,
    p_preco_unitario: precoUnitario,
    p_desconto: desconto,
    p_action: action,
  });
}

export async function aprovarVenda(id: string): Promise<void> {
  await callRpc('vendas_aprovar_pedido', { p_id: id });
}

export async function concluirVendaPedido(id: string): Promise<void> {
  await callRpc('vendas_concluir_pedido', { p_id: id, p_baixar_estoque: true });
}

export async function seedVendas(): Promise<void> {
  // 1. Buscar produtos ativos
  const { data: products } = await getProducts({ 
    page: 1, 
    pageSize: 100, 
    searchTerm: '', 
    status: 'ativo', 
    sortBy: { column: 'nome', ascending: true } 
  });
  
  if (products.length === 0) throw new Error('Cadastre produtos antes de gerar pedidos.');

  // 2. Buscar parceiros e filtrar clientes elegíveis
  // Usamos filterType: null para trazer todos e filtrar no JS, garantindo que 'ambos' também sejam considerados
  const { data: allPartners } = await getPartners({ 
    page: 1, 
    pageSize: 100, 
    searchTerm: '', 
    filterType: null, 
    sortBy: { column: 'nome', ascending: true } 
  });

  let eligibleClients = allPartners.filter(p => p.tipo === 'cliente' || p.tipo === 'ambos');

  // Se não houver clientes, cria um automaticamente para garantir integridade
  if (eligibleClients.length === 0) {
    const newClient = await savePartner({
      pessoa: {
        nome: `Cliente Exemplo ${faker.string.numeric(3)}`,
        tipo: 'cliente',
        tipo_pessoa: 'juridica',
        doc_unico: faker.string.numeric(14),
        email: faker.internet.email(),
        telefone: faker.phone.number(),
      },
      enderecos: [],
      contatos: []
    });
    
    // Adiciona à lista para ser usado imediatamente
    eligibleClients.push({
      id: newClient.id,
      nome: newClient.nome,
      tipo: newClient.tipo,
      doc_unico: newClient.doc_unico,
      created_at: newClient.created_at,
      updated_at: newClient.updated_at
    });
  }

  // 3. Gerar 5 Pedidos
  for (let i = 0; i < 5; i++) {
    const client = faker.helpers.arrayElement(eligibleClients);
    
    if (!client?.id) continue; // Safety check

    const targetStatus = faker.helpers.arrayElement(['orcamento', 'aprovado', 'concluido', 'cancelado']) as StatusVenda;
    
    // Criar sempre como orcamento primeiro para poder adicionar itens
    const payload: VendaPayload = {
      cliente_id: client.id,
      data_emissao: faker.date.recent({ days: 60 }).toISOString().split('T')[0],
      data_entrega: faker.date.soon({ days: 15 }).toISOString().split('T')[0],
      status: 'orcamento', 
      condicao_pagamento: faker.helpers.arrayElement(['30 dias', 'À vista', '30/60/90']),
      observacoes: faker.lorem.sentence(),
      frete: parseFloat(faker.finance.amount({ min: 0, max: 200, dec: 2 })),
      desconto: 0,
    };

    const savedOrder = await saveVenda(payload);

    // 4. Adicionar Itens (1 a 5 produtos)
    const numItems = faker.number.int({ min: 1, max: 5 });
    const selectedProducts = faker.helpers.arrayElements(products, numItems);

    for (const product of selectedProducts) {
      const qtd = faker.number.int({ min: 1, max: 10 });
      const preco = product.preco_venda || parseFloat(faker.finance.amount({ min: 10, max: 500, dec: 2 }));
      
      await manageVendaItem(
        savedOrder.id,
        null,
        product.id,
        qtd,
        preco,
        0, // desconto item
        'add'
      );
    }

    // 5. Atualizar status final se necessário
    if (targetStatus !== 'orcamento') {
      if (targetStatus === 'aprovado') {
        await aprovarVenda(savedOrder.id);
      } else {
        // Para outros status, tentamos atualizar diretamente
        await saveVenda({ id: savedOrder.id, status: targetStatus });
      }
    }
  }
}
