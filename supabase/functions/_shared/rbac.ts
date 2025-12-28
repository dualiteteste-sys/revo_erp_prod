export async function isOwnerOrAdmin(svc: any, callerId: string, empresaId: string): Promise<boolean> {
  const { data: link } = await svc
    .from("empresa_usuarios")
    .select("role_id")
    .eq("empresa_id", empresaId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (!link?.role_id) return false;

  const { data: role } = await svc.from("roles").select("slug").eq("id", link.role_id).maybeSingle();
  return role?.slug === "OWNER" || role?.slug === "ADMIN";
}

export async function hasPermissionOrOwnerAdmin(
  userClient: any,
  svc: any,
  callerId: string,
  empresaId: string,
  module: string,
  action: string,
): Promise<boolean> {
  let allowed = false;
  try {
    const { data } = await userClient.rpc("has_permission_for_current_user", { p_module: module, p_action: action });
    allowed = !!data;
  } catch {
    // ignore
  }
  if (allowed) return true;
  return await isOwnerOrAdmin(svc, callerId, empresaId);
}

