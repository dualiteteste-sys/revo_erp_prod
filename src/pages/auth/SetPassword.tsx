import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";

/** Lê tokens legados do hash (#access_token=...&refresh_token=...) */
function parseHashTokens(): { access_token?: string; refresh_token?: string } | null {
  const h = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  if (!h) return null;
  const params = new URLSearchParams(h);
  const access_token = params.get("access_token") || undefined;
  const refresh_token = params.get("refresh_token") || undefined;
  if (access_token && refresh_token) return { access_token, refresh_token };
  return null;
}

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => !!hasSession && !busy && password.length >= 8,
    [hasSession, busy, password]
  );

  useEffect(() => {
    let cancelled = false;

    async function ensureSession() {
      try {
        // 0) Já tem sessão?
        const s0 = await supabase.auth.getSession();
        if (s0.data.session) {
          if (!cancelled) setHasSession(true);
          return;
        }

        // 1) PKCE moderno -> ?code=...
        const code = params.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data?.session) {
            if (!cancelled) setHasSession(true);
            return;
          }
        }

        // 2) Legado -> tokens no hash
        const legacy = parseHashTokens();
        if (legacy?.access_token && legacy?.refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token: legacy.access_token,
            refresh_token: legacy.refresh_token,
          });
          if (!error && data?.session) {
            if (!cancelled) setHasSession(true);
            return;
          }
        }

        // 3) Ainda sem sessão
        if (!cancelled) {
          setHasSession(false);
          setMsg(
            "Abra o link do e-mail neste dispositivo para autenticar e então definir a senha."
          );
        }
      } catch (e: any) {
        console.error("[AUTH][SET_PASSWORD:init] error", e);
        if (!cancelled) {
          setHasSession(false);
          setMsg("Não foi possível autenticar a partir do link.");
        }
      }
    }

    ensureSession();
    return () => {
      cancelled = true;
    };
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg("Senha definida com sucesso. Redirecionando…");
      setTimeout(() => navigate("/", { replace: true }), 900);
    } catch (e: any) {
      console.error("[AUTH][SET_PASSWORD] error", e);
      setMsg(e?.message || "Falha ao definir senha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-md w-full rounded-2xl shadow-lg p-6 backdrop-blur bg-white/5 text-gray-800">
        <h1 className="text-xl font-semibold mb-4">Definir senha</h1>

        {hasSession === null ? (
          <p>Verificando sessão…</p>
        ) : hasSession ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <input
              type="password"
              className="w-full rounded-xl bg-white/10 p-3 focus:outline-none text-black placeholder-gray-500"
              placeholder="Nova senha (mín. 8 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-xl p-3 bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
            >
              {busy ? "Salvando…" : "Salvar senha e entrar"}
            </button>
            {msg && <p className="text-sm opacity-90">{msg}</p>}
          </form>
        ) : (
          <>
            <p className="opacity-90 mb-3">
              Você precisa abrir o link recebido por e-mail para autenticar. Após isso,
              esta página será liberada para definir a senha.
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl p-3 bg-white/20 hover:bg-white/30 transition text-white"
                onClick={() => navigate("/")}
              >
                Voltar
              </button>
              <button
                className="flex-1 rounded-xl p-3 bg-white/20 hover:bg-white/30 transition text-white"
                onClick={() => navigate("/auth/callback", { replace: true })}
              >
                Tentar novamente
              </button>
            </div>
            {msg && <p className="text-sm opacity-90 mt-3">{msg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
