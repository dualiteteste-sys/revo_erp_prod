import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, FileText, RefreshCw, Search, ShieldAlert, Send, Copy } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";
import PageShell from "@/components/ui/PageShell";
import PageCard from "@/components/ui/PageCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/contexts/ToastProvider";
import ResizableSortableTh, { type SortState } from "@/components/ui/table/ResizableSortableTh";
import TableColGroup from "@/components/ui/table/TableColGroup";
import { useTableColumnWidths, type TableColumnWidthDef } from "@/components/ui/table/useTableColumnWidths";
import { sortRows, toggleSort } from "@/components/ui/table/sortUtils";
import { countOpsAppErrors, listOpsAppErrors, setOpsAppErrorResolved, type OpsAppErrorRow } from "@/services/opsAppErrors";
import { getOpsContextSnapshot } from "@/services/opsContext";

function formatDateTimeBR(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("pt-BR");
}

function formatHttp(status?: number | null) {
  if (!status) return "—";
  return `HTTP ${status}`;
}

function buildDevMessage(row: OpsAppErrorRow, extra?: { userEmail?: string; userNote?: string }) {
  const where = row.route ?? "—";
  const action = row.last_action ? ` (última ação: ${row.last_action})` : "";
  const consoleMsg = row.message ?? "—";
  const network =
    row.url || row.http_status || row.response_text
      ? `(${row.method ?? "GET"} ${row.url ?? "—"} → ${row.http_status ?? "—"}) ${row.response_text ?? "—"}`
      : "—";

  const parts = [
    `Ao acessar ${where}${action} estou com console: ${consoleMsg} e Network -> Response: ${network}.`,
  ];
  if (row.request_id) parts.push(`request_id: ${row.request_id}`);
  if (row.code) parts.push(`code: ${row.code}`);
  if (extra?.userEmail) parts.push(`email: ${extra.userEmail}`);
  if (extra?.userNote) parts.push(`o que eu estava tentando fazer: ${extra.userNote}`);
  return parts.join("\n");
}

