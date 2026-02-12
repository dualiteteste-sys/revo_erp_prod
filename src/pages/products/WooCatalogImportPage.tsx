import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { previewWooImport, runWooImport, searchWooCatalogProducts } from '@/services/woocommerceCatalog';

export default function WooCatalogImportPage() {
  const { activeEmpresaId } = useAuth();
  const [searchParams] = useSearchParams();
  const storeId = String(searchParams.get('store') ?? '').trim();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Array<any>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const selectedWooIds = useMemo(() => Array.from(selectedIds.values()), [selectedIds]);

  const onSearch = async () => {
    if (!activeEmpresaId || !storeId) return;
    setLoading(true);
    try {
      const response = await searchWooCatalogProducts({
        empresaId: activeEmpresaId,
        storeId,
        query,
      });
      setRows(response.rows ?? []);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao consultar catálogo Woo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onPreview = async () => {
    if (!activeEmpresaId || !storeId || selectedWooIds.length === 0) return;
    setLoading(true);
    try {
      const response = await previewWooImport({
        empresaId: activeEmpresaId,
        storeId,
        wooProductIds: selectedWooIds,
      });
      setPreview(response);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao gerar preview de importação.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onRun = async () => {
    if (!activeEmpresaId || !storeId || selectedWooIds.length === 0) return;
    setLoading(true);
    try {
      const response = await runWooImport({
        empresaId: activeEmpresaId,
        storeId,
        wooProductIds: selectedWooIds,
      });
      addToast('Importação iniciada com sucesso.', 'success');
      navigate(`/app/products/woocommerce/runs/${response.run_id}?store=${storeId}`);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao iniciar importação.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      header={(
        <PageHeader
          title="Catálogo Woo • Importar para Revo"
          description="Busque produtos Woo, selecione e execute com preview."
          actions={<Button variant="secondary" onClick={() => navigate(-1)}>Voltar</Button>}
        />
      )}
    >
      <PageCard className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou SKU no WooCommerce"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <Button variant="secondary" onClick={onSearch} className="gap-2" disabled={loading || !storeId || !activeEmpresaId}>
            {loading ? 'Buscando...' : 'Buscar'}
          </Button>
        </div>

        <div className="max-h-[48vh] overflow-auto rounded-md border border-slate-200">
          {(rows ?? []).map((row) => (
            <label key={row.id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
              <input
                type="checkbox"
                checked={selectedIds.has(row.id)}
                onChange={() => {
                  setSelectedIds((prev) => {
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
          {rows.length === 0 ? <div className="px-3 py-4 text-sm text-slate-500">Nenhum produto carregado.</div> : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <div className="text-sm text-slate-600">{selectedWooIds.length} selecionado(s)</div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onPreview} disabled={loading || selectedWooIds.length === 0}>Preview</Button>
            <Button onClick={onRun} disabled={loading || selectedWooIds.length === 0}>Executar importação</Button>
          </div>
        </div>

        {preview ? (
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-2 font-semibold text-slate-800">Preview</div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Mini label="Criar" value={preview.summary?.create ?? 0} />
              <Mini label="Atualizar" value={preview.summary?.update ?? 0} />
              <Mini label="Pular" value={preview.summary?.skip ?? 0} />
              <Mini label="Bloquear" value={preview.summary?.block ?? 0} danger />
            </div>
          </div>
        ) : null}
      </PageCard>
    </PageShell>
  );
}

function Mini(props: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`rounded border px-2 py-1 ${props.danger ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-700'}`}>
      <div className="text-[11px] uppercase tracking-wide">{props.label}</div>
      <div className="text-base font-semibold">{props.value}</div>
    </div>
  );
}
