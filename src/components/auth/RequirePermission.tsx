import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useAppContext } from "@/contexts/AppContextProvider";
import { roleAtLeast } from "@/hooks/useEmpresaRole";
import { useHasPermission } from "@/hooks/useHasPermission";

type Permission = { domain: string; action: string };

export default function RequirePermission({
  permission,
  children,
}: {
  permission?: Permission; // se não passar, apenas exige sessão
  children: React.ReactNode;
}) {
  const { session, empresaRole, empresaRoleLoading, isAdminLike } = useAppContext();
  const isOpsDomain = (permission?.domain ?? "") === "ops" || (permission?.domain ?? "").startsWith("ops:");

  // Estado da arte:
  // - Admin/Owner: permissões amplas dentro do tenant.
  // - "ops/*": reservado para usuários internos; sempre checar permissão explicitamente.
  const shouldCheckPermission =
    !!session && !!permission && !empresaRoleLoading && (!isAdminLike || isOpsDomain);
  const permQuery = useHasPermission(permission?.domain || "", permission?.action || "");

  const state = useMemo(() => {
    if (!session) {
      return { allowed: false, loading: false, message: "Sessão inválida. Por favor, faça login para continuar." };
    }
    if (!permission) {
      return { allowed: true, loading: false, message: "" };
    }
    if (empresaRoleLoading) {
      return { allowed: null, loading: true, message: "Verificando permissões…" };
    }
    if ((isAdminLike || roleAtLeast(empresaRole, "admin")) && !isOpsDomain) {
      return { allowed: true, loading: false, message: "" };
    }
    if (!shouldCheckPermission) {
      return { allowed: null, loading: true, message: "Verificando permissões…" };
    }
    if (permQuery.isLoading) {
      return { allowed: null, loading: true, message: "Verificando permissões…" };
    }
    const ok = !!permQuery.data;
    return { allowed: ok, loading: false, message: ok ? "" : "Você não tem permissão para acessar esta área." };
  }, [
    session,
    permission,
    empresaRoleLoading,
    empresaRole,
    isAdminLike,
    isOpsDomain,
    shouldCheckPermission,
    permQuery.isLoading,
    permQuery.data,
  ]);

  if (state.loading) {
    return (
        <div className="flex h-full w-full items-center justify-center p-6 text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {state.message}
        </div>
    );
  }
  if (!state.allowed) {
    return <div className="p-6 text-red-600 text-sm">{state.message}</div>;
  }
  return <>{children}</>;
}
