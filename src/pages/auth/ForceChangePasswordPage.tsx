import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/forms/Input";
import RevoLogo from "@/components/landing/RevoLogo";
import { bootstrapEmpresaParaUsuarioAtual } from "@/services/session";

export default function ForceChangePasswordPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const empresaIdFromQuery = useMemo(() => search.get("empresa_id") ?? undefined, [search]);

  const [loading, setLoading] = useState(true);
  const [empresaId, setEmpresaId] = useState<string | undefined>(empresaIdFromQuery);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        if (!s?.session) {
          navigate("/auth/login", { replace: true });
          return;
        }

        const { data: u } = await supabase.auth.getUser();
        const meta: any = (u?.user as any)?.user_metadata ?? {};
        const pendingEmpresa = typeof meta.pending_empresa_id === "string" ? meta.pending_empresa_id : undefined;
        if (!empresaIdFromQuery && pendingEmpresa) setEmpresaId(pendingEmpresa);
      } catch (e: any) {
        console.error("[AUTH][FORCE_CHANGE] init error", e);
        setError(e?.message ?? "Falha ao preparar sessão.");
      } finally {
        setLoading(false);
      }
    })();
  }, [empresaIdFromQuery, navigate]);

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
      const { data: s } = await supabase.auth.getSession();
      if (!s?.session) throw new Error("Sessão inválida. Faça login novamente.");

      const { error: upErr } = await supabase.auth.updateUser({
        password,
        data: {
          must_change_password: false,
          pending_empresa_id: null,
        } as any,
      });
      if (upErr) throw upErr;

      if (empresaId) {
        const { error: rpcErr } = await (supabase as any).rpc("accept_invite_for_current_user", { p_empresa_id: empresaId });
        if (rpcErr && !String(rpcErr.message ?? "").includes("INVITE_NOT_FOUND")) {
          throw rpcErr;
        }
      }

      await bootstrapEmpresaParaUsuarioAtual();

      setOkMsg("Senha atualizada! Redirecionando…");
      setTimeout(() => navigate("/app/dashboard", { replace: true }), 900);
    } catch (e: any) {
      console.error("[AUTH][FORCE_CHANGE] error", e);
      setError(e?.message ?? "Falha ao atualizar senha.");
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
            <RevoLogo className="h-10 w-auto scale-95 text-gray-800" />
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Trocar senha no primeiro acesso</h1>
          <p className="text-center text-gray-600 mb-6">
            Por segurança, você precisa definir uma nova senha antes de continuar.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              label="Nova senha"
              id="password"
              type="password"
              autoFocus
              disabled={updating || !!okMsg}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
            <Input
              label="Confirmar nova senha"
              id="confirmPassword"
              type="password"
              disabled={updating || !!okMsg}
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

            <Button type="submit" disabled={updating || !!okMsg} className="w-full">
              {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {updating ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
