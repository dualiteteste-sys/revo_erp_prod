import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import {
  getOpsHealthSummary,
  getBusinessKpisFunnelSummary,
  getProductMetricsSummary,
  listOpsRecentFailures,
  listOpsNfeWebhookErrors,
  listOpsFinanceDlq,
  listOpsEcommerceDlq,
  listOpsStripeWebhookErrors,
  dryRunEcommerceDlq,
  dryRunFinanceDlq,
  dryRunNfeWebhookEvent,
  dryRunStripeWebhookEvent,
  reprocessEcommerceDlq,
  reprocessFinanceDlq,
  reprocessNfeWebhookEvent,
  reprocessStripeWebhookEvent,
  seedEcommerceDlq,
  seedFinanceDlq,
  type DlqReprocessResult,
  type EcommerceDlqRow,
  type FinanceDlqRow,
  type NfeWebhookRow,
  type StripeWebhookRow,
  type OpsHealthSummary,
  type BusinessKpisFunnelSummary,
  type ProductMetricsSummary,
  type OpsRecentFailure,
} from '@/services/opsHealth';
import { useHasPermission } from '@/hooks/useHasPermission';
import { getEcommerceHealthSummary, type EcommerceHealthSummary } from '@/services/ecommerceIntegrations';
import { getWooStoreStatus, listWooStores } from '@/services/woocommerceControlPanel';
import { callRpc } from '@/lib/api';
import { useAppContext } from '@/contexts/AppContextProvider';
import { evaluateWooStoreHealthChecks, healthSeverityRank, type WooStoreHealthCheck } from '@/lib/integrations/woocommerce/healthChecks';
import {
  getEmpresaContextDiagnostics,
  opsDebugProdutosEmpresaDetails,
  opsDebugProdutosEmpresaIds,
  type EmpresaContextDiagnostics,
  type ProdutosEmpresaDetailsRow,
  type ProdutosEmpresaIdRow,
} from '@/services/tenantIsolation';

function formatDateTimeBR(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-BR');
}

