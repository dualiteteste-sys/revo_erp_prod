import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/forms/Input";
import RevoLogo from "@/components/landing/RevoLogo";

function parseHashTokens(hash: string) {
  const s = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const access_token = s.get("access_token") ?? undefined;
  const refresh_token = s.get("refresh_token") ?? undefined;
  return { access_token, refresh_token };
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
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { access_token, refresh_token } = parseHashTokens(window.location.hash);
        if (access_token && refresh_token) {
          console.log("[AUTH] setSession from hash");
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
        setSessionReady(true);
      } catch (e: any) {
        console.error("[AUTH] setSession error", e);
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

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setUpdating(true);
    try {
      if (!sessionReady) throw new Error("Sessão não está pronta. Tente acessar o link do e-mail novamente.");

      console.log("[AUTH] updateUser(password)");
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;

      if (empresaId) {
        console.log("[RPC] accept_invite_for_current_user", empresaId);
        const { error: rpcErr } = await supabase.rpc("accept_invite_for_current_user", {
          p_empresa_id: empresaId,
        });
        if (rpcErr && !String(rpcErr.message ?? "").includes("INVITE_NOT_FOUND")) {
          throw rpcErr;
        }
      }

      setOkMsg("Senha atualizada com sucesso! Redirecionando para o painel...");
      setTimeout(() => navigate("/app"), 2000);
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
                        disabled={!sessionReady || updating || !!okMsg}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                    />
                    <Input
                        label="Confirmar nova senha"
                        id="confirmPassword"
                        type="password"
                        disabled={!sessionReady || updating || !!okMsg}
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
                        {updating ? "Salvando..." : "Salvar senha e entrar"}
                    </Button>
                </form>
            </div>
        </motion.div>
    </div>
  );
}
