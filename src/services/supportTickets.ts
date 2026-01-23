import { callRpc } from '@/lib/api';

export type SupportTicketStatus =
  | 'novo'
  | 'triagem'
  | 'em_andamento'
  | 'aguardando_cliente'
  | 'resolvido'
  | 'arquivado';

export type SupportTicketPriority = 'baixa' | 'normal' | 'alta' | 'urgente';

export type SupportTicketListItem = {
  id: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  subject: string;
  last_activity_at: string;
  created_at: string;
};

export type SupportTicketMessage = {
  id: string;
  author_kind: 'cliente' | 'staff' | 'sistema';
  author_user_id: string | null;
  body: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type SupportTicketEvent = {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type SupportTicket = {
  id: string;
  empresa_id: string;
  created_by: string;
  requester_email: string | null;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assigned_to: string | null;
  error_report_id: string | null;
  context: Record<string, unknown>;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type SupportTicketGetResponse = {
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
  events: SupportTicketEvent[];
};

export async function isOpsStaffForCurrentUser(): Promise<boolean> {
  return callRpc<boolean>('ops_is_staff_for_current_user', {});
}

export async function createSupportTicket(params: {
  subject: string;
  message: string;
  context?: Record<string, unknown>;
  requesterEmail?: string | null;
}): Promise<string> {
  return callRpc<string>('support_ticket_create', {
    p_subject: params.subject,
    p_first_message: params.message,
    p_context: params.context ?? {},
    p_requester_email: params.requesterEmail ?? null,
  });
}

export async function listMySupportTickets(params?: {
  status?: SupportTicketStatus | null;
  limit?: number;
  offset?: number;
}): Promise<SupportTicketListItem[]> {
  return callRpc<SupportTicketListItem[]>('support_tickets_list_for_current_user', {
    p_status: params?.status ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  });
}

export async function getSupportTicket(ticketId: string): Promise<SupportTicketGetResponse> {
  return callRpc<SupportTicketGetResponse>('support_ticket_get', { p_ticket_id: ticketId });
}

export async function replySupportTicket(params: { ticketId: string; message: string }): Promise<void> {
  return callRpc<void>('support_ticket_reply', { p_ticket_id: params.ticketId, p_message: params.message });
}

export type SupportStaffTicketListItem = {
  id: string;
  empresa_id: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  subject: string;
  requester_email: string | null;
  assigned_to: string | null;
  last_activity_at: string;
  created_at: string;
};

export async function listSupportTicketsAsStaff(params?: {
  q?: string | null;
  status?: SupportTicketStatus | null;
  empresaId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<SupportStaffTicketListItem[]> {
  return callRpc<SupportStaffTicketListItem[]>('support_staff_tickets_list', {
    p_q: params?.q ?? null,
    p_status: params?.status ?? null,
    p_empresa_id: params?.empresaId ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  });
}

export async function setSupportTicketStatusAsStaff(params: { ticketId: string; status: SupportTicketStatus }): Promise<void> {
  return callRpc<void>('support_staff_ticket_set_status', {
    p_ticket_id: params.ticketId,
    p_status: params.status,
  });
}

