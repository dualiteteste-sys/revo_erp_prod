// OBS: o banco usa slugs em public.roles (OWNER/ADMIN/MEMBER/OPS/FINANCE/VIEWER).
// Mantemos 'READONLY' como alias legado (mapeado para VIEWER) para compatibilidade.
export type UserRole = 'OWNER' | 'ADMIN' | 'FINANCE' | 'OPS' | 'MEMBER' | 'VIEWER' | 'READONLY';
export type UserStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'INACTIVE';

export type EmpresaUser = {
  user_id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  invited_at: string | null;
  last_sign_in_at: string | null;
};

export type UsersFilters = {
  q?: string;
  role?: UserRole[];
  status?: UserStatus[];
};
