import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabase } from "@/providers/SupabaseProvider";

const RETRIES_MS = [0, 300, 800, 1500];

function isRetryable(e: any): boolean {
  const s = (e?.message || e?.code || "") as string;
  return /503|Service Unavailable|upstream|delayed connect|ECONN|network|fetch/i.test(s);
}

export default function Callback() {
  const supabase = useSupabase();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      console.log("[AUTH][CALLBACK] start");

      // Garante que a sessão está visível
      const first = await supabase.auth.getSession();
      console.log("[AUTH][CALLBACK] hasSession:", !!first?.data?.session);

      try {
        // Preferir nome da empresa vindo do signup (metadata/localStorage).
        let empresaNome: string | null = null;
        try {
          const { data } = await supabase.auth.getUser();
          const meta: any = (data?.user as any)?.user_metadata ?? {};
          if (typeof meta.company_name === "string" && meta.company_name.trim()) {
            empresaNome = meta.company_name.trim();
          }
        } catch {
          // ignore
        }
        if (!empresaNome) {
          try {
            const ls = localStorage.getItem("pending_company_name");
            if (ls && ls.trim()) empresaNome = ls.trim();
          } catch {
            // ignore
          }
        }

        // 1) Bootstrap de empresa para o usuário atual (idempotente)
        let ok = false;
        let lastErr: any = null;

        for (let i = 0; i < RETRIES_MS.length; i++) {
          const { error } = await (supabase as any).rpc(
            "secure_bootstrap_empresa_for_current_user",
            {
              p_razao_social: empresaNome || "Empresa sem Nome",
              p_fantasia: empresaNome || null,
            }
          );

          if (error) {
            console.warn("[AUTH][CALLBACK][RPC][WARN]", error);
            lastErr = error;
            if (isRetryable(error)) {
              await new Promise((r) => setTimeout(r, RETRIES_MS[i]));
              continue;
            }
            break;
          }

          ok = true;
          break;
        }

        if (!ok) throw lastErr ?? new Error("bootstrap_failed");

        // 2) (Opcional) Confirma empresa ativa (RPC-first)
        const { data: activeEmpresaId, error: prefErr } = await supabase.rpc(
          "active_empresa_get_for_current_user"
        );
        if (prefErr) console.warn("[AUTH][CALLBACK][PREF][WARN]", prefErr);
        console.log("[AUTH][CALLBACK] success", { empresa_id: activeEmpresaId ?? null });

        // 3) Trial/billing bootstrap (evita tenant "sem plano" → 403/fallback).
        // Regras:
        // - Só roda quando o usuário veio da seleção de plano (localStorage).
        // - É idempotente: se já existir assinatura ativa/trial, não altera.
        try {
          const planSlug = (localStorage.getItem("pending_plan_slug") ?? "").trim();
          const cycle = (localStorage.getItem("pending_plan_cycle") ?? "").trim() || "monthly";
          if (planSlug) {
            const { data: trialRes, error: trialErr } = await (supabase as any).rpc(
              "billing_start_trial_for_current_user",
              { p_plan_slug: planSlug, p_billing_cycle: cycle },
            );
            if (trialErr) {
              console.warn("[AUTH][CALLBACK][TRIAL][WARN]", trialErr);
            } else {
              console.log("[AUTH][CALLBACK][TRIAL] ok", trialRes);
            }
          }
        } catch (e: any) {
          console.warn("[AUTH][CALLBACK][TRIAL][WARN]", e);
        }

        try {
          localStorage.removeItem("pending_company_name");
          localStorage.removeItem("pending_plan_slug");
          localStorage.removeItem("pending_plan_cycle");
        } catch {
          // ignore
        }

        if (!cancelled) navigate("/app/dashboard", { replace: true });
      } catch (e: any) {
        console.error("[AUTH][CALLBACK][ERROR]", e);
        if (!cancelled)
          setErr(e?.message ?? "Erro ao finalizar seu cadastro. Tente novamente.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, navigate]);

  // UI mínima padrão (mantém estética global do app)
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="rounded-2xl bg-white/70 backdrop-blur p-6 shadow">
        {!err ? (
          <div className="text-sm text-slate-600">Preparando seu acesso…</div>
        ) : (
          <div className="text-sm text-red-600">
            {err} — <span className="underline cursor-pointer" onClick={() => location.reload()}>tentar novamente</span>
          </div>
        )}
      </div>
    </div>
  );
}
