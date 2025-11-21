import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

type Permission = { domain: string; action: string };

export default function RequirePermission({
  permission,
  children,
}: {
  permission?: Permission; // se não passar, apenas exige sessão
  children: React.ReactNode;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>("Verificando permissões…");

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) {
        setAllowed(false);
        setMessage("Sessão inválida. Por favor, faça login para continuar.");
        return;
      }

      if (!permission) {
        setAllowed(true);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("has_permission_for_current_user", {
          p_module: permission.domain, // Corrigido de p_domain para p_module
          p_action: permission.action,
        });
        if (error) {
          console.error("[RBAC] rpc error", error);
          setAllowed(false);
          setMessage("Falha ao validar permissão de acesso.");
          return;
        }
        setAllowed(!!data);
        if (!data) setMessage("Você não tem permissão para acessar esta área.");
      } catch (e) {
        console.error("[RBAC] unexpected", e);
        setAllowed(false);
        setMessage("Ocorreu um erro inesperado ao validar sua permissão.");
      }
    })();
  }, [permission?.domain, permission?.action]);

  if (allowed === null) {
    return (
        <div className="flex h-full w-full items-center justify-center p-6 text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {message}
        </div>
    );
  }
  if (!allowed) {
    return <div className="p-6 text-red-600 text-sm">{message}</div>;
  }
  return <>{children}</>;
}