export default function SystemErrorsPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rows, setRows] = useState<OpsAppErrorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<string>("");
  const [sort, setSort] = useState<SortState<"when" | "source" | "route" | "message" | "http">>({
    column: "when",
    direction: "desc",
  });

  const [sendOpen, setSendOpen] = useState(false);
  const [sendRow, setSendRow] = useState<OpsAppErrorRow | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendNote, setSendNote] = useState("");

  const columns: TableColumnWidthDef[] = [
    { id: "when", defaultWidth: 190, minWidth: 170 },
    { id: "source", defaultWidth: 160, minWidth: 140 },
    { id: "route", defaultWidth: 320, minWidth: 220 },
    { id: "message", defaultWidth: 520, minWidth: 260 },
    { id: "http", defaultWidth: 260, minWidth: 220 },
    { id: "status", defaultWidth: 140, minWidth: 120, resizable: false },
    { id: "actions", defaultWidth: 260, minWidth: 220, resizable: false },
  ];

  const { widths, startResize } = useTableColumnWidths({
    tableId: "ops:system-errors",
    columns,
  });

  const sorted = useMemo(() => {
    return sortRows(
      rows,
      sort as any,
      [
        { id: "when", type: "date", getValue: (r: OpsAppErrorRow) => r.created_at ?? "" },
        { id: "source", type: "string", getValue: (r: OpsAppErrorRow) => r.source ?? "" },
        { id: "route", type: "string", getValue: (r: OpsAppErrorRow) => r.route ?? "" },
        { id: "message", type: "string", getValue: (r: OpsAppErrorRow) => r.message ?? "" },
        { id: "http", type: "number", getValue: (r: OpsAppErrorRow) => r.http_status ?? 0 },
      ] as const
    );
  }, [rows, sort]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qv = q.trim() ? q.trim() : null;
      const src = source.trim() ? source.trim() : null;
      const [count, list] = await Promise.all([
        countOpsAppErrors({ q: qv, onlyOpen, source: src }),
        listOpsAppErrors({ q: qv, onlyOpen, source: src, limit: 100, offset: 0 }),
      ]);
      setTotal(count);
      setRows(list ?? []);
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setError(e?.message || "Falha ao carregar erros.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyOpen]);

  const toggleResolved = async (id: string, resolved: boolean) => {
    setSavingId(id);
    try {
      await setOpsAppErrorResolved(id, resolved);
      addToast(resolved ? "Marcado como resolvido." : "Reaberto.", "success");
      await load();
    } catch (e: any) {
      addToast(e?.message || "Falha ao atualizar status.", "error");
    } finally {
      setSavingId(null);
    }
  };

  const openSend = (row: OpsAppErrorRow) => {
    setSendRow(row);
    setSendEmail("");
    setSendNote("");
    setSendOpen(true);
  };

  const mailtoHref = useMemo(() => {
    if (!sendRow) return "#";
    const body = buildDevMessage(sendRow, { userEmail: sendEmail.trim() || undefined, userNote: sendNote.trim() || undefined });
    const subject = `Revo ERP Beta — Erro no Sistema (${sendRow.source})`;
    return `mailto:bugs@revo.tec.br?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [sendRow, sendEmail, sendNote]);

  return (
    <PageShell
      header={
        <PageHeader
          title="Erros no Sistema"
          description="Eventos do console e falhas de rede (Network -> Response) capturados no cliente, para triagem e correção."
          icon={<ShieldAlert size={20} />}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    const snap = await getOpsContextSnapshot();
                    const sample = sorted.slice(0, 10);
                    await navigator.clipboard.writeText(JSON.stringify({ snapshot: snap, sample }, null, 2));
                    addToast("Amostra (10) copiada para a área de transferência.", "success");
                  } catch (e: any) {
                    addToast(e?.message || "Falha ao copiar amostra.", "error");
                  }
                }}
                className="gap-2"
                disabled={loading}
                title="Copia contexto + 10 erros mais recentes (ordenados)"
              >
                <FileText size={16} />
                Copiar amostra (10)
              </Button>
              <Button variant="outline" onClick={load} className="gap-2" disabled={loading}>
                <RefreshCw size={16} />
                Atualizar
              </Button>
            </div>
          }
        />
      }
      filters={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-[320px] max-w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por rota, request_id, url, código…"
                className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Fonte (ex.: console.error)"
              className="w-[220px] max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            />
            <Button variant="secondary" onClick={load} className="gap-2" disabled={loading} title="Aplicar filtro">
              <Search size={16} />
              Filtrar
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Mostrar apenas em aberto
          </label>
        </div>
      }
    >
      <PageCard className="space-y-3">
        <div className="text-xs text-slate-600">
          Total: <span className="font-semibold text-slate-900">{total}</span>
        </div>

        {loading ? (
          <div className="text-sm text-slate-600">Carregando…</div>
        ) : error ? (
          <div className="text-sm text-red-700">{error}</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full text-sm table-fixed">
                <TableColGroup columns={columns} widths={widths} />
                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                  <tr>
                    <ResizableSortableTh
                      columnId="when"
                      label="Quando"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="source"
                      label="Fonte"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="route"
                      label="Rota"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="message"
                      label="Mensagem"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="http"
                      label="Network"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="p-3 text-slate-700">{formatDateTimeBR(r.created_at)}</td>
                      <td className="p-3 font-mono text-slate-800 break-all">{r.source}</td>
                      <td className="p-3 font-mono text-slate-700 break-all">{r.route ?? "—"}</td>
                      <td className="p-3 text-slate-900">
                        <div className="line-clamp-2">{r.message}</div>
                        {r.last_action ? (
                          <div className="mt-1 text-xs text-slate-500">Ação: {r.last_action}</div>
                        ) : null}
                        {r.request_id ? <div className="mt-1 text-xs text-slate-500 font-mono">{r.request_id}</div> : null}
                      </td>
                      <td className="p-3">
                        <div className="text-xs text-slate-800">{formatHttp(r.http_status)}</div>
                        {r.url ? <div className="mt-1 text-[11px] font-mono text-slate-500 break-all">{r.url}</div> : null}
                      </td>
                      <td className="p-3">
                        {r.resolved ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 size={14} /> Resolvido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <Circle size={14} /> Em aberto
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={savingId === r.id}
                            onClick={() => toggleResolved(r.id, !r.resolved)}
                          >
                            {r.resolved ? "Reabrir" : "Resolver"}
                          </Button>
                          <Button variant="secondary" size="sm" className="gap-2" onClick={() => openSend(r)}>
                            <Send size={14} />
                            Enviar p/ Dev
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-slate-500" colSpan={7}>
                        Nenhum erro encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageCard>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enviar p/ Dev</DialogTitle>
            <DialogDescription>
              Mensagem pronta para colar aqui no Codex. O envio usa seu cliente de e-mail padrão.
            </DialogDescription>
          </DialogHeader>

          {sendRow ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-600">E-mail (opcional)</label>
                  <input
                    value={sendEmail}
                    onChange={(e) => setSendEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">O que você estava tentando fazer? (opcional)</label>
                  <input
                    value={sendNote}
                    onChange={(e) => setSendNote(e.target.value)}
                    placeholder="Ex.: tentar assinar o plano SCALE…"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-700">Mensagem</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={async () => {
                      const text = buildDevMessage(sendRow, {
                        userEmail: sendEmail.trim() || undefined,
                        userNote: sendNote.trim() || undefined,
                      });
                      await navigator.clipboard.writeText(text);
                      addToast("Mensagem copiada.", "success");
                    }}
                  >
                    <Copy size={14} />
                    Copiar
                  </Button>
                </div>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-800">{buildDevMessage(sendRow, { userEmail: sendEmail.trim() || undefined, userNote: sendNote.trim() || undefined })}</pre>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setSendOpen(false)}>
                  Fechar
                </Button>
                <a href={mailtoHref} className="inline-flex">
                  <Button className="gap-2">
                    <Send size={16} />
                    Enviar
                  </Button>
                </a>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

