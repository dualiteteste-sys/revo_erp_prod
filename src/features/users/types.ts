export type UserRole = 'OWNER' | 'ADMIN' | 'FINANCE' | 'OPS' | 'READONLY';
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
