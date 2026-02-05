import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

function requireEnv(name: string): string | null {
  const v = (Deno.env.get(name) ?? "").trim();
  return v ? v : null;
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function getPath(req: Request) {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "/";
  }
}

async function dispatchWorkflow(input: {
  token: string;
  repo: string;
  workflowFile: string;
  ref: string;
  inputs?: Record<string, string>;
}) {
  const res = await fetch(`https://api.github.com/repos/${input.repo}/actions/workflows/${input.workflowFile}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "revo-ops-backups",
    },
    body: JSON.stringify({
      ref: input.ref,
      inputs: input.inputs ?? {},
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GitHub dispatch error (${res.status}): ${txt}`);
  }
}

async function getLatestWorkflowRunUrl(input: { token: string; repo: string; workflowFile: string; ref?: string }) {
  const url = new URL(`https://api.github.com/repos/${input.repo}/actions/workflows/${input.workflowFile}/runs`);
  url.searchParams.set("per_page", "1");
  url.searchParams.set("event", "workflow_dispatch");
  if (input.ref) url.searchParams.set("branch", input.ref);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "revo-ops-backups",
    },
  });
  const jsonBody = await res.json().catch(() => null) as any;
  if (!res.ok) {
    throw new Error(`GitHub runs error (${res.status}): ${JSON.stringify(jsonBody)}`);
  }
  const run = (jsonBody?.workflow_runs?.[0] ?? null) as any;
  return run?.html_url ? String(run.html_url) : null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const githubToken = requireEnv("GITHUB_TOKEN");
    const githubRepo = requireEnv("GITHUB_REPO");
    const githubRef = (requireEnv("GITHUB_DEFAULT_REF") ?? "main").trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(500, { ok: false, error: "config_error", message: "SUPABASE_URL/SUPABASE_ANON_KEY ausentes." }, corsHeaders);
    }
    if (!githubToken || !githubRepo) {
      return json(
        500,
        { ok: false, error: "config_error", message: "GITHUB_TOKEN/GITHUB_REPO ausentes (necessário para dispatch dos workflows)." },
        corsHeaders,
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return json(401, { ok: false, error: "not_signed_in", message: "Token de autenticação ausente." }, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user ?? null;
    if (userErr || !user) {
      return json(401, { ok: false, error: "invalid_token", message: userErr?.message ?? "Token inválido." }, corsHeaders);
    }

    // Exige empresa ativa para validar permissão ops:manage.
    const { data: empresaId, error: empresaErr } = await supabase.rpc("current_empresa_id");
    if (empresaErr || !empresaId) {
      return json(400, { ok: false, error: "empresa_not_selected", message: "Empresa ativa não encontrada." }, corsHeaders);
    }

    const { data: canManage, error: permErr } = await supabase.rpc("has_permission_for_current_user", {
      p_module: "ops",
      p_action: "manage",
    } as any);
    if (permErr) {
      return json(500, { ok: false, error: "perm_check_failed", message: permErr.message }, corsHeaders);
    }
    if (!canManage) {
      return json(403, { ok: false, error: "forbidden", message: "Sem permissão (ops:manage)." }, corsHeaders);
    }

    const path = getPath(req);
    if (req.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" }, corsHeaders);
    }

    const payload = (await req.json().catch(() => null)) as any;
    const action = String(payload?.action ?? "").trim().toLowerCase();

    const isBackup = path.endsWith("/backup") || action === "backup";
    const isRestore = path.endsWith("/restore") || action === "restore";

    if (isBackup) {
      const target = String(payload?.target ?? "prod").trim();
      const mode = String(payload?.mode ?? "full").trim();
      const label = String(payload?.label ?? "").trim();

      await dispatchWorkflow({
        token: githubToken,
        repo: githubRepo,
        workflowFile: "db-backup.yml",
        ref: githubRef,
        inputs: {
          target,
          mode,
          label,
        },
      });

      // best-effort: tenta encontrar a última run do workflow
      let runUrl: string | null = null;
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 900));
        runUrl = await getLatestWorkflowRunUrl({ token: githubToken, repo: githubRepo, workflowFile: "db-backup.yml", ref: githubRef });
        if (runUrl) break;
      }

      return json(200, { ok: true, kind: "backup", run_url: runUrl }, corsHeaders);
    }

    if (isRestore) {
      const target = String(payload?.target ?? "dev").trim();
      const r2Key = String(payload?.r2_key ?? "").trim();
      const confirm = String(payload?.confirm ?? "").trim();
      if (!r2Key) {
        return json(400, { ok: false, error: "invalid_payload", message: "r2_key é obrigatório." }, corsHeaders);
      }

      await dispatchWorkflow({
        token: githubToken,
        repo: githubRepo,
        workflowFile: "db-restore-from-r2.yml",
        ref: githubRef,
        inputs: {
          target,
          r2_key: r2Key,
          confirm,
        },
      });

      let runUrl: string | null = null;
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 900));
        runUrl = await getLatestWorkflowRunUrl({ token: githubToken, repo: githubRepo, workflowFile: "db-restore-from-r2.yml", ref: githubRef });
        if (runUrl) break;
      }

      return json(200, { ok: true, kind: "restore", run_url: runUrl }, corsHeaders);
    }

    return json(400, { ok: false, error: "invalid_action", message: "Informe action=backup ou action=restore." }, corsHeaders);
  } catch (e: any) {
    return json(500, { ok: false, error: "internal_server_error", message: e?.message ?? "Erro interno." }, buildCorsHeaders(req));
  }
});
