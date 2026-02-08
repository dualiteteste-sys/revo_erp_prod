import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Save, ShieldCheck, UserCog } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { callRpc } from '@/lib/api';
import { useCan } from '@/hooks/useCan';
import UserPermissionOverrides from '@/features/users/components/UserPermissionOverrides';
import UserPermissionHistory from '@/components/settings/user-profile/UserPermissionHistory';

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    nome_completo?: string | null;
    name?: string | null;
    avatar_url?: string | null;
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
  const { addToast } = useToast();
  const canManageUsers = useCan('usuarios', 'manage');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [avatarUrlInput, setAvatarUrlInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

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
  const avatarUrl = authUser?.user_metadata?.avatar_url || '';
  const avatarLetter = displayName.trim().charAt(0).toUpperCase() || 'U';

  useEffect(() => {
    setDisplayNameInput(displayName === authUser?.email ? '' : displayName || '');
    setAvatarUrlInput(avatarUrl);
  }, [avatarUrl, authUser?.email, displayName]);

  const hasProfileChanges = useMemo(() => {
    const originalName = displayName === authUser?.email ? '' : displayName;
    return (
      displayNameInput.trim() !== (originalName || '').trim() ||
      avatarUrlInput.trim() !== (avatarUrl || '').trim()
    );
  }, [authUser?.email, avatarUrl, avatarUrlInput, displayName, displayNameInput]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: displayNameInput.trim() || null,
          nome_completo: displayNameInput.trim() || null,
          name: displayNameInput.trim() || null,
          avatar_url: avatarUrlInput.trim() || null,
        },
      });
      if (error) throw error;
      await authUserQuery.refetch();
      addToast('Dados pessoais atualizados com sucesso.', 'success');
    } catch (error: any) {
      addToast(error?.message || 'Falha ao salvar dados pessoais.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

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
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Dados Pessoais</h2>
              <button
                type="button"
                onClick={() => void handleSaveProfile()}
                disabled={savingProfile || !hasProfileChanges}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar dados
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[120px_1fr] gap-4 items-start">
              <div className="flex flex-col items-center gap-2">
                {avatarUrlInput ? (
                  <img
                    src={avatarUrlInput}
                    alt="Avatar do usuário"
                    className="h-20 w-20 rounded-full border border-gray-200 object-cover bg-gray-100"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full border border-gray-200 bg-blue-50 text-blue-700 flex items-center justify-center text-2xl font-bold">
                    {avatarLetter}
                  </div>
                )}
                <p className="text-xs text-gray-500 text-center">Pré-visualização</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome de exibição
                  </label>
                  <input
                    id="profile-name"
                    value={displayNameInput}
                    onChange={(event) => setDisplayNameInput(event.target.value)}
                    placeholder="Digite seu nome"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="profile-avatar-url" className="block text-sm font-medium text-gray-700 mb-1">
                    URL do avatar
                  </label>
                  <input
                    id="profile-avatar-url"
                    value={avatarUrlInput}
                    onChange={(event) => setAvatarUrlInput(event.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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

          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Histórico de Alterações de Permissões</h2>
            {userId ? (
              <UserPermissionHistory userId={userId} />
            ) : (
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                Usuário não identificado para consulta de histórico.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
