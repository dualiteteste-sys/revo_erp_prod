import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShieldCheck, UserCog } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { callRpc } from '@/lib/api';
import { useCan } from '@/hooks/useCan';
import UserPermissionOverrides from '@/features/users/components/UserPermissionOverrides';

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    nome_completo?: string | null;
    name?: string | null;
  } | null;
  last_sign_in_at?: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  member: 'Membro',
  ops: 'Operações',
  finance: 'Financeiro',
  viewer: 'Leitura',
};

function formatDate(value?: string | null): string {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informado';
  return date.toLocaleString('pt-BR');
}

function normalizeRoleLabel(value?: string | null): string {
  const key = String(value || '').toLowerCase().trim();
  return ROLE_LABEL[key] || 'Não definido';
}

export default function UserProfilePage() {
  const { userId, activeEmpresa, activeEmpresaId } = useAuth();
  const supabase = useSupabase();
  const canManageUsers = useCan('usuarios', 'manage');

  const authUserQuery = useQuery({
    queryKey: ['settings', 'user-profile', 'auth-user', userId],
    enabled: !!userId,
    queryFn: async (): Promise<AuthUser | null> => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return (data?.user as unknown as AuthUser) ?? null;
    },
  });

  const roleQuery = useQuery({
    queryKey: ['settings', 'user-profile', 'empresa-role', activeEmpresaId, userId],
    enabled: !!activeEmpresaId && !!userId,
    queryFn: async (): Promise<string | null> => {
      const role = await callRpc<string | null>('current_empresa_role');
      return typeof role === 'string' ? role : null;
    },
  });

  const overridesCountQuery = useQuery({
    queryKey: ['settings', 'user-profile', 'overrides-count', activeEmpresaId, userId],
    enabled: !!activeEmpresaId && !!userId && canManageUsers,
    queryFn: async (): Promise<number | null> => {
      try {
        const rows = await callRpc<Array<{ permission_id: string }>>('user_permission_overrides_list_for_current_empresa', {
          p_user_id: userId,
        });
        return Array.isArray(rows) ? rows.length : 0;
      } catch {
        return null;
      }
    },
  });

  const isLoading = authUserQuery.isLoading || roleQuery.isLoading;
  const authUser = authUserQuery.data;
  const displayName =
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.nome_completo ||
    authUser?.user_metadata?.name ||
    authUser?.email ||
    'Usuário';

  return (
    <div className="space-y-6 h-full overflow-auto pr-1">
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Perfil de Usuário</h1>
            <p className="mt-2 text-gray-600">Dados da sua conta e modelo de permissões na empresa ativa.</p>
          </div>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <UserCog className="h-5 w-5" />
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumo da Conta</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-gray-500">Nome</p>
                <p className="mt-1 font-semibold text-gray-900">{displayName}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-gray-500">E-mail</p>
                <p className="mt-1 font-semibold text-gray-900">{authUser?.email || 'Não informado'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-gray-500">Empresa ativa</p>
                <p className="mt-1 font-semibold text-gray-900">{activeEmpresa?.nome_fantasia || activeEmpresa?.nome_razao_social || activeEmpresa?.id || 'Não definida'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-gray-500">Último acesso</p>
                <p className="mt-1 font-semibold text-gray-900">{formatDate(authUser?.last_sign_in_at)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Modelo de Acesso</h2>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-sm">
              <p className="font-semibold">Padrão recomendado: 1 papel base por usuário + permissões específicas (overrides).</p>
              <p className="mt-1">Múltiplos papéis simultâneos por usuário ainda não estão habilitados no RBAC atual.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">Papel atual nesta empresa:</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4" />
                {normalizeRoleLabel(roleQuery.data)}
              </span>
            </div>
            {canManageUsers ? (
              <p className="text-sm text-gray-600">
                Overrides ativos para seu usuário: <strong>{overridesCountQuery.data ?? 0}</strong>
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                Somente Owner/Admin com <strong>usuarios:manage</strong> podem editar permissões específicas.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Permissões Específicas do Meu Usuário</h2>
            {canManageUsers && userId ? (
              <UserPermissionOverrides userId={userId} />
            ) : (
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                Você não tem permissão para editar overrides nesta tela. Se necessário, solicite ajuste para um usuário com perfil de administração.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
