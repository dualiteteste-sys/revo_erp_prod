import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RefreshCw, Save, Trash2 } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import {
  deleteOpsBillingPlanEntitlementsOverride,
  getBillingPlanEntitlements,
  listOpsBillingPlanEntitlementsOverrides,
  upsertOpsBillingPlanEntitlementsOverride,
  type BillingPlanEntitlements,
  type OpsBillingPlanEntitlementsOverride,
  type PlanSlug,
  type PlanoMvp,
} from '@/services/opsEntitlements';

type RowState = {
  plan_slug: PlanSlug;
  effective: BillingPlanEntitlements | null;
  override: OpsBillingPlanEntitlementsOverride | null;
  draft: {
    plano_mvp: PlanoMvp;
    max_users: string;
    max_nfe_monthly: string;
  };
  saving: boolean;
};

const PLAN_SLUGS: PlanSlug[] = ['ESSENCIAL', 'PRO', 'MAX', 'INDUSTRIA', 'SCALE'];

function parseIntStrict(value: string): number | null {
  const s = String(value ?? '').trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function OpsEntitlementsPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RowState[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [overrides, effectiveAll] = await Promise.all([
        listOpsBillingPlanEntitlementsOverrides(),
        Promise.all(PLAN_SLUGS.map(async (slug) => [slug, await getBillingPlanEntitlements(slug)] as const)),
      ]);

      const overrideMap = new Map<PlanSlug, OpsBillingPlanEntitlementsOverride>();
      for (const o of overrides ?? []) overrideMap.set(o.plan_slug, o);

      const nextRows: RowState[] = effectiveAll.map(([slug, effective]) => {
        const ov = overrideMap.get(slug) ?? null;
        const seed = ov ?? effective;
        return {
          plan_slug: slug,
          effective,
          override: ov,
          draft: {
            plano_mvp: (seed?.plano_mvp ?? 'servicos') as PlanoMvp,
            max_users: String(seed?.max_users ?? ''),
            max_nfe_monthly: String(seed?.max_nfe_monthly ?? ''),
          },
          saving: false,
        };
      });

      setRows(nextRows);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar configurações de plano.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateDraft = (plan: PlanSlug, patch: Partial<RowState['draft']>) => {
    setRows((prev) =>
      prev.map((r) => (r.plan_slug === plan ? { ...r, draft: { ...r.draft, ...patch } } : r)),
    );
  };

  const handleSave = async (plan: PlanSlug) => {
    setRows((prev) => prev.map((r) => (r.plan_slug === plan ? { ...r, saving: true } : r)));
    try {
      const row = rows.find((r) => r.plan_slug === plan);
      if (!row) return;

      const maxUsers = parseIntStrict(row.draft.max_users);
      const maxNfeMonthly = parseIntStrict(row.draft.max_nfe_monthly);
      if (maxUsers == null || maxUsers < 1) {
        addToast('Max usuários inválido (mínimo = 1).', 'warning');
        return;
      }
      if (maxNfeMonthly == null || maxNfeMonthly < 0) {
        addToast('Limite NF-e/mês inválido (mínimo = 0).', 'warning');
        return;
      }

      await upsertOpsBillingPlanEntitlementsOverride({
        plan_slug: plan,
        plano_mvp: row.draft.plano_mvp,
        max_users: maxUsers,
        max_nfe_monthly: maxNfeMonthly,
      });
      addToast('Configuração salva.', 'success');
      await load();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar configuração.', 'error');
    } finally {
      setRows((prev) => prev.map((r) => (r.plan_slug === plan ? { ...r, saving: false } : r)));
    }
  };

  const handleClearOverride = async (plan: PlanSlug) => {
    setRows((prev) => prev.map((r) => (r.plan_slug === plan ? { ...r, saving: true } : r)));
    try {
      await deleteOpsBillingPlanEntitlementsOverride(plan);
      addToast('Override removido. Voltou ao padrão.', 'success');
      await load();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao remover override.', 'error');
    } finally {
      setRows((prev) => prev.map((r) => (r.plan_slug === plan ? { ...r, saving: false } : r)));
    }
  };

  return (
    <PageShell
      header={
        <PageHeader
          title="Entitlements por plano (Global)"
          description="Configuração padrão da Ultria aplicada a todos os tenants via billing/entitlements."
          icon={<ShieldCheck className="w-5 h-5" />}
          actions={
            <Button onClick={() => void load()} variant="outline" className="gap-2" disabled={loading}>
              <RefreshCw size={16} />
              Atualizar
            </Button>
          }
        />
      }
      summary={
        <PageCard className="p-4">
          <div className="text-sm text-gray-700">
            Ajuste módulos e limites padrão por plano. Isso não altera permissões de usuário (RBAC); define escopo/ligações de plano (Serviços/Indústria) e limites
            operacionais.
          </div>
        </PageCard>
      }
    >
      <div className="grid grid-cols-1 gap-3">
        {rows.map((r) => {
          const hasOverride = !!r.override;
          const effective = r.effective;
          return (
            <PageCard key={r.plan_slug} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-gray-900">{r.plan_slug}</div>
                    {hasOverride ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">Override</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium">Padrão</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Efetivo: plano_mvp={effective?.plano_mvp ?? '—'} • max_users={effective?.max_users ?? '—'} • max_nfe_monthly=
                    {effective?.max_nfe_monthly ?? '—'}
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  <Button className="gap-2" onClick={() => void handleSave(r.plan_slug)} disabled={r.saving || loading}>
                    <Save size={16} />
                    {r.saving ? 'Salvando…' : 'Salvar'}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => void handleClearOverride(r.plan_slug)}
                    disabled={!hasOverride || r.saving || loading}
                    title={hasOverride ? 'Remover override' : 'Sem override para remover'}
                  >
                    <Trash2 size={16} />
                    Remover override
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select
                  label="Módulos (plano_mvp)"
                  name={`plano_mvp_${r.plan_slug}`}
                  value={r.draft.plano_mvp}
                  onChange={(e) => updateDraft(r.plan_slug, { plano_mvp: (e.target as HTMLSelectElement).value as PlanoMvp })}
                  disabled={r.saving || loading}
                >
                  <option value="servicos">Serviços</option>
                  <option value="industria">Indústria</option>
                  <option value="ambos">Ambos</option>
                </Select>

                <Input
                  label="Máx. usuários"
                  name={`max_users_${r.plan_slug}`}
                  inputMode="numeric"
                  value={r.draft.max_users}
                  onChange={(e) => updateDraft(r.plan_slug, { max_users: (e.target as HTMLInputElement).value })}
                  disabled={r.saving || loading}
                />

                <Input
                  label="Limite NF-e/mês"
                  name={`max_nfe_monthly_${r.plan_slug}`}
                  inputMode="numeric"
                  value={r.draft.max_nfe_monthly}
                  onChange={(e) => updateDraft(r.plan_slug, { max_nfe_monthly: (e.target as HTMLInputElement).value })}
                  disabled={r.saving || loading}
                />
              </div>
            </PageCard>
          );
        })}
      </div>
    </PageShell>
  );
}
