import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import type { WooCatalogPreviewResponse } from '@/services/woocommerceCatalog';
import {
  previewWooExport,
  previewWooImport,
  previewWooSyncPrice,
  previewWooSyncStock,
  runWooExport,
  runWooImport,
  runWooSyncPrice,
  runWooSyncStock,
  runWooWorkerNow,
  searchWooCatalogProducts,
} from '@/services/woocommerceCatalog';

export type WooBulkWizardMode = 'export' | 'sync_price' | 'sync_stock' | 'import';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  empresaId: string;
  storeId: string;
  selectedRevoProductIds: string[];
  initialMode?: WooBulkWizardMode;
  onRunCreated: (runId: string) => void;
};

type WooSearchRow = {
  id: number;
  name: string | null;
  sku: string | null;
  type: string;
  status: string | null;
  price: string | null;
  stock_status: string | null;
  updated_at: string | null;
};

export default function WooBulkCatalogWizard(props: Props) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<WooBulkWizardMode>('export');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<WooCatalogPreviewResponse | null>(null);
  const [imageMode, setImageMode] = useState<'none' | 'always' | 'new_only'>('none');
  const [wooQuery, setWooQuery] = useState('');
  const [wooRows, setWooRows] = useState<WooSearchRow[]>([]);
  const [selectedWooIds, setSelectedWooIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!props.isOpen || !props.initialMode) return;
    setMode(props.initialMode);
  }, [props.isOpen, props.initialMode]);

  const needsWooSelection = mode === 'import';
  const selectedCount = needsWooSelection ? selectedWooIds.size : props.selectedRevoProductIds.length;
  const hasBlockers = useMemo(
    () => (preview?.items ?? []).some((item) => item.action === 'BLOCK'),
    [preview],
  );

  const resetState = () => {
    setStep(1);
    setPreview(null);
    setLoading(false);
    setWooQuery('');
    setWooRows([]);
    setSelectedWooIds(new Set());
    setImageMode('none');
  };

  const handleClose = () => {
    resetState();
    props.onClose();
  };

  const loadWooRows = async () => {
    setLoading(true);
    try {
      const response = await searchWooCatalogProducts({
        empresaId: props.empresaId,
        storeId: props.storeId,
        query: wooQuery,
      });
      setWooRows(response.rows ?? []);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao carregar catálogo Woo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runPreview = async () => {
    if (!needsWooSelection && props.selectedRevoProductIds.length === 0) {
      addToast('Selecione produtos no grid antes de continuar.', 'warning');
      return;
    }
    if (needsWooSelection && selectedWooIds.size === 0) {
      addToast('Selecione produtos do Woo para importar.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const result = mode === 'export'
        ? await previewWooExport({
          empresaId: props.empresaId,
          storeId: props.storeId,
          revoProductIds: props.selectedRevoProductIds,
          options: { image_mode: imageMode },
        })
        : mode === 'sync_price'
        ? await previewWooSyncPrice({
          empresaId: props.empresaId,
          storeId: props.storeId,
          revoProductIds: props.selectedRevoProductIds,
        })
        : mode === 'sync_stock'
        ? await previewWooSyncStock({
          empresaId: props.empresaId,
          storeId: props.storeId,
          revoProductIds: props.selectedRevoProductIds,
        })
        : await previewWooImport({
          empresaId: props.empresaId,
          storeId: props.storeId,
          wooProductIds: Array.from(selectedWooIds.values()),
        });
      setPreview(result);
      setStep(2);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao gerar preview.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const executeRun = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const response = mode === 'export'
        ? await runWooExport({
          empresaId: props.empresaId,
          storeId: props.storeId,
          revoProductIds: props.selectedRevoProductIds,
          options: { image_mode: imageMode },
        })
        : mode === 'sync_price'
        ? await runWooSyncPrice({
          empresaId: props.empresaId,
          storeId: props.storeId,
          revoProductIds: props.selectedRevoProductIds,
        })
        : mode === 'sync_stock'
        ? await runWooSyncStock({
          empresaId: props.empresaId,
          storeId: props.storeId,
          revoProductIds: props.selectedRevoProductIds,
        })
        : await runWooImport({
          empresaId: props.empresaId,
          storeId: props.storeId,
          wooProductIds: Array.from(selectedWooIds.values()),
        });

      addToast('Execução criada e enfileirada com sucesso.', 'success');
      props.onRunCreated(response.run_id);
      setStep(3);

      // UX Tiny-like: tenta processar automaticamente para o usuário não ficar preso em "queued".
      try {
        const worker = await runWooWorkerNow({ empresaId: props.empresaId, storeId: props.storeId });
        const processed = Number((worker as any)?.processed_jobs ?? 0);
        const hint = String((worker as any)?.hint ?? '').trim();
        if (processed > 0) addToast('Processamento iniciado.', 'success');
        else if (hint) addToast(hint, 'warning');
      } catch (error: any) {
        addToast(error?.message || 'Falha ao iniciar processamento automático. Você pode processar manualmente no run.', 'warning');
      }
    } catch (error: any) {
      addToast(error?.message || 'Falha ao iniciar execução.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={props.isOpen} onClose={handleClose} title="WooCommerce • Ação em massa" size="4xl">
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Passo {step} de 3 • Selecionados: <span className="font-semibold">{selectedCount}</span>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant={mode === 'export' ? 'default' : 'secondary'} onClick={() => setMode('export')}>
                Exportar para Woo
              </Button>
              <Button variant={mode === 'import' ? 'default' : 'secondary'} onClick={() => setMode('import')}>
                Importar do Woo
              </Button>
              <Button variant={mode === 'sync_price' ? 'default' : 'secondary'} onClick={() => setMode('sync_price')}>
                Sincronizar preços
              </Button>
              <Button variant={mode === 'sync_stock' ? 'default' : 'secondary'} onClick={() => setMode('sync_stock')}>
                Sincronizar estoque
              </Button>
            </div>

            {mode === 'export' ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <label className="mb-2 block text-sm font-medium text-slate-700">Imagens</label>
                <select
                  value={imageMode}
                  onChange={(event) => setImageMode(event.target.value as typeof imageMode)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="none">Não enviar imagens</option>
                  <option value="always">Enviar sempre</option>
                  <option value="new_only">Enviar apenas novas</option>
                </select>
              </div>
            ) : null}

            {needsWooSelection ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <input
                    value={wooQuery}
                    onChange={(event) => setWooQuery(event.target.value)}
                    placeholder="Buscar produto Woo por nome/SKU"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <Button variant="secondary" onClick={loadWooRows} disabled={loading} className="gap-2">
                    {loading ? 'Carregando...' : 'Buscar'}
                  </Button>
                </div>
                <div className="max-h-52 overflow-auto rounded-md border border-slate-200">
                  {(wooRows ?? []).map((row) => (
                    <label key={row.id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                      <input
                        type="checkbox"
                        checked={selectedWooIds.has(row.id)}
                        onChange={() => {
                          setSelectedWooIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          });
                        }}
                      />
                      <span className="font-medium text-slate-800">{row.name || 'Sem nome'}</span>
                      <span className="text-xs text-slate-500">SKU: {row.sku || '-'}</span>
                    </label>
                  ))}
                  {wooRows.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-slate-500">Busque produtos do Woo para seleção.</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 && preview ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Criar" value={preview.summary.create} />
              <Stat label="Atualizar" value={preview.summary.update} />
              <Stat label="Pular" value={preview.summary.skip} />
              <Stat label="Bloqueados" value={preview.summary.block} tone="danger" />
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200">
              {(preview.items ?? []).map((item, index) => (
                <div key={`${item.sku ?? 'sem-sku'}-${index}`} className="border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{item.sku || 'SEM SKU'}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{item.action}</span>
                  </div>
                  {item.blockers?.length ? (
                    <div className="mt-1 text-xs text-red-600">{item.blockers.join(' ')}</div>
                  ) : null}
                  {item.warnings?.length ? (
                    <div className="mt-1 text-xs text-amber-600">{item.warnings.join(' ')}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
            <h3 className="text-lg font-semibold text-emerald-800">Execução enfileirada</h3>
            <p className="text-sm text-emerald-700">Acompanhe o progresso na tela de execução.</p>
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
          <Button variant="ghost" onClick={handleClose}>Fechar</Button>
          <div className="flex items-center gap-2">
            {step > 1 && step < 3 ? (
              <Button variant="secondary" onClick={() => setStep((prev) => (prev === 2 ? 1 : prev))} disabled={loading}>
                Voltar
              </Button>
            ) : null}
            {step === 1 ? (
              <Button onClick={runPreview} disabled={loading || selectedCount === 0} className="gap-2">
                {loading ? 'Carregando...' : 'Validar e preview'}
              </Button>
            ) : null}
            {step === 2 ? (
              <Button onClick={executeRun} disabled={loading || hasBlockers} className="gap-2">
                {loading ? 'Executando...' : hasBlockers ? 'Bloqueado' : 'Executar'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Stat(props: { label: string; value: number; tone?: 'default' | 'danger' }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${props.tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-700'}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{props.label}</div>
      <div className="text-lg font-semibold">{props.value}</div>
    </div>
  );
}
