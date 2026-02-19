import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { getWooRun, retryWooRunFailed, runWooWorkerNow } from '@/services/woocommerceCatalog';
import { computeCatalogRunCounts, shouldAllowRetryFailed } from '@/lib/integrations/woocommerce/catalogRuns';

export default function WooCatalogRunPage() {
  const { activeEmpresaId } = useAuth();
  const { runId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const storeId = String(searchParams.get('store') ?? '').trim();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ run: any; items: any[] } | null>(null);

  const load = async () => {
    if (!activeEmpresaId || !runId || !storeId) return;
    setLoading(true);
    try {
      const response = await getWooRun({ empresaId: activeEmpresaId, storeId, runId });
      setData({ run: response.run, items: response.items ?? [] });
    } catch (error: any) {
      addToast(error?.message || 'Falha ao carregar execução Woo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!data?.run) return;
      if (String(data.run.status) === 'done' || String(data.run.status) === 'error' || String(data.run.status) === 'partial') return;
      void load();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [activeEmpresaId, runId, storeId]);

  const counts = useMemo(() => {
    return computeCatalogRunCounts(data?.items ?? []);
  }, [data?.items]);

  const retryFailed = async () => {
    if (!activeEmpresaId || !runId || !storeId) return;
    setLoading(true);
    try {
      const response = await retryWooRunFailed({
        empresaId: activeEmpresaId,
        storeId,
        runId,
      });
      addToast(`Nova execução criada com ${response.retried_items} item(ns).`, 'success');
      navigate(`/app/products/woocommerce/runs/${response.run_id}?store=${storeId}`);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao reexecutar itens com erro.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runWorkerNow = async () => {
    if (!activeEmpresaId || !storeId) return;
    setLoading(true);
    try {
      await runWooWorkerNow({ empresaId: activeEmpresaId, storeId, limit: 25 });
      addToast('Worker executado.', 'success');
      await load();
    } catch (error: any) {
      addToast(error?.message || 'Falha ao executar worker agora.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      header={(
        <PageHeader
          title="Execução WooCommerce"
          description="Acompanhe progresso, falhas e reexecução por item."
          actions={(
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => navigate(-1)}>Voltar</Button>
              <Button variant="secondary" className="gap-2" onClick={() => void load()} disabled={loading}>
                {loading ? 'Atualizando...' : 'Atualizar'}
              </Button>
              <Button variant="secondary" className="gap-2" onClick={runWorkerNow} disabled={loading}>
                Processar agora
              </Button>
              <Button className="gap-2" onClick={retryFailed} disabled={loading || !shouldAllowRetryFailed(data?.items ?? [])}>
                Reexecutar falhas
              </Button>
            </div>
          )}
        />
      )}
    >
      <PageCard className="space-y-4 p-4">
        {!activeEmpresaId || !storeId || !runId ? (
          <div className="text-sm text-slate-600">Informe loja e execução para visualizar este relatório.</div>
        ) : loading && !data ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-sm text-slate-600">Carregando execução...</span>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <Metric label="Planejados" value={counts.planned} />
              <Metric label="Concluídos" value={counts.done} />
              <Metric label="Ignorados" value={counts.skipped} />
              <Metric label="Falhas" value={counts.failed} tone="danger" />
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              Status do run: <span className="font-semibold">{String(data?.run?.status ?? '-')}</span>
            </div>
            <div className="max-h-[62vh] overflow-auto rounded-md border border-slate-200">
              {(data?.items ?? []).map((item) => (
                <div key={item.id} className="border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{item.sku || 'SEM SKU'}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{item.action}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{item.status}</span>
                  </div>
                  {item.error_code ? <div className="text-xs text-red-600">Código: {item.error_code}</div> : null}
                  {item.hint ? <div className="text-xs text-slate-600">{item.hint}</div> : null}
                </div>
              ))}
              {(data?.items ?? []).length === 0 ? (
                <div className="px-3 py-4 text-sm text-slate-500">Sem itens para esta execução.</div>
              ) : null}
            </div>
          </>
        )}
      </PageCard>
    </PageShell>
  );
}

function Metric(props: { label: string; value: number; tone?: 'default' | 'danger' }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${props.tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-700'}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{props.label}</div>
      <div className="text-lg font-semibold">{props.value}</div>
    </div>
  );
}
