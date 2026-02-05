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
import {
  countOpsAppErrors,
  listOpsAppErrors,
  setOpsAppErrorStatus,
  setOpsAppErrorsStatusMany,
  type OpsAppErrorRow,
} from "@/services/opsAppErrors";
import { getOpsContextSnapshot } from "@/services/opsContext";

function formatDateTimeBR(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("pt-BR");
}

function toIsoStartOfDay(date: string) {
  if (!date) return null;
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}
function toIsoEndOfDay(date: string) {
  if (!date) return null;
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

function formatSla(createdAt?: string | null, status?: OpsAppErrorRow["status"] | null) {
  if (!createdAt) return null;
  if (!status || status === "corrigido" || status === "ignorado") return null;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return null;
  const hours = (Date.now() - created) / 36e5;
  if (hours <= 24) return null;
  return "SLA estourado (> 1 dia)";
}

function formatHttp(status?: number | null) {
  if (!status) return "—";
  return `HTTP ${status}`;
}

function buildDevMessage(row: OpsAppErrorRow, extra?: { userEmail?: string; userNote?: string }) {
  const where = row.route ?? "—";
  const action = row.last_action ? row.last_action : "—";
  const origin = typeof window !== "undefined" ? window.location?.origin ?? "" : "";
  const consoleMsg = row.message ?? "—";
  const networkLine =
    row.url || row.http_status || row.response_text
      ? `${row.method ?? "GET"} ${row.url ?? "—"} → ${row.http_status ?? "—"}`
      : "—";
  const response = row.response_text ?? "—";

  const blocks: string[] = [];
  blocks.push(`Ao acessar ${where} (última ação: ${action}) estou com console: ${consoleMsg}`);
  blocks.push("");
  blocks.push(`Network -> Response: (${networkLine}) ${response}`);
  blocks.push("");
  blocks.push(`source: ${row.source}`);
  if (origin) blocks.push(`origin: ${origin}`);
  if (row.request_id) blocks.push(`request_id: ${row.request_id}`);
  if (row.code) blocks.push(`code: ${row.code}`);
  if (extra?.userEmail) blocks.push(`email (opcional): ${extra.userEmail}`);
  if (extra?.userNote) blocks.push(`o que eu estava tentando fazer: ${extra.userNote}`);
  return blocks.join("\n");
}

export default function SystemErrorsPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [rows, setRows] = useState<OpsAppErrorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | OpsAppErrorRow["status"] | "all">("open");
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortState<"when" | "source" | "route" | "message" | "http" | "status">>({
    column: "when",
    direction: "desc",
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendRow, setSendRow] = useState<OpsAppErrorRow | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendNote, setSendNote] = useState("");

  const columns: TableColumnWidthDef[] = [
    { id: "select", defaultWidth: 44, minWidth: 44, resizable: false },
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
        { id: "when", type: "date", getValue: (r: OpsAppErrorRow) => r.last_seen_at ?? r.created_at ?? "" },
        { id: "source", type: "string", getValue: (r: OpsAppErrorRow) => r.source ?? "" },
        { id: "route", type: "string", getValue: (r: OpsAppErrorRow) => r.route ?? "" },
        { id: "message", type: "string", getValue: (r: OpsAppErrorRow) => r.message ?? "" },
        { id: "http", type: "number", getValue: (r: OpsAppErrorRow) => r.http_status ?? 0 },
        { id: "status", type: "string", getValue: (r: OpsAppErrorRow) => r.status ?? "" },
      ] as const
    );
  }, [rows, sort]);

  const visibleIds = useMemo(() => sorted.map((r) => r.id), [sorted]);
  const visibleSelectedCount = useMemo(() => visibleIds.filter((id) => selectedSet.has(id)).length, [visibleIds, selectedSet]);
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someVisibleSelected = visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qv = q.trim() ? q.trim() : null;
      const src = source.trim() ? source.trim() : null;
      const fromIso = toIsoStartOfDay(from);
      const toIso = toIsoEndOfDay(to);
      const statuses =
        statusFilter === "all"
          ? null
          : statusFilter === "open"
            ? (["novo", "investigando"] as const)
            : ([statusFilter] as const);
      const onlyOpen = statusFilter === "open";
      const [count, list] = await Promise.all([
        countOpsAppErrors({ q: qv, onlyOpen, source: src, statuses: statuses as any, from: fromIso, to: toIso }),
        listOpsAppErrors({ q: qv, onlyOpen, source: src, statuses: statuses as any, from: fromIso, to: toIso, limit: 100, offset: 0 }),
      ]);
      setTotal(count);
      setRows(list ?? []);
      setSelectedIds((prev) => prev.filter((id) => (list ?? []).some((r) => r.id === id)));
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
  }, [statusFilter]);

  const setStatus = async (id: string, status: OpsAppErrorRow["status"]) => {
    setSavingId(id);
    try {
      await setOpsAppErrorStatus(id, status);
      const label =
        status === "novo"
          ? "Reaberto."
          : status === "investigando"
            ? "Marcado como investigando."
            : status === "ignorado"
              ? "Marcado como ignorado."
              : "Marcado como corrigido.";
      addToast(label, "success");
      await load();
    } catch (e: any) {
      addToast(e?.message || "Falha ao atualizar status.", "error");
    } finally {
      setSavingId(null);
    }
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        const merged = new Set(prev);
        for (const id of visibleIds) merged.add(id);
        return Array.from(merged);
      }
      const visible = new Set(visibleIds);
      return prev.filter((id) => !visible.has(id));
    });
  };

  const bulkIgnoreSelected = async () => {
    const ids = selectedIds.slice();
    if (ids.length === 0) return;
    setBulkSaving(true);
    try {
      await setOpsAppErrorsStatusMany(ids, "ignorado");
      addToast(`Ignorado em lote: ${ids.length} item(ns).`, "success");
      setSelectedIds([]);
      await load();
    } catch (e: any) {
      addToast(e?.message || "Falha ao ignorar em lote.", "error");
    } finally {
      setBulkSaving(false);
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
    const subject = `Ultria ERP Beta — Erro no Sistema (${sendRow.source})`;
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
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-[220px] max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              title="Status"
            >
              <option value="open">Em aberto (novo + investigando)</option>
              <option value="novo">Novo</option>
              <option value="investigando">Investigando</option>
              <option value="corrigido">Corrigido</option>
              <option value="ignorado">Ignorado</option>
              <option value="all">Todos</option>
            </select>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[155px] max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                title="De"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[155px] max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                title="Até"
              />
            </div>
            <Button variant="secondary" onClick={load} className="gap-2" disabled={loading} title="Aplicar filtro">
              <Search size={16} />
              Filtrar
            </Button>
            <Button
              variant="outline"
              onClick={() => void bulkIgnoreSelected()}
              disabled={bulkSaving || selectedIds.length === 0}
              title={selectedIds.length === 0 ? "Selecione itens na lista para ignorar em lote." : "Ignorar itens selecionados"}
            >
              Ignorar selecionados ({selectedIds.length})
            </Button>
            {selectedIds.length > 0 ? (
              <Button variant="ghost" onClick={() => setSelectedIds([])} disabled={bulkSaving}>
                Limpar seleção
              </Button>
            ) : null}
          </div>
          <div className="text-xs text-slate-600">
            SLA (beta): <span className="font-semibold">1 dia útil</span>.
          </div>
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
                    <th className="p-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleSelected;
                        }}
                        onChange={(e) => toggleAllVisible(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                        aria-label="Selecionar todos visíveis"
                        disabled={sorted.length === 0}
                      />
                    </th>
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
                    <ResizableSortableTh
                      columnId="status"
                      label="Status"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <th className="p-3 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(r.id)}
                          onChange={(e) => toggleRow(r.id, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                          aria-label="Selecionar item"
                        />
                      </td>
                      <td className="p-3 text-slate-700">
                        <div>{formatDateTimeBR(r.last_seen_at ?? r.created_at)}</div>
                        {r.occurrences && r.occurrences > 1 ? (
                          <div className="mt-1 text-xs text-slate-500">{r.occurrences} ocorrências</div>
                        ) : null}
                        {r.last_seen_at && r.last_seen_at !== r.created_at ? (
                          <div className="mt-1 text-xs text-slate-500">1ª: {formatDateTimeBR(r.created_at)}</div>
                        ) : null}
                      </td>
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
                        <div className="flex flex-col gap-1">
                          {r.status === "corrigido" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700">
                              <CheckCircle2 size={14} /> Corrigido
                            </span>
                          ) : r.status === "ignorado" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                              <CheckCircle2 size={14} /> Ignorado
                            </span>
                          ) : r.status === "investigando" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                              <Circle size={14} /> Investigando
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <Circle size={14} /> Novo
                            </span>
                          )}
                          {formatSla(r.created_at, r.status) ? (
                            <span className="text-[11px] text-red-700">{formatSla(r.created_at, r.status)}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={savingId === r.id}
                            onClick={() => setStatus(r.id, r.status === "corrigido" || r.status === "ignorado" ? "novo" : "corrigido")}
                          >
                            {r.status === "corrigido" || r.status === "ignorado" ? "Reabrir" : "Corrigido"}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={savingId === r.id}
                            onClick={() => setStatus(r.id, r.status === "investigando" ? "novo" : "investigando")}
                            className="gap-2"
                            title="Marcar como investigando (ou voltar para novo)"
                          >
                            <Circle size={14} />
                            {r.status === "investigando" ? "Voltar p/ novo" : "Investigar"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={savingId === r.id}
                            onClick={() => setStatus(r.id, "ignorado")}
                            title="Ignorar (não é bug do sistema / não precisa correção)"
                          >
                            Ignorar
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
                      <td className="p-6 text-center text-slate-500" colSpan={8}>
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
