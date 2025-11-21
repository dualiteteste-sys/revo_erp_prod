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
        // 1) Bootstrap de empresa para o usuário atual (idempotente)
        let ok = false;
        let lastErr: any = null;

        for (let i = 0; i < RETRIES_MS.length; i++) {
          const { error } = await supabase.rpc(
            "secure_bootstrap_empresa_for_current_user",
            { p_razao_social: "Empresa sem Nome", p_fantasia: null }
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

        // 2) (Opcional) Confirma empresa ativa
        const { data: pref, error: prefErr } = await supabase
          .from("user_active_empresa")
          .select("empresa_id")
          .maybeSingle();

        if (prefErr) console.warn("[AUTH][CALLBACK][PREF][WARN]", prefErr);
        console.log("[AUTH][CALLBACK] success", pref);

        if (!cancelled) navigate("/app", { replace: true });
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
