import { supabase } from "@/lib/supabaseClient";

export type FiscalNfeFocusAction = "emitir" | "consultar" | "cancelar";

export type FiscalNfeFocusActionInput = {
  empresa_id: string;
  emissao_id: string;
  action: FiscalNfeFocusAction;
  justificativa?: string | null;
};

export type FiscalNfeFocusActionResult = {
  ok: boolean;
  action: FiscalNfeFocusAction;
  emissao_id: string;
  status: string;
  provider_status?: string | null;
  status_code?: number;
  message?: string;
  response?: Record<string, unknown>;
  request_id?: string;
};

export async function runFiscalNfeFocusAction(input: FiscalNfeFocusActionInput) {
  const { data, error } = await supabase.functions.invoke("focusnfe-emissao", {
    body: {
      empresa_id: input.empresa_id,
      emissao_id: input.emissao_id,
      action: input.action,
      justificativa: input.justificativa ?? null,
    },
  });
  if (error) throw error;
  return data as FiscalNfeFocusActionResult;
}
