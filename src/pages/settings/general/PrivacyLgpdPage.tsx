import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';

type LgpdExportRow = {
  id: string;
  status: 'pending' | 'done' | 'error';
  file_path: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
};

function formatDateTimePtBr(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PrivacyLgpdPage() {
  const supabase = useSupabase();
  const { session, activeEmpresa } = useAuth();
  const { addToast } = useToast();

  const [exports, setExports] = useState<LgpdExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const canUse = useMemo(() => !!session?.access_token && !!activeEmpresa?.id, [session?.access_token, activeEmpresa?.id]);

  const load = useCallback(async () => {
    if (!activeEmpresa?.id) {
      setExports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lgpd_exports')
        .select('id,status,file_path,created_at,completed_at,error_message')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setExports((data ?? []) as LgpdExportRow[]);
    } catch (e: any) {
      addToast(e?.message ?? 'Erro ao carregar exports LGPD.', 'error');
      setExports([]);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresa?.id, addToast, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExportMyData = async () => {
    if (!canUse) {
      addToast('Selecione uma empresa ativa para exportar seus dados.', 'warning');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('lgpd-export', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { subject_type: 'user' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao gerar export.');
      addToast('Export gerado com sucesso.', 'success');
      await load();
    } catch (e: any) {
      addToast(e?.message ?? 'Falha ao gerar export.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (row: LgpdExportRow) => {
    if (!row.file_path) return;
    try {
      const { data, error } = await supabase.storage.from('lgpd_exports').createSignedUrl(row.file_path, 60);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e?.message ?? 'Não foi possível baixar o arquivo.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Privacidade (LGPD)</h1>
          <p className="mt-1 text-sm text-gray-600">
            Exporte seus dados pessoais (titular) e mantenha uma trilha de auditoria.
          </p>
        </div>
        <Button onClick={handleExportMyData} disabled={!canUse || creating}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          Exportar meus dados
        </Button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="font-semibold text-gray-800">Últimos exports</div>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar'}
          </Button>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : exports.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-gray-500" />
            </div>
            <div className="text-sm">Nenhum export encontrado.</div>
            <div className="text-xs mt-1">Clique em “Exportar meus dados” para gerar o primeiro.</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {exports.map((row) => (
              <div key={row.id} className="px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">Export</span>
                    <span
                      className={[
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        row.status === 'done'
                          ? 'bg-green-100 text-green-700'
                          : row.status === 'pending'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-700',
                      ].join(' ')}
                    >
                      {row.status === 'done' ? 'Pronto' : row.status === 'pending' ? 'Gerando' : 'Erro'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Criado em: {formatDateTimePtBr(row.created_at)}
                    {row.completed_at ? ` • Concluído em: ${formatDateTimePtBr(row.completed_at)}` : null}
                  </div>
                  {row.status === 'error' && row.error_message ? (
                    <div className="mt-1 text-xs text-red-700">
                      {row.error_message}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void handleDownload(row)}
                    disabled={row.status !== 'done' || !row.file_path}
                    title={row.status !== 'done' ? 'Aguarde o export concluir.' : undefined}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Baixar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500">
        Dica: o link de download é temporário. Se expirar, clique em “Baixar” novamente.
      </div>
    </div>
  );
}

