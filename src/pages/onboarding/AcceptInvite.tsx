import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import GlassCard from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";

type State = "idle" | "auth" | "running" | "done" | "error";

function parseHashParams(hash: string) {
  const h = hash?.startsWith("#") ? hash.slice(1) : hash;
  const sp = new URLSearchParams(h);
  const access_token = sp.get("access_token") ?? undefined;
  const refresh_token = sp.get("refresh_token") ?? undefined;
  const error = sp.get("error") ?? undefined;
  return { access_token, refresh_token, error };
}

export default function AcceptInvite() {
  const navigate = useNavigate();

  const { empresaId, code, token_hash, type, hashTokens } = useMemo(() => {
    const url = new URL(window.location.href);
    const qs = url.searchParams;
    const empresaId = qs.get("empresa_id") ?? "";
    const code = qs.get("code") ?? "";
    const token_hash = qs.get("token_hash") ?? "";
    const type = (qs.get("type") ?? "").toLowerCase();
    const hashTokens = parseHashParams(url.hash);
    return { empresaId, code, token_hash, type, hashTokens };
  }, []);

  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (!empresaId) {
        setState("error");
        setMessage("Link inválido: o ID da empresa está ausente.");
        return;
      }

      setState("auth");
      setMessage("Preparando sua sessão, por favor aguarde...");

      try {
        if (hashTokens.access_token && hashTokens.refresh_token) {
          console.log("[AUTH] setSession from hash");
          const { error } = await supabase.auth.setSession({
            access_token: hashTokens.access_token,
            refresh_token: hashTokens.refresh_token,
          });
          if (error) throw error;
        } else if (code) {
          console.log("[AUTH] exchangeCodeForSession");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token_hash) {
          const otpType =
            ["invite", "signup", "magiclink", "recovery"].includes(type)
              ? (type as "invite" | "signup" | "magiclink" | "recovery")
              : "invite";
          console.log("[AUTH] verifyOtp", { otpType });
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: otpType });
          if (error) throw error;
        }

        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session) {
          console.warn("[AUTH] no session after exchange/verify");
        }
      } catch (e) {
        console.error("[AUTH] failed to establish session", e);
      }

      try {
        setState("running");
        setMessage("Confirmando seu convite na empresa...");

        console.log("[RPC][ACCEPT_INVITE] start", { empresaId });
        const { data, error } = await supabase.rpc("accept_invite_for_current_user", {
          p_empresa_id: empresaId,
        });

        if (error) {
          console.error("[RPC][ACCEPT_INVITE] error", error);
          setState("error");
          setMessage("Não foi possível confirmar o convite. Verifique se você está logado com o e-mail correto.");
          return;
        }

        console.log("[RPC][ACCEPT_INVITE] ok", data);
        setState("done");
        setMessage("Convite confirmado! Você será redirecionado em instantes.");

        setTimeout(() => navigate("/app/configuracoes/geral/users", { replace: true }), 2000);
      } catch (e) {
        console.error("[ACCEPT_INVITE] unexpected", e);
        setState("error");
        setMessage("Ocorreu um erro inesperado ao confirmar o convite.");
      }
    })();
  }, [empresaId, code, token_hash, type, hashTokens.access_token, hashTokens.refresh_token, navigate]);

  const renderIcon = () => {
    switch (state) {
        case 'done':
            return <CheckCircle className="w-16 h-16 text-green-500" />;
        case 'error':
            return <AlertTriangle className="w-16 h-16 text-red-500" />;
        default:
            return <Loader2 className="w-16 h-16 animate-spin text-blue-600" />;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <GlassCard className="p-8 text-center">
            <motion.div
                key={state}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex justify-center mb-6"
            >
                {renderIcon()}
            </motion.div>

          <h1 className="text-2xl font-bold text-gray-800 mb-2">Confirmação de Convite</h1>
          <p className="text-gray-600 mb-6 min-h-[40px]">
            {message || "Processando…"}
          </p>

          {state === "error" && (
            <Button
              variant="destructive"
              onClick={() => navigate("/", { replace: true })}
            >
              Ir para a página inicial
            </Button>
          )}

          {state === "done" && (
            <Button
              onClick={() => navigate("/app/configuracoes/geral/users", { replace: true })}
            >
              Ir para Usuários
            </Button>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}
