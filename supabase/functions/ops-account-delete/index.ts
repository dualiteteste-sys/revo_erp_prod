import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";

type DeletePayload = {
  confirmation?: string;
  reason?: string | null;
};

type DeleteResult = {
  audit_id: string;
  empresa_id: string;
  deleted_tables: Record<string, number>;
  deleted_storage_objects: number;
  storage_cleanup_status?: string;
  storage_objects_pending?: number;
  deleted_empresas_rows: number;
  deleted_memberships_candidates: number;
  deleted_profiles_rows: number;
  deleted_identities_rows: number;
  deleted_sessions_rows: number;
  deleted_refresh_tokens_rows: number;
  deleted_auth_users_rows: number;
};

const MAX_LIST_LIMIT = 100;
const MAX_REMOVE_BATCH = 100;

function json(status: number, body: unknown, headers: Record<string, string>, requestId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "x-revo-request-id": requestId,
      ...headers,
    },
  });
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUuidLike(value: string | null): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

async function listFilesByPrefix(
  adminClient: ReturnType<typeof createClient>,
  bucketId: string,
  prefix: string,
): Promise<string[]> {
  const queue: string[] = [prefix];
  const files = new Set<string>();

  while (queue.length > 0) {
    const path = queue.pop() ?? "";
    let offset = 0;

    while (true) {
      const { data, error } = await adminClient.storage.from(bucketId).list(path, {
        limit: MAX_LIST_LIMIT,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`Falha ao listar storage em "${bucketId}/${path}": ${error.message}`);
      }

      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        const name = typeof row?.name === "string" ? row.name : "";
        if (!name) continue;
        const fullPath = path ? `${path}/${name}` : name;
        const hasId = typeof (row as { id?: unknown })?.id === "string";
        if (hasId) files.add(fullPath);
        else queue.push(fullPath);
      }

      if (rows.length < MAX_LIST_LIMIT) break;
      offset += rows.length;
    }
  }

  return Array.from(files.values());
}

async function cleanupEmpresaStorage(
  adminClient: ReturnType<typeof createClient>,
  empresaId: string,
): Promise<number> {
  const { data: buckets, error: bucketsError } = await adminClient.storage.listBuckets();
  if (bucketsError) {
    throw new Error(`Falha ao listar buckets do storage: ${bucketsError.message}`);
  }

  let deletedObjects = 0;
  for (const bucket of buckets ?? []) {
    const bucketId = bucket?.id;
    if (!bucketId) continue;

    const files = await listFilesByPrefix(adminClient, bucketId, empresaId);
    if (files.length === 0) continue;

    const chunks = chunkArray(files, MAX_REMOVE_BATCH);
    for (const paths of chunks) {
      const { error: removeError } = await adminClient.storage.from(bucketId).remove(paths);
      if (removeError) {
        throw new Error(`Falha ao remover objetos em "${bucketId}": ${removeError.message}`);
      }
      deletedObjects += paths.length;
    }
  }

  return deletedObjects;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const requestId = getRequestId(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders, "x-revo-request-id": requestId } });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, message: "Método não suportado." }, corsHeaders, requestId);
  }

  const supabaseUrl = trimOrNull(Deno.env.get("SUPABASE_URL"));
  const supabaseAnonKey = trimOrNull(Deno.env.get("SUPABASE_ANON_KEY"));
  const supabaseServiceRoleKey = trimOrNull(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return json(500, { ok: false, message: "Configuração do ambiente inválida." }, corsHeaders, requestId);
  }

  const authHeader = trimOrNull(req.headers.get("authorization"));
  const empresaHeader = trimOrNull(req.headers.get("x-empresa-id"));
  if (!authHeader) {
    return json(401, { ok: false, message: "Sessão inválida." }, corsHeaders, requestId);
  }
  if (!isUuidLike(empresaHeader)) {
    return json(400, { ok: false, message: "Empresa ativa ausente ou inválida." }, corsHeaders, requestId);
  }

  const payload = (await req.json().catch(() => ({}))) as DeletePayload;
  const confirmation = trimOrNull(payload?.confirmation);
  if (!confirmation) {
    return json(400, { ok: false, message: "Confirmação é obrigatória." }, corsHeaders, requestId);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
        "x-empresa-id": empresaHeader,
        "x-revo-request-id": requestId,
      },
    },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user) {
    return json(401, { ok: false, message: "Sessão inválida." }, corsHeaders, requestId);
  }

  const { data: currentEmpresaId, error: currentEmpresaError } = await userClient.rpc("current_empresa_id");
  if (currentEmpresaError || !currentEmpresaId) {
    return json(400, { ok: false, message: "Empresa ativa não resolvida para a sessão atual." }, corsHeaders, requestId);
  }
  if (currentEmpresaId !== empresaHeader) {
    return json(403, { ok: false, message: "Empresa ativa inválida para a sessão atual." }, corsHeaders, requestId);
  }

  const { data: hasOpsManage, error: permissionError } = await userClient.rpc("has_permission_for_current_user", {
    p_module: "ops",
    p_action: "manage",
  });
  if (permissionError) {
    return json(500, { ok: false, message: "Falha ao validar permissão ops:manage." }, corsHeaders, requestId);
  }
  if (!hasOpsManage) {
    return json(403, { ok: false, message: "Sem permissão para excluir conta." }, corsHeaders, requestId);
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    global: { headers: { "x-revo-request-id": requestId } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const deletedStorageObjects = await cleanupEmpresaStorage(serviceClient, currentEmpresaId);

    const { data: rpcData, error: rpcError } = await userClient.rpc("ops_account_delete_current_empresa", {
      p_confirmation: confirmation,
      p_reason: trimOrNull(payload?.reason),
    });

    if (rpcError) {
      return json(400, { ok: false, message: rpcError.message }, corsHeaders, requestId);
    }

    const result = (rpcData ?? {}) as DeleteResult;
    const pendingObjects = Number(result?.storage_objects_pending ?? 0);
    const merged: DeleteResult = {
      ...result,
      deleted_storage_objects: deletedStorageObjects,
      storage_objects_pending: Number.isFinite(pendingObjects) ? pendingObjects : 0,
      storage_cleanup_status: pendingObjects > 0 ? "pending_storage_api_cleanup" : "storage_api_clean",
    };

    return json(200, { ok: true, result: merged }, corsHeaders, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar exclusão completa da conta.";
    return json(500, { ok: false, message }, corsHeaders, requestId);
  }
});