export default function HealthPage() {
  const { addToast } = useToast();
  const isDev = import.meta.env.DEV;
  const permManage = useHasPermission('ops', 'manage');
  const permEcommerceView = useHasPermission('ecommerce', 'view');
  const { activeEmpresaId } = useAppContext();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<OpsHealthSummary | null>(null);
  const [productMetrics, setProductMetrics] = useState<ProductMetricsSummary | null>(null);
  const [businessKpis, setBusinessKpis] = useState<BusinessKpisFunnelSummary | null>(null);
  const [ecommerceHealth, setEcommerceHealth] = useState<EcommerceHealthSummary | null>(null);
  const [wooHealthChecks, setWooHealthChecks] = useState<WooStoreHealthCheck[]>([]);
  const [wooOpsSummary, setWooOpsSummary] = useState<{ pending: number; failed: number; last_activity_at: string | null } | null>(null);
  const [recent, setRecent] = useState<OpsRecentFailure[]>([]);
  const [nfeRows, setNfeRows] = useState<NfeWebhookRow[]>([]);
  const [financeDlqRows, setFinanceDlqRows] = useState<FinanceDlqRow[]>([]);
  const [ecommerceDlqRows, setEcommerceDlqRows] = useState<EcommerceDlqRow[]>([]);
  const [stripeRows, setStripeRows] = useState<StripeWebhookRow[]>([]);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reprocessingFinanceDlqId, setReprocessingFinanceDlqId] = useState<string | null>(null);
  const [reprocessingEcommerceDlqId, setReprocessingEcommerceDlqId] = useState<string | null>(null);
  const [reprocessingStripeId, setReprocessingStripeId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState<string>('Dry-run');
  const [previewDescription, setPreviewDescription] = useState<string>('');
  const [previewJson, setPreviewJson] = useState<DlqReprocessResult | null>(null);
  const [previewAction, setPreviewAction] = useState<null | { kind: 'finance' | 'ecommerce' | 'nfe' | 'stripe'; id: string }>(null);
  const [sortRecent, setSortRecent] = useState<SortState<'when' | 'kind' | 'message'>>({ column: 'when', direction: 'desc' });
  const [sortNfe, setSortNfe] = useState<SortState<'when' | 'event' | 'attempts' | 'error'>>({ column: 'when', direction: 'desc' });
  const [sortStripe, setSortStripe] = useState<SortState<'when' | 'event' | 'attempts' | 'error'>>({ column: 'when', direction: 'desc' });
  const [sortFinanceDlq, setSortFinanceDlq] = useState<SortState<'when' | 'type' | 'error'>>({ column: 'when', direction: 'desc' });
  const [sortEcommerceDlq, setSortEcommerceDlq] = useState<SortState<'when' | 'provider' | 'kind' | 'error'>>({ column: 'when', direction: 'desc' });
  const [tenantDiagLoading, setTenantDiagLoading] = useState(false);
  const [tenantDiag, setTenantDiag] = useState<EmpresaContextDiagnostics | null>(null);
  const [tenantDiagMismatch, setTenantDiagMismatch] = useState<
    null | {
      expectedEmpresaId: string;
      expectedEmpresaName?: string | null;
      mismatches: Array<
        | (ProdutosEmpresaDetailsRow & { empresa_nome?: string | null })
        | (ProdutosEmpresaIdRow & { empresa_nome?: string | null; produto_nome?: string | null; sku?: string | null })
      >;
    }
  >(null);

  const recentColumns: TableColumnWidthDef[] = [
    { id: 'when', defaultWidth: 190, minWidth: 170 },
    { id: 'kind', defaultWidth: 160, minWidth: 130 },
    { id: 'message', defaultWidth: 520, minWidth: 260 },
  ];
  const { widths: recentWidths, startResize: startRecentResize } = useTableColumnWidths({
    tableId: 'ops:health:recent-failures',
    columns: recentColumns,
  });

  const nfeColumns: TableColumnWidthDef[] = [
    { id: 'when', defaultWidth: 190, minWidth: 170 },
    { id: 'event', defaultWidth: 320, minWidth: 220 },
    { id: 'attempts', defaultWidth: 120, minWidth: 100 },
    { id: 'error', defaultWidth: 420, minWidth: 240 },
    { id: 'actions', defaultWidth: 220, minWidth: 200, resizable: false },
  ];
  const { widths: nfeWidths, startResize: startNfeResize } = useTableColumnWidths({
    tableId: 'ops:health:nfe-webhooks',
    columns: nfeColumns,
  });

  const stripeColumns: TableColumnWidthDef[] = [
    { id: 'when', defaultWidth: 190, minWidth: 170 },
    { id: 'event', defaultWidth: 260, minWidth: 200 },
    { id: 'attempts', defaultWidth: 120, minWidth: 100 },
    { id: 'error', defaultWidth: 420, minWidth: 240 },
    { id: 'actions', defaultWidth: 220, minWidth: 200, resizable: false },
  ];
  const { widths: stripeWidths, startResize: startStripeResize } = useTableColumnWidths({
    tableId: 'ops:health:stripe-webhooks',
    columns: stripeColumns,
  });

  const financeDlqColumns: TableColumnWidthDef[] = [
    { id: 'when', defaultWidth: 190, minWidth: 170 },
    { id: 'type', defaultWidth: 220, minWidth: 170 },
    { id: 'error', defaultWidth: 480, minWidth: 260 },
    { id: 'actions', defaultWidth: 220, minWidth: 200, resizable: false },
  ];
  const { widths: financeDlqWidths, startResize: startFinanceDlqResize } = useTableColumnWidths({
    tableId: 'ops:health:finance-dlq',
    columns: financeDlqColumns,
  });

  const ecommerceDlqColumns: TableColumnWidthDef[] = [
    { id: 'when', defaultWidth: 190, minWidth: 170 },
    { id: 'provider', defaultWidth: 160, minWidth: 140 },
    { id: 'kind', defaultWidth: 200, minWidth: 160 },
    { id: 'error', defaultWidth: 480, minWidth: 260 },
    { id: 'actions', defaultWidth: 220, minWidth: 200, resizable: false },
  ];
  const { widths: ecommerceDlqWidths, startResize: startEcommerceDlqResize } = useTableColumnWidths({
    tableId: 'ops:health:ecommerce-dlq',
    columns: ecommerceDlqColumns,
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, m, k, r, eh] = await Promise.all([
        getOpsHealthSummary(),
        getProductMetricsSummary().catch(() => null),
        getBusinessKpisFunnelSummary().catch(() => null),
        listOpsRecentFailures({ limit: 30 }),
        permEcommerceView.data ? getEcommerceHealthSummary().catch(() => null) : Promise.resolve(null),
      ]);
      setSummary(s);
      setProductMetrics(m);
      setBusinessKpis(k);
      setRecent(r ?? []);
      setEcommerceHealth(eh);
      if (permEcommerceView.data && activeEmpresaId) {
        try {
          const stores = await listWooStores(activeEmpresaId);
          const statuses = await Promise.all(
            stores.map(async (store) => {
              try {
                const status = await getWooStoreStatus(activeEmpresaId, store.id);
                const checks = evaluateWooStoreHealthChecks({
                  storeId: store.id,
                  storeUrl: store.base_url,
                  status,
                });
                return { status, checks };
              } catch {
                return { status: null, checks: [] as WooStoreHealthCheck[] };
              }
            }),
          );
          setWooHealthChecks(statuses.flatMap((row) => row.checks));
          const pending = statuses.reduce((sum, row) => sum + Number((row.status as any)?.queue?.pending_total ?? 0), 0);
          const failed = statuses.reduce((sum, row) => sum + Number((row.status as any)?.queue?.error ?? 0) + Number((row.status as any)?.queue?.dead ?? 0), 0);
          const sortedActivities = statuses
            .map((row) => String((row.status as any)?.orders?.last_imported_at ?? (row.status as any)?.health?.last_healthcheck_at ?? ''))
            .filter(Boolean)
            .sort();
          const lastActivityAt = sortedActivities.length ? sortedActivities[sortedActivities.length - 1] : null;
          setWooOpsSummary({ pending, failed, last_activity_at: lastActivityAt || null });
        } catch {
          setWooHealthChecks([]);
          setWooOpsSummary(null);
        }
      } else {
        setWooHealthChecks([]);
        setWooOpsSummary(null);
      }

      // "Ops Health" detalhado: depende de permissão interna (ops/manage).
      if (!permManage.data) {
        setNfeRows([]);
        setFinanceDlqRows([]);
        setEcommerceDlqRows([]);
        setStripeRows([]);
        return;
      }

      const [nfeData, finDlqData, ecoDlqData, stripeData] = await Promise.all([
        listOpsNfeWebhookErrors({ limit: 30 }),
        listOpsFinanceDlq({ limit: 30 }),
        permEcommerceView.data ? listOpsEcommerceDlq({ limit: 30 }) : Promise.resolve([]),
        listOpsStripeWebhookErrors({ limit: 30 }),
      ]);

      setNfeRows(nfeData ?? []);
      setFinanceDlqRows(finDlqData ?? []);
      setEcommerceDlqRows(ecoDlqData ?? []);
      setStripeRows(stripeData ?? []);
    } catch (e: any) {
      const msg = e?.message || 'Falha ao carregar monitor de saúde.';
      addToast(msg, 'error');
      setLoadError(msg);
      setSummary(null);
      setProductMetrics(null);
      setBusinessKpis(null);
      setEcommerceHealth(null);
      setWooHealthChecks([]);
      setWooOpsSummary(null);
      setRecent([]);
      setNfeRows([]);
      setFinanceDlqRows([]);
      setEcommerceDlqRows([]);
      setStripeRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, addToast, permEcommerceView.data, permManage.data]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const runTenantIsolationProbe = useCallback(async () => {
    setTenantDiagLoading(true);
    setTenantDiagMismatch(null);
    try {
      const diag = await getEmpresaContextDiagnostics().catch(() => null);
      setTenantDiag(diag);

      if (!activeEmpresaId) {
        addToast('Sem empresa ativa no contexto do app. Abra o seletor de empresa e tente novamente.', 'warning');
        return;
      }

      const rows = await callRpc<Array<{ id: string }>>('produtos_list_for_current_user', {
        p_limit: 50,
        p_offset: 0,
        p_q: null,
        p_status: null,
        p_order: 'created_at desc',
      });

      const ids = (rows ?? []).map((r) => r.id).filter(Boolean);
      const map =
        (await opsDebugProdutosEmpresaDetails(ids).catch(() => null)) ??
        (await opsDebugProdutosEmpresaIds(ids));
      const mismatches = map.filter((r) => r.empresa_id !== activeEmpresaId);

      if (mismatches.length) {
        const expectedEmpresaName =
          diag?.ok && diag.user_active_empresa_id === activeEmpresaId
            ? (diag.user_active_empresa_name ?? null)
            : diag?.ok && diag.current_empresa_id === activeEmpresaId
              ? (diag.current_empresa_name ?? null)
              : null;

        setTenantDiagMismatch({ expectedEmpresaId: activeEmpresaId, expectedEmpresaName, mismatches });
        addToast(`Possível vazamento detectado: ${mismatches.length} item(ns) com empresa_id diferente da empresa ativa.`, 'error');
      } else {
        addToast('OK: nenhum indício de vazamento (produtos retornaram empresa_id compatível).', 'success');
      }
    } catch (e: any) {
      const msg = e?.message || 'Falha ao rodar diagnóstico multi-tenant.';
      addToast(msg, 'error');
    } finally {
      setTenantDiagLoading(false);
    }
  }, [activeEmpresaId, addToast]);

  const tenantDiagSummary = useMemo(() => {
    if (!tenantDiag) return null;
    if (!tenantDiag.ok) return `Diagnóstico indisponível (${tenantDiag.reason ?? 'unknown'}).`;
    const who = tenantDiag.user_email ? `user=${tenantDiag.user_email}` : `user_id=${tenantDiag.user_id ?? '—'}`;
    const current = tenantDiag.current_empresa_id
      ? `${tenantDiag.current_empresa_id}${tenantDiag.current_empresa_name ? ` (${tenantDiag.current_empresa_name})` : ''}`
      : 'null';
    const active = tenantDiag.user_active_empresa_id
      ? `${tenantDiag.user_active_empresa_id}${tenantDiag.user_active_empresa_name ? ` (${tenantDiag.user_active_empresa_name})` : ''}`
      : 'null';
    const guc = tenantDiag.guc_current_empresa_id
      ? `${tenantDiag.guc_current_empresa_id}${tenantDiag.guc_current_empresa_name ? ` (${tenantDiag.guc_current_empresa_name})` : ''}`
      : 'null';
    return `${who} | ctx.current_empresa_id=${current} | user_active=${active} | guc=${guc} | memberships=${tenantDiag.memberships_count ?? 0}`;
  }, [tenantDiag]);

  const canReprocess = !!permManage.data;
  const canSeeEcommerce = !!permEcommerceView.data;
  const recentSorted = sortRows(
    recent,
    sortRecent as any,
    [
      { id: 'when', type: 'date', getValue: (r: OpsRecentFailure) => r.occurred_at ?? '' },
      { id: 'kind', type: 'string', getValue: (r: OpsRecentFailure) => r.kind ?? '' },
      { id: 'message', type: 'string', getValue: (r: OpsRecentFailure) => r.message ?? '' },
    ] as const
  );

  const nfeSorted = sortRows(
    nfeRows,
    sortNfe as any,
    [
      { id: 'when', type: 'date', getValue: (r: NfeWebhookRow) => r.received_at ?? '' },
      { id: 'event', type: 'string', getValue: (r: NfeWebhookRow) => r.event_type ?? '' },
      { id: 'attempts', type: 'number', getValue: (r: NfeWebhookRow) => r.process_attempts ?? 0 },
      { id: 'error', type: 'string', getValue: (r: NfeWebhookRow) => r.last_error ?? '' },
    ] as const
  );

  const stripeSorted = sortRows(
    stripeRows,
    sortStripe as any,
    [
      { id: 'when', type: 'date', getValue: (r: StripeWebhookRow) => r.received_at ?? '' },
      { id: 'event', type: 'string', getValue: (r: StripeWebhookRow) => r.event_type ?? '' },
      { id: 'attempts', type: 'number', getValue: (r: StripeWebhookRow) => r.process_attempts ?? 0 },
      { id: 'error', type: 'string', getValue: (r: StripeWebhookRow) => r.last_error ?? '' },
    ] as const
  );

  const financeDlqSorted = sortRows(
    financeDlqRows,
    sortFinanceDlq as any,
    [
      { id: 'when', type: 'date', getValue: (r: FinanceDlqRow) => r.dead_lettered_at ?? '' },
      { id: 'type', type: 'string', getValue: (r: FinanceDlqRow) => r.job_type ?? '' },
      { id: 'error', type: 'string', getValue: (r: FinanceDlqRow) => r.last_error ?? '' },
    ] as const
  );

  const ecommerceDlqSorted = sortRows(
    ecommerceDlqRows,
    sortEcommerceDlq as any,
    [
      { id: 'when', type: 'date', getValue: (r: EcommerceDlqRow) => r.failed_at ?? '' },
      { id: 'provider', type: 'string', getValue: (r: EcommerceDlqRow) => r.provider ?? '' },
      { id: 'kind', type: 'string', getValue: (r: EcommerceDlqRow) => r.kind ?? '' },
      { id: 'error', type: 'string', getValue: (r: EcommerceDlqRow) => r.last_error ?? '' },
    ] as const
  );

  const wooChecksSorted = useMemo(() => {
    return [...wooHealthChecks].sort((a, b) => {
      const severityDiff = healthSeverityRank(b.severity) - healthSeverityRank(a.severity);
      if (severityDiff !== 0) return severityDiff;
      const codeDiff = a.code.localeCompare(b.code);
      if (codeDiff !== 0) return codeDiff;
      return a.store_url.localeCompare(b.store_url);
    });
  }, [wooHealthChecks]);

  const wooChecksSummary = useMemo(() => {
    return wooHealthChecks.reduce(
      (acc, check) => {
        if (check.severity === 'critical') acc.critical += 1;
        else if (check.severity === 'warning') acc.warning += 1;
        else acc.info += 1;
        return acc;
      },
      { critical: 0, warning: 0, info: 0 },
    );
  }, [wooHealthChecks]);

  const openPreview = (
    title: string,
    description: string,
    data: DlqReprocessResult,
    action: { kind: 'finance' | 'ecommerce' | 'nfe' | 'stripe'; id: string }
  ) => {
    setPreviewTitle(title);
    setPreviewDescription(description);
    setPreviewJson(data);
    setPreviewAction(action);
    setPreviewOpen(true);
  };

  const handleDryRunNfe = async (id: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    try {
      const res = await dryRunNfeWebhookEvent(id);
      openPreview('Dry-run: NF-e', 'Prévia das mudanças (não altera dados).', res, { kind: 'nfe', id });
    } catch (e: any) {
      addToast(e?.message || 'Falha no dry-run.', 'error');
    }
  };

  const handleDryRunStripe = async (id: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    try {
      const res = await dryRunStripeWebhookEvent(id);
      openPreview('Dry-run: Stripe', 'Prévia do replay do webhook (não altera dados).', res, { kind: 'stripe', id });
    } catch (e: any) {
      addToast(e?.message || 'Falha no dry-run.', 'error');
    }
  };

  const handleReprocess = async (id: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    if (reprocessingId) return;

    setReprocessingId(id);
    try {
      await reprocessNfeWebhookEvent(id);
      addToast('Evento reenfileirado para reprocessamento.', 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reenfileirar evento.', 'error');
    } finally {
      setReprocessingId(null);
    }
  };

  const handleReprocessStripe = async (id: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    if (reprocessingStripeId) return;
    setReprocessingStripeId(id);
    try {
      await reprocessStripeWebhookEvent(id);
      addToast('Webhook Stripe reprocessado.', 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reprocessar webhook Stripe.', 'error');
    } finally {
      setReprocessingStripeId(null);
    }
  };

  const handleDryRunFinanceDlq = async (dlqId: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    try {
      const res = await dryRunFinanceDlq(dlqId);
      openPreview('Dry-run: Financeiro (DLQ)', 'Prévia do job que seria reenfileirado (não altera dados).', res, { kind: 'finance', id: dlqId });
    } catch (e: any) {
      addToast(e?.message || 'Falha no dry-run.', 'error');
    }
  };

  const handleReprocessFinanceDlq = async (dlqId: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    if (reprocessingFinanceDlqId) return;

    setReprocessingFinanceDlqId(dlqId);
    try {
      await reprocessFinanceDlq(dlqId);
      addToast('Job reenfileirado a partir da DLQ.', 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reenfileirar job da DLQ.', 'error');
    } finally {
      setReprocessingFinanceDlqId(null);
    }
  };

  const handleDryRunEcommerceDlq = async (dlqId: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    try {
      const res = await dryRunEcommerceDlq(dlqId);
      openPreview('Dry-run: Marketplaces (DLQ)', 'Prévia do job que seria reenfileirado (não altera dados).', res, { kind: 'ecommerce', id: dlqId });
    } catch (e: any) {
      addToast(e?.message || 'Falha no dry-run.', 'error');
    }
  };

  const handleReprocessEcommerceDlq = async (dlqId: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    if (reprocessingEcommerceDlqId) return;

    setReprocessingEcommerceDlqId(dlqId);
    try {
      await reprocessEcommerceDlq(dlqId);
      addToast('Job reenfileirado a partir da DLQ.', 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reenfileirar job da DLQ.', 'error');
    } finally {
      setReprocessingEcommerceDlqId(null);
    }
  };

  const handleSeedFinanceDlq = async () => {
    if (!canReprocess) {
      addToast('Sem permissão para criar seed.', 'warning');
      return;
    }
    try {
      const id = await seedFinanceDlq('test');
      addToast(`Seed criado na DLQ (financeiro): ${id}`, 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao criar seed.', 'error');
    }
  };

  const handleSeedEcommerceDlq = async () => {
    if (!canReprocess) {
      addToast('Sem permissão para criar seed.', 'warning');
      return;
    }
    try {
      const id = await seedEcommerceDlq('meli', 'test');
      addToast(`Seed criado na DLQ (marketplaces): ${id}`, 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao criar seed.', 'error');
    }
  };

  const handleExecutePreviewAction = async () => {
    if (!previewAction) return;
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    try {
      if (previewAction.kind === 'finance') {
        await handleReprocessFinanceDlq(previewAction.id);
      } else if (previewAction.kind === 'ecommerce') {
        await handleReprocessEcommerceDlq(previewAction.id);
      } else if (previewAction.kind === 'stripe') {
        await handleReprocessStripe(previewAction.id);
      } else {
        await handleReprocess(previewAction.id);
      }
      setPreviewOpen(false);
    } catch {
      // handlers já mostram toast
    }
  };

  const cards = useMemo(() => {
    const s = summary;
    return [
      {
        title: 'Erros do App (24h)',
        value: s?.app_errors ?? 0,
        icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
        hint: 'Erros JS/React capturados pelos handlers globais.',
      },
      {
        title: 'Eventos DB (24h)',
        value: s?.db_events ?? 0,
        icon: <ShieldCheck className="w-5 h-5 text-slate-700" />,
        hint: 'Mudanças em tabelas auditadas (audit_logs).',
      },
      {
        title: 'NF-e pendentes',
        value: s?.nfe_webhooks?.pending ?? 0,
        icon: <Activity className="w-5 h-5 text-blue-600" />,
        hint: 'Webhooks prontos para processamento (next_retry_at <= now).',
      },
      {
        title: 'NF-e com falha',
        value: s?.nfe_webhooks?.failed ?? 0,
        icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
        hint: 'Webhooks sem processed_at e com last_error.',
      },
      {
        title: 'Financeiro pendentes',
        value: s?.finance?.pending ?? 0,
        icon: <Activity className="w-5 h-5 text-emerald-600" />,
        hint: 'Jobs pendentes/processando no financeiro.',
      },
      {
        title: 'Financeiro com falha',
        value: s?.finance?.failed ?? 0,
        icon: <AlertTriangle className="w-5 h-5 text-rose-600" />,
        hint: 'Jobs com status failed (retriáveis).',
      },
      {
        title: 'Stripe pendentes',
        value: s?.stripe?.pending ?? 0,
        icon: <Activity className="w-5 h-5 text-indigo-600" />,
        hint: 'Eventos prontos para processamento (next_retry_at <= now).',
      },
      {
        title: 'Stripe com falha',
        value: s?.stripe?.failed ?? 0,
        icon: <AlertTriangle className="w-5 h-5 text-purple-600" />,
        hint: 'Eventos sem processed_at e com last_error.',
      },
    ];
  }, [summary]);

  const metricCards = useMemo(() => {
    const m = productMetrics;
    return [
      {
        title: 'RPC p95 (ms)',
        value: m?.rpc?.p95_ms ?? 0,
        icon: <Activity className="w-5 h-5 text-indigo-600" />,
        hint: 'Latência p95 (eventos metric.rpc).',
      },
      {
        title: 'RPC erro (%)',
        value: m?.rpc?.error_rate_pct ?? 0,
        icon: <AlertTriangle className="w-5 h-5 text-amber-700" />,
        hint: 'Taxa de erro na janela (metric.rpc ok=false).',
      },
      {
        title: 'First value (min ms)',
        value: m?.first_value?.min_ms ?? 0,
        icon: <ShieldCheck className="w-5 h-5 text-slate-700" />,
        hint: 'Tempo mínimo até “primeiro valor” (metric.first_value).',
      },
    ];
  }, [productMetrics]);

  const funnelCards = useMemo(() => {
    const k = businessKpis;
    const ok = !!k?.ok;
    const setupText = ok && k?.setup ? `${k.setup.ok}/${k.setup.total}` : '—';
    const setupHint = ok && k?.setup?.done ? 'Setup concluído.' : 'Complete o mínimo para operar.';
    const saleDays = ok ? k?.first_sale?.days_to_first : null;
    const nfeDays = ok ? k?.first_nfe?.days_to_first : null;
    const payDays = ok ? k?.first_payment?.days_to_first : null;
    return [
      {
        title: 'Setup (onboarding)',
        value: setupText as string | number,
        icon: <ShieldCheck className="w-5 h-5 text-slate-700" />,
        hint: setupHint,
      },
      {
        title: '1ª venda (dias)',
        value: (typeof saleDays === 'number' ? saleDays : '—') as string | number,
        icon: <Activity className="w-5 h-5 text-indigo-600" />,
        hint: ok && k?.first_sale?.at ? `Primeira venda em ${formatDateTimeBR(k.first_sale.at)}.` : 'Ainda não houve venda.',
      },
      {
        title: '1ª NF-e (dias)',
        value: (typeof nfeDays === 'number' ? nfeDays : '—') as string | number,
        icon: <Activity className="w-5 h-5 text-blue-600" />,
        hint: ok && k?.first_nfe?.at ? `Primeira NF-e em ${formatDateTimeBR(k.first_nfe.at)}.` : 'Ainda não houve NF-e emitida.',
      },
      {
        title: '1º recebimento (dias)',
        value: (typeof payDays === 'number' ? payDays : '—') as string | number,
        icon: <Activity className="w-5 h-5 text-emerald-600" />,
        hint: ok && k?.first_payment?.at ? `Primeiro recebimento em ${formatDateTimeBR(k.first_payment.at)}.` : 'Ainda não houve recebimento.',
      },
    ];
  }, [businessKpis]);

  return (
    <div className="p-1 flex flex-col gap-4">
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
            <DialogDescription>{previewDescription}</DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <pre className="text-xs whitespace-pre-wrap break-words text-gray-800">
              {previewJson ? JSON.stringify(previewJson, null, 2) : '—'}
            </pre>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Fechar
            </Button>
            {previewAction ? (
              <Button onClick={handleExecutePreviewAction} className="gap-2">
                <RotateCcw size={16} />
                Reprocessar agora
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <PageHeader
        title="Saúde do sistema"
        description="Falhas recentes, filas, DLQs e sinais de drift operacional."
        icon={<Activity className="w-5 h-5" />}
        actions={
          <Button onClick={fetchAll} variant="outline" className="gap-2" disabled={loading}>
            <RefreshCw size={16} />
            Atualizar
          </Button>
        }
      />

      <GlassCard className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-[260px]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <div className="text-sm font-semibold text-gray-900">Isolamento multi-tenant (diagnóstico)</div>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Valida por ID se os registros retornados pertencem à empresa ativa. Use para investigar “vazamento”.
            </div>
            {tenantDiagSummary ? (
              <div className="mt-2 text-xs text-gray-600 font-mono break-all">{tenantDiagSummary}</div>
            ) : null}
            {tenantDiagMismatch ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <div className="text-xs font-semibold text-rose-900">Possível vazamento detectado</div>
                <div className="mt-1 text-xs text-rose-800">
                  empresa ativa esperada:{' '}
                  <span className="font-mono">{tenantDiagMismatch.expectedEmpresaId}</span>
                  {tenantDiagMismatch.expectedEmpresaName ? (
                    <span className="ml-2 text-rose-900">({tenantDiagMismatch.expectedEmpresaName})</span>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-rose-800">
                  exemplos (até 5):
                  <ul className="mt-1 list-disc pl-5">
                    {tenantDiagMismatch.mismatches.slice(0, 5).map((m) => (
                      <li key={m.id}>
                        <div className="flex flex-col gap-0.5">
                          <div>
                            <span className="font-mono">{m.id}</span>{' '}
                            {m.produto_nome || m.sku ? (
                              <span className="text-rose-900">
                                — {m.produto_nome ?? '—'}
                                {m.sku ? ` (${m.sku})` : ''}
                              </span>
                            ) : null}
                          </div>
                          <div>
                            → <span className="font-mono">{m.empresa_id}</span>
                            {m.empresa_nome ? <span className="ml-2 text-rose-900">({m.empresa_nome})</span> : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button onClick={runTenantIsolationProbe} disabled={tenantDiagLoading} className="gap-2">
              {tenantDiagLoading ? 'Verificando…' : 'Verificar (Produtos)'}
            </Button>
          </div>
        </div>
      </GlassCard>

      {!loading && loadError && (
        <GlassCard className="p-4 border border-rose-200 bg-rose-50/60">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-rose-900">Não foi possível carregar o painel</div>
              <div className="text-sm text-rose-800">{loadError}</div>
              <div className="mt-1 text-xs text-rose-700">
                Dica: tente novamente. Se persistir, abra os logs para identificar a falha.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={fetchAll} variant="outline" className="gap-2">
                <RefreshCw size={16} />
                Tentar novamente
              </Button>
              <a
                href="/app/desenvolvedor/logs"
                className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
              >
                Abrir logs
              </a>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map((c) => (
          <GlassCard key={c.title} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {c.icon}
                <div className="text-sm font-medium text-gray-700">{c.title}</div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{c.value}</div>
            </div>
            <div className="mt-2 text-xs text-gray-500">{c.hint}</div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {metricCards.map((c) => (
          <GlassCard key={c.title} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {c.icon}
                <div className="text-sm font-medium text-gray-700">{c.title}</div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{c.value}</div>
            </div>
            <div className="mt-2 text-xs text-gray-500">{c.hint}</div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {funnelCards.map((c) => (
          <GlassCard key={c.title} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {c.icon}
                <div className="text-sm font-medium text-gray-700">{c.title}</div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{c.value}</div>
            </div>
            <div className="mt-2 text-xs text-gray-500">{c.hint}</div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-4">
          <div className="text-sm font-medium text-gray-700">Marketplaces (fila)</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">
            {typeof ecommerceHealth?.pending === 'number' || typeof wooOpsSummary?.pending === 'number'
              ? Number(ecommerceHealth?.pending ?? 0) + Number(wooOpsSummary?.pending ?? 0)
              : '—'}
          </div>
          <div className="mt-1 text-xs text-gray-500">pendentes/processando (inclui Woo)</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-sm font-medium text-gray-700">Marketplaces (falhas 24h)</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">
            {typeof ecommerceHealth?.failed_24h === 'number' || typeof wooOpsSummary?.failed === 'number'
              ? Number(ecommerceHealth?.failed_24h ?? 0) + Number(wooOpsSummary?.failed ?? 0)
              : '—'}
          </div>
          <div className="mt-1 text-xs text-gray-500">últimas 24h (inclui Woo)</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-sm font-medium text-gray-700">Marketplaces (último sync)</div>
          <div className="mt-2 text-sm font-semibold text-gray-900">
            {(() => {
              const candidates = [ecommerceHealth?.last_sync_at ?? null, wooOpsSummary?.last_activity_at ?? null].filter(Boolean) as string[];
              const sorted = candidates.sort();
              const best = sorted.length ? sorted[sorted.length - 1] : null;
              return best ? formatDateTimeBR(best) : '—';
            })()}
          </div>
          <div className="mt-1 text-xs text-gray-500">{canSeeEcommerce ? 'conexões + Woo (atividade recente)' : 'sem permissão ecommerce:view'}</div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold text-gray-900">WooCommerce — Checks por store</div>
          <div className="text-xs text-gray-500">
            {canSeeEcommerce ? `${wooHealthChecks.length} checks` : 'sem permissão ecommerce:view'}
          </div>
        </div>

        {!canSeeEcommerce ? (
          <div className="text-sm text-gray-600">Sem permissão para visualizar checks WooCommerce.</div>
        ) : wooHealthChecks.length === 0 ? (
          <div className="text-sm text-gray-600">Sem dados de checks Woo no momento.</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="text-xs text-red-700">Críticos</div>
                <div className="text-2xl font-semibold text-red-800">{wooChecksSummary.critical}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs text-amber-700">Avisos</div>
                <div className="text-2xl font-semibold text-amber-800">{wooChecksSummary.warning}</div>
              </div>
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                <div className="text-xs text-sky-700">Info</div>
                <div className="text-2xl font-semibold text-sky-800">{wooChecksSummary.info}</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Severidade</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Check</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Store</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Mensagem</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Próxima ação</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Painel</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {wooChecksSorted.map((check, idx) => {
                    const badgeClass =
                      check.severity === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : check.severity === 'warning'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-sky-100 text-sky-700';
                    return (
                      <tr key={`${check.store_id}-${check.code}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                            {check.severity.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-800">{check.code}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{check.store_url}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{check.message}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{check.next_action}</td>
                        <td className="px-3 py-2 text-right">
                          <a href={check.panel_link} className="text-sm font-medium text-blue-700 hover:underline">
                            Abrir store
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-gray-900">Falhas recentes</div>
            <div className="text-xs text-gray-500">últimas 24h</div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Carregando…</div>
          ) : recent.length === 0 ? (
            <div className="text-sm text-gray-600">Nenhuma falha relevante encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <TableColGroup columns={recentColumns} widths={recentWidths} />
                <thead className="bg-gray-50">
                  <tr>
                    <ResizableSortableTh
                      columnId="when"
                      label="Quando"
                      sort={sortRecent}
                      onSort={(col) => setSortRecent((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startRecentResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="kind"
                      label="Tipo"
                      sort={sortRecent}
                      onSort={(col) => setSortRecent((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startRecentResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="message"
                      label="Mensagem"
                      sort={sortRecent}
                      onSort={(col) => setSortRecent((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startRecentResize}
                      className="px-3 py-2"
                    />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentSorted.map((r, idx) => (
                    <tr key={`${r.kind}-${r.occurred_at}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTimeBR(r.occurred_at)}</td>
                      <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{r.kind}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-gray-900">NF-e — webhooks com falha</div>
            <div className="text-xs text-gray-500">{canReprocess ? 'reprocessamento habilitado' : 'sem permissão para reprocessar'}</div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Carregando…</div>
          ) : nfeRows.length === 0 ? (
            <div className="text-sm text-gray-600">Nenhum webhook em falha.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <TableColGroup columns={nfeColumns} widths={nfeWidths} />
                <thead className="bg-gray-50">
                  <tr>
                    <ResizableSortableTh
                      columnId="when"
                      label="Quando"
                      sort={sortNfe}
                      onSort={(col) => setSortNfe((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startNfeResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="event"
                      label="Evento"
                      sort={sortNfe}
                      onSort={(col) => setSortNfe((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startNfeResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="attempts"
                      label="Tent."
                      sort={sortNfe}
                      onSort={(col) => setSortNfe((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startNfeResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="error"
                      label="Erro"
                      sort={sortNfe}
                      onSort={(col) => setSortNfe((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startNfeResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="actions"
                      label={<span className="sr-only">Ações</span>}
                      sortable={false}
                      sort={sortNfe}
                      onResizeStart={startNfeResize}
                      className="px-3 py-2"
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {nfeSorted.map((e) => {
                    const busy = reprocessingId === e.id;
                    return (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTimeBR(e.received_at)}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">
                          <div className="font-medium">{e.event_type || '—'}</div>
                          <div className="text-xs text-gray-500">
                            {e.provider ? `Provedor: ${e.provider}` : 'Provedor: —'}
                            {e.nfeio_id ? ` • Ref: ${e.nfeio_id}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{e.process_attempts ?? 0}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 max-w-[360px] truncate" title={e.last_error || ''}>
                          {e.last_error || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleDryRunNfe(e.id)}
                              disabled={!canReprocess || busy}
                            >
                              Dry-run
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleReprocess(e.id)}
                              disabled={!canReprocess || busy}
                              title={canReprocess ? 'Reenfileirar agora' : 'Sem permissão'}
                            >
                              <RotateCcw size={14} />
                              Reprocessar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-gray-900">Stripe — webhooks com falha</div>
            <div className="text-xs text-gray-500">{canReprocess ? 'reprocessamento habilitado' : 'sem permissão para reprocessar'}</div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Carregando…</div>
          ) : stripeRows.length === 0 ? (
            <div className="text-sm text-gray-600">Nenhum webhook em falha.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <TableColGroup columns={stripeColumns} widths={stripeWidths} />
                <thead className="bg-gray-50">
                  <tr>
                    <ResizableSortableTh
                      columnId="when"
                      label="Quando"
                      sort={sortStripe}
                      onSort={(col) => setSortStripe((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startStripeResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="event"
                      label="Evento"
                      sort={sortStripe}
                      onSort={(col) => setSortStripe((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startStripeResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="attempts"
                      label="Tent."
                      sort={sortStripe}
                      onSort={(col) => setSortStripe((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startStripeResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="error"
                      label="Erro"
                      sort={sortStripe}
                      onSort={(col) => setSortStripe((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startStripeResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="actions"
                      label={<span className="sr-only">Ações</span>}
                      sortable={false}
                      sort={sortStripe}
                      onResizeStart={startStripeResize}
                      className="px-3 py-2"
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stripeSorted.map((e) => {
                    const busy = reprocessingStripeId === e.id;
                    return (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTimeBR(e.received_at)}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">
                          <div className="font-medium">{e.event_type || '—'}</div>
                          <div className="text-xs text-gray-500">
                            {e.plan_slug ? `${e.plan_slug} · ` : ''}
                            {e.billing_cycle || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{e.process_attempts ?? 0}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 max-w-[360px] truncate" title={e.last_error || ''}>
                          {e.last_error || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleDryRunStripe(e.id)}
                              disabled={!canReprocess || busy}
                            >
                              Dry-run
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleReprocessStripe(e.id)}
                              disabled={!canReprocess || busy}
                              title={canReprocess ? 'Reprocessar agora' : 'Sem permissão'}
                            >
                              <RotateCcw size={14} />
                              Reprocessar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-gray-900">Financeiro — DLQ</div>
            <div className="flex items-center gap-2">
              {isDev && canReprocess ? (
                <Button size="sm" variant="outline" onClick={() => void handleSeedFinanceDlq()}>
                  Seed DLQ
                </Button>
              ) : null}
              <div className="text-xs text-gray-500">{canReprocess ? 'reprocessamento habilitado' : 'sem permissão para reprocessar'}</div>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Carregando…</div>
          ) : financeDlqRows.length === 0 ? (
            <div className="text-sm text-gray-600">Nenhum item na DLQ.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <TableColGroup columns={financeDlqColumns} widths={financeDlqWidths} />
                <thead className="bg-gray-50">
                  <tr>
                    <ResizableSortableTh
                      columnId="when"
                      label="Quando"
                      sort={sortFinanceDlq}
                      onSort={(col) => setSortFinanceDlq((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startFinanceDlqResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="type"
                      label="Tipo"
                      sort={sortFinanceDlq}
                      onSort={(col) => setSortFinanceDlq((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startFinanceDlqResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="error"
                      label="Erro"
                      sort={sortFinanceDlq}
                      onSort={(col) => setSortFinanceDlq((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startFinanceDlqResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="actions"
                      label={<span className="sr-only">Ações</span>}
                      sortable={false}
                      sort={sortFinanceDlq}
                      onResizeStart={startFinanceDlqResize}
                      className="px-3 py-2"
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {financeDlqSorted.map((row) => {
                    const busy = reprocessingFinanceDlqId === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTimeBR(row.dead_lettered_at)}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{row.job_type}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 max-w-[420px] truncate" title={row.last_error || ''}>
                          {row.last_error || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleDryRunFinanceDlq(row.id)}
                              disabled={!canReprocess || busy}
                            >
                              Dry-run
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleReprocessFinanceDlq(row.id)}
                              disabled={!canReprocess || busy}
                              title={canReprocess ? 'Reenfileirar agora' : 'Sem permissão'}
                            >
                              <RotateCcw size={14} />
                              Reprocessar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-gray-900">Marketplaces — DLQ</div>
            <div className="flex items-center gap-2">
              {isDev && canReprocess && canSeeEcommerce ? (
                <Button size="sm" variant="outline" onClick={() => void handleSeedEcommerceDlq()}>
                  Seed DLQ
                </Button>
              ) : null}
              <div className="text-xs text-gray-500">
                {!canSeeEcommerce ? 'sem permissão ecommerce:view' : canReprocess ? 'reprocessamento habilitado' : 'sem permissão para reprocessar'}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Carregando…</div>
          ) : !canSeeEcommerce ? (
            <div className="text-sm text-gray-600">Sem permissão para visualizar integrações (ecommerce:view).</div>
          ) : ecommerceDlqRows.length === 0 ? (
            <div className="text-sm text-gray-600">Nenhum item na DLQ.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <TableColGroup columns={ecommerceDlqColumns} widths={ecommerceDlqWidths} />
                <thead className="bg-gray-50">
                  <tr>
                    <ResizableSortableTh
                      columnId="when"
                      label="Quando"
                      sort={sortEcommerceDlq}
                      onSort={(col) => setSortEcommerceDlq((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startEcommerceDlqResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="provider"
                      label="Provider"
                      sort={sortEcommerceDlq}
                      onSort={(col) => setSortEcommerceDlq((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startEcommerceDlqResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="kind"
                      label="Tipo"
                      sort={sortEcommerceDlq}
                      onSort={(col) => setSortEcommerceDlq((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startEcommerceDlqResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="error"
                      label="Erro"
                      sort={sortEcommerceDlq}
                      onSort={(col) => setSortEcommerceDlq((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startEcommerceDlqResize}
                      className="px-3 py-2"
                    />
                    <ResizableSortableTh
                      columnId="actions"
                      label={<span className="sr-only">Ações</span>}
                      sortable={false}
                      sort={sortEcommerceDlq}
                      onResizeStart={startEcommerceDlqResize}
                      className="px-3 py-2"
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ecommerceDlqSorted.map((row) => {
                    const busy = reprocessingEcommerceDlqId === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTimeBR(row.failed_at)}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{row.provider}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{row.kind}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 max-w-[420px] truncate" title={row.last_error || ''}>
                          {row.last_error || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleDryRunEcommerceDlq(row.id)}
                              disabled={!canReprocess || busy}
                            >
                              Dry-run
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleReprocessEcommerceDlq(row.id)}
                              disabled={!canReprocess || busy}
                              title={canReprocess ? 'Reenfileirar agora' : 'Sem permissão'}
                            >
                              <RotateCcw size={14} />
                              Reprocessar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
