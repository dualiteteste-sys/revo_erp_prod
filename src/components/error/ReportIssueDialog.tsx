import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/contexts/ToastProvider";
import { sendErrorReport } from "@/services/errorReport";
import { supabase } from "@/lib/supabaseClient";
import { sanitizeLogData } from "@/lib/sanitizeLog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sentryEventId: string | null;
  error?: Error | null;
  diagnosticSnapshot?: unknown | null;
};

function safeJsonPreview(value: unknown) {
  try {
    const sanitized = sanitizeLogData(value);
    const text = JSON.stringify(sanitized, null, 2);
    return text.length <= 6000 ? text : `${text.slice(0, 6000)}\n…(truncado)`;
  } catch {
    return "—";
  }
}

export function ReportIssueDialog({ open, onOpenChange, sentryEventId, error, diagnosticSnapshot }: Props) {
  const { addToast } = useToast();
  const [userMessage, setUserMessage] = useState("");
  const [email, setEmail] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const canSubmit = useMemo(() => {
    return Boolean(sentryEventId) && userMessage.trim().length >= 6 && !submitting;
  }, [sentryEventId, userMessage, submitting]);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setUserMessage("");
    setShowDiagnostics(false);
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data?.user ?? null;
        if (u?.email) setEmail(u.email);
      } catch {
        // noop
      }
    })();
  }, [open]);

  const onSubmit = async () => {
    if (!sentryEventId) return;
    if (!userMessage.trim()) return;
    setSubmitting(true);
    try {
      const res = await sendErrorReport({
        sentry_event_id: sentryEventId,
        user_message: userMessage.trim(),
        user_email: email.trim() || null,
        client_error: {
          name: error?.name ?? null,
          message: error?.message ?? null,
          stack: error?.stack ?? null,
        },
        diagnostic_snapshot: diagnosticSnapshot ?? null,
      });
      addToast("Relatório enviado. Obrigado!", "success");
      onOpenChange(false);
      return res;
    } catch (e: any) {
      addToast(e?.message || "Falha ao enviar relatório. Tente novamente.", "error", {
        durationMs: 8000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
          <DialogTitle>O Ultria ERP Beta encontrou um erro</DialogTitle>
          <DialogDescription>
            O Ultria ERP Beta encontrou um erro que precisa ser resolvido pelos desenvolvedores. Gostaria de enviar e aguardar 1 dia útil para correção?
            Não inclua senhas nem dados sensíveis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-900">O que você estava tentando fazer?</label>
            <textarea
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              rows={4}
              placeholder="Ex.: Tentei gerar títulos do contrato até 31/12 e deu erro."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30"
            />
            <div className="text-xs text-slate-500">Event ID: {sentryEventId ?? "—"}</div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-900">Seu e-mail (opcional)</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: voce@empresa.com"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30"
            />
          </div>

          <div className="pt-1">
            <button
              type="button"
              className="text-xs font-semibold text-slate-600 hover:text-slate-800 underline"
              onClick={() => setShowDiagnostics((v) => !v)}
            >
              {showDiagnostics ? "Ocultar diagnóstico" : "Ver diagnóstico (sanitizado)"}
            </button>
            {showDiagnostics ? (
              <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-700 whitespace-pre-wrap break-words">
                {safeJsonPreview({ event_id: sentryEventId, error, diagnostic: diagnosticSnapshot })}
              </pre>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-100"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Enviando..." : "Enviar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
