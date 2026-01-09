import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/forms/Input";
import RevoLogo from "@/components/landing/RevoLogo";
import { bootstrapEmpresaParaUsuarioAtual } from "@/services/session";

function parseHashParams(hash: string) {
  const s = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return {
    access_token: s.get("access_token") ?? undefined,
    refresh_token: s.get("refresh_token") ?? undefined,
    error: s.get("error") ?? undefined,
    error_code: s.get("error_code") ?? undefined,
    error_description: s.get("error_description") ?? undefined,
  };
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatAuthLinkError(params: { error_code?: string; error_description?: string }): string {
  const description = (params.error_description ?? "").trim();
  const code = (params.error_code ?? "").trim().toLowerCase();

  if (code === "otp_expired") {
    return "Este link expirou ou já foi usado. Peça para reenviar o convite e abra o e-mail mais recente.";
  }

  if (description) return decodeURIComponentSafe(description);
  return "Não foi possível validar o link. Peça para reenviar o convite e tente novamente.";
}

export default function UpdatePasswordPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const empresaId = useMemo(() => search.get("empresa_id") ?? undefined, [search]);
  
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 0) Se já existe sessão (ex.: reload), podemos seguir.
        const initial = await supabase.auth.getSession();
        if (initial?.data?.session) {
          setSessionReady(true);
          return;
        }

        const url = new URL(window.location.href);
        const qs = url.searchParams;
        const code = qs.get("code") ?? "";
        const token_hash = qs.get("token_hash") ?? "";
        const type = (qs.get("type") ?? "").toLowerCase();
        const hash = parseHashParams(url.hash ?? "");

        // 1) Se o link veio com erro (ex.: expirado), não tenta seguir.
        if (hash.error) {
          setSessionReady(false);
          setError(formatAuthLinkError({ error_code: hash.error_code, error_description: hash.error_description }));
          return;
        }

        // 2) Estabelece sessão (hash tokens / PKCE code / token_hash)
        if (hash.access_token && hash.refresh_token) {
          console.log("[AUTH] setSession from hash");
          const { error } = await supabase.auth.setSession({
            access_token: hash.access_token,
            refresh_token: hash.refresh_token,
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

        // 3) Confere se existe sessão mesmo.
        const after = await supabase.auth.getSession();
        if (!after?.data?.session) {
          setSessionReady(false);
          setError("Auth session missing! Abra o link do e-mail novamente (o link pode ter expirado).");
          return;
        }

        // 4) Limpa URL (remove code/hash tokens), mantendo empresa_id.
        const clean = new URL(window.location.href);
        clean.searchParams.delete("code");
        clean.searchParams.delete("token_hash");
        clean.searchParams.delete("type");
        clean.hash = "";
        history.replaceState(null, "", clean.pathname + clean.search);

        setSessionReady(true);
      } catch (e: any) {
        console.error("[AUTH] setSession error", e);
        setSessionReady(false);
        setError(e?.message ?? "Falha ao preparar sessão. O link pode ter expirado.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOkMsg(null);

    if (!passwordUpdated) {
      if (password.length < 8) {
        setError("A senha deve ter pelo menos 8 caracteres.");
        return;
      }
      if (password !== confirmPassword) {
        setError("As senhas não conferem.");
        return;
      }
    }

    setUpdating(true);
    try {
      if (!sessionReady) throw new Error("Sessão não está pronta. Tente acessar o link do e-mail novamente.");

      if (!passwordUpdated) {
        console.log("[AUTH] updateUser(password)");
        const { error: upErr } = await supabase.auth.updateUser({ password });
        if (upErr) {
          const msg = String((upErr as any)?.message ?? "");
          // UX: se o usuário já tentou essa mesma senha em uma tentativa anterior, o Supabase pode exigir "senha diferente".
          // Nesse caso, consideramos a senha já definida e seguimos para o aceite do convite.
          if (/different from the old password/i.test(msg)) {
            setPasswordUpdated(true);
          } else {
            throw upErr;
          }
        } else {
          setPasswordUpdated(true);
        }
      }

      if (empresaId) {
        console.log("[RPC] accept_invite_for_current_user", empresaId);
        const { error: rpcErr } = await supabase.rpc("accept_invite_for_current_user", {
          p_empresa_id: empresaId,
        });
        if (rpcErr && !String(rpcErr.message ?? "").includes("INVITE_NOT_FOUND")) {
          // Importante: a senha já pode ter sido salva. Permitir retry do aceite sem obrigar trocar senha de novo.
          throw new Error(
            `Senha salva, mas não foi possível confirmar o convite agora. Tente novamente.\n\nDetalhe: ${
              (rpcErr as any)?.message ?? "erro desconhecido"
            }`,
          );
        }
      }

      // Garante que o usuário entra com empresa ativa (evita cair na landing / estado inconsistente).
      await bootstrapEmpresaParaUsuarioAtual();

      try {
        sessionStorage.setItem('revo:post_auth_welcome', empresaId ? `invite:${empresaId}` : 'invite');
      } catch {
        // ignore
      }

      setOkMsg("Senha atualizada com sucesso! Redirecionando para o painel...");
      setTimeout(() => navigate("/app"), 900);
    } catch (e: any) {
      console.error("[AUTH] update/accept error", e);
      setError(e?.message ?? "Falha ao atualizar a senha.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
      </div>
    );
}

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
        >
            <div className="bg-glass-200 backdrop-blur-xl border border-white/30 rounded-3xl shadow-glass-lg p-8">
                <div className="flex justify-center mb-6">
                    <RevoLogo className="h-8 w-auto text-gray-800" />
                </div>
                
                <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Definir Nova Senha</h1>
                <p className="text-center text-gray-600 mb-6">
                    Crie sua senha para acessar o sistema.
                </p>

                <form onSubmit={onSubmit} className="space-y-4">
                    <Input
                        label="Nova senha"
                        id="password"
                        type="password"
                        autoFocus
                        disabled={!sessionReady || updating || !!okMsg || passwordUpdated}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                    />
                    <Input
                        label="Confirmar nova senha"
                        id="confirmPassword"
                        type="password"
                        disabled={!sessionReady || updating || !!okMsg || passwordUpdated}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
                    />

                    {error && (
                        <div className="flex items-center gap-2 text-red-600 text-sm p-3 bg-red-50 border border-red-200 rounded-lg">
                            <AlertTriangle size={18} /> {error}
                        </div>
                    )}
                    {okMsg && (
                        <div className="flex items-center gap-2 text-green-700 text-sm p-3 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle size={18} /> {okMsg}
                        </div>
                    )}

                    <Button
                        type="submit"
                        disabled={!sessionReady || updating || !!okMsg}
                        className="w-full"
                    >
                        {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {updating ? "Processando..." : (passwordUpdated ? "Confirmar convite e entrar" : "Salvar senha e entrar")}
                    </Button>
                </form>
            </div>
        </motion.div>
    </div>
  );
}
