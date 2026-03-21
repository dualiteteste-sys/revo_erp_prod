import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

export type NfceSubmitResult = {
  ok: boolean;
  status?: string;
  error?: string;
  detail?: string;
  focus_response?: any;
  chave_acesso?: string;
  numero?: number;
};

/** Creates an NFC-e draft from a finalized PDV sale. Returns emissao_id. */
export async function createNfceDraftFromPdv(pedidoId: string): Promise<string> {
  return callRpc<string>('vendas_pdv_nfce_create_draft', {
    p_pedido_id: pedidoId,
  });
}

/** Submits an NFC-e draft to SEFAZ via Focus NFe. */
export async function submitNfce(emissaoId: string): Promise<NfceSubmitResult> {
  const { data, error } = await supabase.functions.invoke('focusnfe-nfce-emit', {
    body: { emissao_id: emissaoId },
  });

  if (error) {
    try {
      const ctx = (error as any)?.context;
      if (ctx instanceof Response) {
        const body = await ctx.json();
        if (body && typeof body === 'object') return body as NfceSubmitResult;
      }
    } catch { /* ignore */ }

    try {
      const msg = (error as any)?.message;
      if (msg && msg.startsWith('{')) {
        const parsed = JSON.parse(msg);
        if (parsed && typeof parsed === 'object') return parsed as NfceSubmitResult;
      }
    } catch { /* ignore */ }

    return { ok: false, error: 'EDGE_ERROR', detail: (error as any)?.message || String(error) };
  }
  return data as NfceSubmitResult;
}

/** Polls NFC-e status (reuses focusnfe-status which handles modelo 65). */
export async function checkNfceStatus(emissaoId: string): Promise<NfceSubmitResult> {
  const { data, error } = await supabase.functions.invoke('focusnfe-status', {
    body: { emissao_id: emissaoId },
  });
  if (error) {
    return { ok: false, error: 'EDGE_ERROR', detail: (error as any)?.message || String(error) };
  }
  return data as NfceSubmitResult;
}

/** Checks if the current empresa has NFC-e configured (CSC present). */
export async function checkNfceEnabled(): Promise<boolean> {
  try {
    const result = await callRpc<{ csc_configured: boolean }>('fiscal_nfce_check_enabled', {});
    return result?.csc_configured ?? false;
  } catch {
    return false;
  }
}

/** Calculate taxes on an NFC-e draft (reuses the same motor fiscal). */
export async function calculateNfceTaxes(emissaoId: string): Promise<void> {
  await callRpc('fiscal_nfe_calcular_impostos', { p_emissao_id: emissaoId });
}

export type NfceEmissaoInfo = {
  id: string;
  status: string;
  numero: number | null;
  serie: number | null;
  chave_acesso: string | null;
  ambiente: string;
  modelo: string;
};

/** Fetches NFC-e emissao info for a given pedido. Returns null if none found. */
export async function getNfceInfoForPedido(pedidoId: string): Promise<NfceEmissaoInfo | null> {
  try {
    const result = await callRpc<NfceEmissaoInfo | null>('fiscal_nfce_get_for_pedido', {
      p_pedido_id: pedidoId,
    });
    return result ?? null;
  } catch {
    return null;
  }
}

/** Downloads DANFCE PDF via the existing focusnfe-danfe edge function. */
export async function downloadDanfce(emissaoId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('focusnfe-danfe', {
    body: { emissao_id: emissaoId, type: 'danfe' },
  });
  if (error) {
    try {
      const ctx = (error as any)?.context;
      if (ctx instanceof Response) {
        const body = await ctx.json();
        throw new Error(body?.detail || body?.error || 'Falha ao baixar DANFCE');
      }
    } catch (e) {
      if (e instanceof Error && e.message !== 'Falha ao baixar DANFCE') throw e;
    }
    throw new Error((error as any)?.message || 'Falha ao baixar DANFCE');
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nfce_${emissaoId.substring(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
