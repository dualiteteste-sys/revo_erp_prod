import { supabase } from '@/lib/supabaseClient';

/**
 * Inicia o processo de checkout para um plano de assinatura.
 * @param empresaId - O ID da empresa que está assinando.
 * @param planSlug - O slug do plano (ex: "PRO").
 * @param cycle - O ciclo de faturamento ('monthly' ou 'yearly').
 * @param trial - Se o checkout deve incluir um período de teste.
 */
export async function startCheckout(
  empresaId: string,
  planSlug: "START" | "PRO" | "MAX" | "ULTRA",
  cycle: "monthly" | "yearly",
  trial?: boolean
) {
  // 1. Obter a sessão para garantir que o token JWT seja anexado automaticamente
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Usuário não autenticado. Por favor, faça login para continuar.");
  }

  // 2. Preparar o payload para a função
  const payload = { 
    empresa_id: empresaId, 
    plan_slug: planSlug, 
    billing_cycle: cycle, 
    ...(trial && { trial: true }) 
  };

  console.log('[billing] invoking function "billing-checkout" with payload:', payload);

  // 3. Invocar a Edge Function usando o SDK do Supabase
  const { data, error } = await supabase.functions.invoke('billing-checkout', {
    body: payload,
  });

  // 4. Lidar com erros da invocação
  if (error) {
    console.error('[billing] supabase.functions.invoke error:', error);
    throw new Error(error.message || 'Ocorreu um erro ao iniciar o checkout.');
  }

  // 5. Lidar com a resposta
  const checkoutUrl = data?.url;
  if (!checkoutUrl) {
    console.error('[billing] No checkout URL in response:', data);
    throw new Error('Resposta da função não contém a URL do Stripe Checkout.');
  }

  // 6. Redirecionar para o Stripe em uma nova aba para contornar restrições de CSP
  window.open(checkoutUrl, '_blank');
}
