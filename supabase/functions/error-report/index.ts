import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";

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

async function sendEmailViaResend(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`Resend error (${res.status}): ${txt}`);
  }
  return txt;
}

async function createGithubIssue(input: {
  token: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}) {
  const res = await fetch(`https://api.github.com/repos/${input.repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      labels: input.labels?.length ? input.labels : undefined,
    }),
  });
  const jsonBody = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`GitHub error (${res.status}): ${JSON.stringify(jsonBody)}`);
  }
  return jsonBody as { html_url?: string; number?: number };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const resendApiKey = requireEnv("RESEND_API_KEY");
    const reportEmailTo = requireEnv("ERROR_REPORT_EMAIL_TO");
    const reportEmailFrom = requireEnv("ERROR_REPORT_EMAIL_FROM");
    const githubToken = requireEnv("GITHUB_TOKEN");
    const githubRepo = requireEnv("GITHUB_REPO");

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(500, { ok: false, error: "config_error", message: "SUPABASE_URL/SUPABASE_ANON_KEY ausentes." }, corsHeaders);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return json(401, { ok: false, error: "not_signed_in", message: "Token de autenticação ausente." }, corsHeaders);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    const user = userData?.user ?? null;
    if (userErr || !user) {
      return json(401, { ok: false, error: "invalid_token", message: userErr?.message ?? "Token inválido." }, corsHeaders);
    }

    const payload = await req.json().catch(() => null) as any;
    const sentryEventId = String(payload?.sentry_event_id ?? "").trim();
    const userMessage = String(payload?.user_message ?? "").trim();
    const userEmail = (payload?.user_email ? String(payload.user_email).trim() : "") || user.email || "";
    const context = sanitizeForLog(payload?.context ?? {}) as any;
    const recentNetworkErrors = sanitizeForLog(payload?.recent_network_errors ?? []) as any;

    if (!sentryEventId || sentryEventId.length < 8) {
      return json(400, { ok: false, error: "invalid_payload", message: "sentry_event_id inválido." }, corsHeaders);
    }
    if (!userMessage || userMessage.length < 6) {
      return json(400, { ok: false, error: "invalid_payload", message: "user_message é obrigatório." }, corsHeaders);
    }

    const subjectPrefix = (Deno.env.get("ERROR_REPORT_SUBJECT_PREFIX") ?? "[REVO ERP][BUG]").trim();
    const subject = `${subjectPrefix} ${sentryEventId.slice(0, 8)} — ${context?.url ?? "sem-url"}`.slice(0, 200);

    const issueBody = [
      `**Sentry event id:** \`${sentryEventId}\``,
      ``,
      `**User message:**`,
      userMessage,
      ``,
      `**Context (sanitized):**`,
      "```json",
      JSON.stringify({ ...context, user_email: userEmail }, null, 2),
      "```",
      ``,
      `**Recent network errors (sanitized):**`,
      "```json",
      JSON.stringify(recentNetworkErrors, null, 2),
      "```",
    ].join("\n");

    const emailText = [
      `Sentry event id: ${sentryEventId}`,
      ``,
      `User message:`,
      userMessage,
      ``,
      `User: ${user.id} (${userEmail || "sem-email"})`,
      ``,
      `Context (sanitized):`,
      JSON.stringify({ ...context, user_email: userEmail }, null, 2),
      ``,
      `Recent network errors (sanitized):`,
      JSON.stringify(recentNetworkErrors, null, 2),
    ].join("\n");

    const githubLabels = String(Deno.env.get("GITHUB_ISSUE_LABELS") ?? "bug").split(",").map((s) => s.trim()).filter(Boolean);

    let emailOk = false;
    let githubOk = false;
    let githubIssueUrl: string | null = null;

    if (resendApiKey && reportEmailTo && reportEmailFrom) {
      await sendEmailViaResend({
        apiKey: resendApiKey,
        from: reportEmailFrom,
        to: reportEmailTo,
        subject,
        text: emailText,
      });
      emailOk = true;
    }

    if (githubToken && githubRepo) {
      const issue = await createGithubIssue({
        token: githubToken,
        repo: githubRepo,
        title: `${subjectPrefix} ${sentryEventId.slice(0, 8)} — ${userMessage.slice(0, 80)}`.slice(0, 200),
        body: issueBody,
        labels: githubLabels,
      });
      githubOk = true;
      githubIssueUrl = issue.html_url ?? null;
    }

    if (!emailOk && !githubOk) {
      return json(
        500,
        {
          ok: false,
          error: "config_error",
          message:
            "Nenhum destino configurado. Configure RESEND_API_KEY + ERROR_REPORT_EMAIL_TO/FROM e/ou GITHUB_TOKEN + GITHUB_REPO.",
        },
        corsHeaders,
      );
    }

    return json(200, { ok: true, email_ok: emailOk, github_ok: githubOk, github_issue_url: githubIssueUrl }, corsHeaders);
  } catch (e) {
    return json(
      500,
      {
        ok: false,
        error: "internal_server_error",
        message: "Falha ao enviar relatório. Tente novamente.",
      },
      corsHeaders,
    );
  }
});

