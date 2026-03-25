import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

// ── Types ────────────────────────────────────────────────

export interface BatchBoletoItem {
  contrato_id: string;
  contrato_numero: string | null;
  contrato_descricao: string | null;
  cliente_id: string;
  cliente_nome: string;
  cliente_email: string | null;
  schedule_id: string;
  competencia: string;
  data_vencimento: string;
  valor: number;
  conta_receber_id: string | null;
  cobranca_bancaria_id: string | null;
  cobranca_status: string | null;
  inter_codigo_solicitacao: string | null;
}

export interface BatchProgress {
  current: number;
  total: number;
  currentItem: string;
  status: 'registering' | 'sending' | 'done' | 'error' | 'skipped';
}

export interface BatchResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: { contrato: string; error: string }[];
}

// ── RPCs ─────────────────────────────────────────────────

export async function listBatchBoletos(competencia: string): Promise<BatchBoletoItem[]> {
  const rows = await callRpc<BatchBoletoItem[]>(
    'servicos_contratos_billing_batch_list',
    { p_competencia: competencia },
  );
  return rows ?? [];
}

export async function prepareBatchBoletos(
  competencia: string,
  contratoIds?: string[],
): Promise<BatchBoletoItem[]> {
  const rows = await callRpc<BatchBoletoItem[]>(
    'servicos_contratos_billing_batch_prepare',
    {
      p_competencia: competencia,
      p_contrato_ids: contratoIds ?? null,
    },
  );
  return rows ?? [];
}

// ── Edge Function calls ──────────────────────────────────

async function registerAndGetPdf(cobrancaBancariaId: string) {
  const { data, error } = await supabase.functions.invoke('inter-boleto', {
    body: { action: 'register-and-get-pdf', cobranca_id: cobrancaBancariaId },
  });
  if (error) throw new Error(error.message || 'Erro ao registrar boleto.');
  if (data && !data.ok) throw new Error(data.error || 'Erro ao registrar boleto.');
  return data as {
    ok: boolean;
    codigoSolicitacao: string;
    nossoNumero: string;
    linhaDigitavel: string;
    pdfBase64: string;
  };
}

async function sendBoletoEmail(
  cobrancaBancariaId: string,
  clienteEmail: string,
  pdfBase64?: string,
) {
  const { data, error } = await supabase.functions.invoke('inter-boleto', {
    body: {
      action: 'send-email',
      cobranca_id: cobrancaBancariaId,
      cliente_email: clienteEmail,
      ...(pdfBase64 ? { pdf_base64: pdfBase64 } : {}),
    },
  });
  if (error) throw new Error(error.message || 'Erro ao enviar email.');
  if (data && !data.ok) throw new Error(data.error || 'Erro ao enviar email.');
  return data as { ok: boolean; resend_id?: string };
}

// ── Single item processing ───────────────────────────────

export async function processSingleBoleto(
  cobrancaBancariaId: string,
  clienteEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const reg = await registerAndGetPdf(cobrancaBancariaId);
    await sendBoletoEmail(cobrancaBancariaId, clienteEmail, reg.pdfBase64);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ── Batch processing (sequential, with progress callback) ─

const DONE_STATUSES = ['enviada', 'liquidada', 'baixada'];

export async function processBatchBoletos(
  items: BatchBoletoItem[],
  onProgress: (p: BatchProgress) => void,
): Promise<BatchResult> {
  const result: BatchResult = { total: items.length, success: 0, failed: 0, skipped: 0, errors: [] };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = item.contrato_numero
      ? `${item.contrato_numero} — ${item.cliente_nome}`
      : item.cliente_nome;

    // Skip already completed
    if (item.cobranca_status && DONE_STATUSES.includes(item.cobranca_status)) {
      onProgress({ current: i + 1, total: items.length, currentItem: label, status: 'skipped' });
      result.skipped++;
      continue;
    }

    // Skip if no cobrança bancária
    if (!item.cobranca_bancaria_id) {
      onProgress({ current: i + 1, total: items.length, currentItem: label, status: 'error' });
      result.failed++;
      result.errors.push({ contrato: label, error: 'Sem cobrança bancária vinculada' });
      continue;
    }

    // Skip if no email
    if (!item.cliente_email) {
      onProgress({ current: i + 1, total: items.length, currentItem: label, status: 'error' });
      result.failed++;
      result.errors.push({ contrato: label, error: 'Cliente sem email cadastrado' });
      continue;
    }

    try {
      // Step 1: Register + PDF
      onProgress({ current: i + 1, total: items.length, currentItem: label, status: 'registering' });
      const reg = await registerAndGetPdf(item.cobranca_bancaria_id);

      // Step 2: Send email
      onProgress({ current: i + 1, total: items.length, currentItem: label, status: 'sending' });
      await sendBoletoEmail(item.cobranca_bancaria_id, item.cliente_email, reg.pdfBase64);

      onProgress({ current: i + 1, total: items.length, currentItem: label, status: 'done' });
      result.success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress({ current: i + 1, total: items.length, currentItem: label, status: 'error' });
      result.failed++;
      result.errors.push({ contrato: label, error: msg });
    }
  }

  return result;
}
