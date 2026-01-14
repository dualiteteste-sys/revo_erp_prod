import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Filter, RefreshCw } from "lucide-react";

import GlassCard from "@/components/ui/GlassCard";
import PageHeader from "@/components/ui/PageHeader";
import MultiSelect from "@/components/ui/MultiSelect";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { useHasPermission } from "@/hooks/useHasPermission";
import {
  listErrorReports,
  updateErrorReportStatus,
  type ErrorReportRow,
  type ErrorReportStatus,
} from "@/services/errorReports";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function toIsoStartOfDay(date: string) {
  if (!date) return null;
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}
function toIsoEndOfDay(date: string) {
  if (!date) return null;
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

const STATUS_OPTIONS: Array<{ label: string; value: ErrorReportStatus }> = [
  { label: "Novo", value: "new" },
  { label: "Triagem", value: "triaged" },
  { label: "Em progresso", value: "in_progress" },
  { label: "Resolvido", value: "resolved" },
  { label: "Ignorado", value: "ignored" },
];

function statusBadge(status: ErrorReportStatus) {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold";
  switch (status) {
    case "new":
      return `${base} bg-blue-600/10 text-blue-700 ring-1 ring-blue-600/20`;
    case "triaged":
      return `${base} bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-600/20`;
    case "in_progress":
      return `${base} bg-amber-600/10 text-amber-700 ring-1 ring-amber-600/20`;
    case "resolved":
      return `${base} bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/20`;
    case "ignored":
      return `${base} bg-slate-600/10 text-slate-700 ring-1 ring-slate-600/20`;
  }
}

function formatDateTimeBR(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR");
}

export default function ErrorReportsPage() {
  const { addToast } = useToast();
  const { userId } = useAuth();
  const canManage = useHasPermission("ops", "manage");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ErrorReportRow[]>([]);
  const [selected, setSelected] = useState<ErrorReportRow | null>(null);

  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<ErrorReportStatus[]>(["new", "triaged", "in_progress"]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [from, setFrom] = useState(() => {
    const dt = new Date();
    dt.setDate(dt.getDate() - 14);
    return dt.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listErrorReports({
        q,
        statuses,
        onlyMine,
        userId,
        from: toIsoStartOfDay(from) ?? undefined,
        to: toIsoEndOfDay(to) ?? undefined,
        limit: 200,
      });
      setRows(data);
    } catch (e: any) {
      addToast(e?.message || "Falha ao carregar erros.", "error", { durationMs: 8000 });
    } finally {
      setLoading(false);
    }
  }, [q, statuses, onlyMine, userId, from, to, addToast]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const counters = useMemo(() => {
    const by: Record<string, number> = { new: 0, triaged: 0, in_progress: 0, resolved: 0, ignored: 0 };
    for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
    return by;
  }, [rows]);

  const onChangeStatus = async (id: string, next: ErrorReportStatus) => {
    try {
      const updated = await updateErrorReportStatus(id, next);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      if (selected?.id === id) setSelected(updated);
      addToast("Status atualizado.", "success");
    } catch (e: any) {
      addToast(e?.message || "Falha ao atualizar status.", "error", { durationMs: 8000 });
    }
  };

  return (
    <div className="p-1">
      <PageHeader
        title="Error Reports (Beta)"
        description="Relatórios enviados pelos usuários (Sentry + Network/RPC sanitizados)."
        icon={<AlertTriangle className="h-6 w-6 text-amber-600" />}
      />

      <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <GlassCard className="p-4">
          <div className="text-xs text-slate-500">Novos</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{counters.new ?? 0}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-slate-500">Triagem</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{counters.triaged ?? 0}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-slate-500">Em progresso</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{counters.in_progress ?? 0}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-slate-500">Resolvidos</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{counters.resolved ?? 0}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-slate-500">Ignorados</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{counters.ignored ?? 0}</div>
        </GlassCard>
      </div>

      <GlassCard className="mt-4 p-4">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <Filter className="h-4 w-4" />
          Filtros
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="block text-sm font-semibold text-slate-900 mb-1">Buscar</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Mensagem, e-mail, Sentry ID, GitHub URL…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30"
            />
          </div>
          <div className="md:col-span-4">
            <MultiSelect
              label="Status"
              options={STATUS_OPTIONS}
              selected={statuses}
              onChange={(next) => setStatuses(next as ErrorReportStatus[])}
              placeholder="Selecionar status…"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-900 mb-1">De</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-900 mb-1">Até</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30"
            />
          </div>

          <div className="md:col-span-12 flex flex-wrap items-center gap-2 pt-1">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Apenas meus
            </label>
            <Button variant="outline" onClick={() => void fetchRows()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="mt-4 p-0 overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-[1050px] w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Entrega</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Mensagem</th>
                <th className="px-4 py-3 font-semibold">Sentry</th>
                <th className="px-4 py-3 font-semibold">GitHub</th>
                <th className="px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    Nenhum erro encontrado para os filtros atuais.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatDateTimeBR(r.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={statusBadge(r.status)}>
                        {r.status === "resolved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                        {STATUS_OPTIONS.find((s) => s.value === r.status)?.label ?? r.status}
                      </span>
                      {canManage && (
                        <div className="mt-2">
                          <select
                            value={r.status}
                            onChange={(e) => void onChangeStatus(r.id, e.target.value as ErrorReportStatus)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${r.email_ok ? "bg-emerald-600/10 text-emerald-700" : "bg-slate-600/10 text-slate-700"}`}>
                          Email {r.email_ok ? "ok" : "—"}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${r.github_ok ? "bg-emerald-600/10 text-emerald-700" : "bg-slate-600/10 text-slate-700"}`}>
                          GitHub {r.github_ok ? "ok" : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{r.user_email ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-900 max-w-[460px] truncate" title={r.user_message}>
                      {r.user_message}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-700">{r.sentry_event_id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.github_issue_url ? (
                        <a
                          href={r.github_issue_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                        >
                          Abrir <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="text-blue-700 font-semibold hover:underline"
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {selected && (
        <Dialog open={!!selected} onOpenChange={(open) => (!open ? setSelected(null) : undefined)}>
          <DialogContent className="max-w-3xl rounded-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes do erro</DialogTitle>
              <DialogDescription>
                ID: <span className="font-mono text-xs">{selected.id}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <GlassCard className="p-4">
                <div className="text-sm font-semibold text-slate-900">Mensagem do usuário</div>
                <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{selected.user_message}</div>
              </GlassCard>

              <GlassCard className="p-4">
                <div className="text-sm font-semibold text-slate-900">Contexto (sanitizado)</div>
                <pre className="mt-2 text-xs text-slate-700 whitespace-pre-wrap break-words">
                  {JSON.stringify(selected.context ?? {}, null, 2)}
                </pre>
              </GlassCard>

              <GlassCard className="p-4">
                <div className="text-sm font-semibold text-slate-900">Network / RPC recentes (sanitizado)</div>
                <pre className="mt-2 text-xs text-slate-700 whitespace-pre-wrap break-words">
                  {JSON.stringify(selected.recent_network_errors ?? [], null, 2)}
                </pre>
              </GlassCard>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              {selected.github_issue_url ? (
                <a
                  href={selected.github_issue_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-900 text-sm font-semibold hover:bg-slate-200"
                >
                  Abrir GitHub <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                Fechar
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

