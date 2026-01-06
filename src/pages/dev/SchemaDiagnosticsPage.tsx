import React, { useEffect, useState } from 'react';
import { Copy, Download, RefreshCw, Wrench } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { getDevSchemaDiagnostics, reloadPostgrestSchemaCache, type DevSchemaDiagnostics } from '@/services/devSchema';

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SchemaDiagnosticsPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [data, setData] = useState<DevSchemaDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDevSchemaDiagnostics(80);
      setData(res);
    } catch (e: any) {
      setData(null);
      setError(e?.message || 'Falha ao carregar diagnóstico.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      addToast('Diagnóstico copiado.', 'success');
    } catch {
      addToast('Não foi possível copiar.', 'error');
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await reloadPostgrestSchemaCache();
      addToast('Solicitado reload do schema cache (PostgREST).', 'success');
      await load();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao solicitar reload do schema cache.', 'error');
    } finally {
      setReloading(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Diagnóstico de Schema / RPC"
        description="Ferramentas internas para investigar drift, cache do PostgREST e migrations aplicadas."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} className="gap-2" disabled={loading}>
              <RefreshCw size={16} />
              Atualizar
            </Button>
            <Button variant="secondary" onClick={handleReload} className="gap-2" disabled={reloading}>
              <Wrench size={16} />
              {reloading ? 'Recarregando…' : 'Recarregar cache RPC'}
            </Button>
            <Button variant="outline" onClick={handleCopy} className="gap-2" disabled={!data}>
              <Copy size={16} />
              Copiar JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => data && downloadJson(`schema-diagnostics-${new Date().toISOString().slice(0, 19)}.json`, data)}
              className="gap-2"
              disabled={!data}
            >
              <Download size={16} />
              Baixar
            </Button>
          </div>
        }
      />

      <PageCard className="space-y-4">
        {loading ? (
          <div className="text-sm text-gray-600">Carregando…</div>
        ) : error ? (
          <div className="text-sm text-red-700">{error}</div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs text-gray-500">Banco</div>
                <div className="text-sm font-semibold text-gray-900 mt-1">{data.db}</div>
                <div className="text-xs text-gray-500 mt-2">Coletado em</div>
                <div className="text-sm font-mono text-gray-900 break-all">{new Date(data.now).toLocaleString('pt-BR')}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs text-gray-500">Objetos (public)</div>
                <div className="mt-1 text-sm text-gray-900">
                  <span className="font-semibold">{data.functions_public}</span> funções •{' '}
                  <span className="font-semibold">{data.views_public}</span> views
                </div>
                <div className="text-xs text-gray-500 mt-2">Overloads detectados</div>
                <div className="text-sm font-semibold text-gray-900 mt-1">{data.overloaded_public?.length ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs text-gray-500">Migrations</div>
                <div className="mt-1 text-sm text-gray-900">
                  <span className="font-semibold">{data.migrations?.length ?? 0}</span> últimas versões registradas
                </div>
                <div className="text-xs text-gray-500 mt-2">Dica</div>
                <div className="text-sm text-gray-700 mt-1">
                  404 em `/rpc/*` normalmente é cache/drift. Tente “Recarregar cache RPC”.
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900">Migrations aplicadas (últimas)</div>
              <div className="max-h-[320px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="text-left p-3">version</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(data.migrations ?? []).map((m) => (
                      <tr key={m.version} className="hover:bg-gray-50">
                        <td className="p-3 font-mono text-gray-900">{m.version}</td>
                      </tr>
                    ))}
                    {(data.migrations ?? []).length === 0 && (
                      <tr>
                        <td className="p-6 text-center text-gray-500">Sem dados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900">Overloads (public)</div>
              <div className="max-h-[260px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="text-left p-3">função</th>
                      <th className="text-left p-3">quantidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(data.overloaded_public ?? []).map((o) => (
                      <tr key={o.proname} className="hover:bg-gray-50">
                        <td className="p-3 font-mono text-gray-900">{o.proname}</td>
                        <td className="p-3 text-gray-700">{o.overloads}</td>
                      </tr>
                    ))}
                    {(data.overloaded_public ?? []).length === 0 && (
                      <tr>
                        <td colSpan={2} className="p-6 text-center text-gray-500">
                          Nenhum overload detectado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </PageCard>
    </PageShell>
  );
}

