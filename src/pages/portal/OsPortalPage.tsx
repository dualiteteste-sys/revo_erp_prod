import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getOsPortal, sendOsPortalMessage, type OsPortalPayload } from '@/services/osPortal';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    orcamento: 'Orçamento',
    aberta: 'Aberta',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
  };
  return map[s] ?? s;
};

export default function OsPortalPage() {
  const { token } = useParams();
  const [data, setData] = useState<OsPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setSentOk(false);
      try {
        if (!token) throw new Error('Link inválido.');
        const payload = await getOsPortal(token);
        if (!cancelled) setData(payload);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Não foi possível carregar o acompanhamento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const progress = data?.checklist?.progress;
  const pct = progress?.pct ?? 0;
  const pctLabel = useMemo(() => `${progress?.done ?? 0}/${progress?.total ?? 0} • ${pct}%`, [pct, progress?.done, progress?.total]);

  const handleSend = async () => {
    setSentOk(false);
    if (!token) return;
    const n = nome.trim();
    const m = mensagem.trim();
    if (!n || !m) return;
    setSending(true);
    try {
      await sendOsPortalMessage({ token, nome: n, mensagem: m });
      setSentOk(true);
      setMensagem('');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(37,99,235,0.12),transparent_35%),radial-gradient(900px_circle_at_90%_10%,rgba(99,102,241,0.10),transparent_40%)]">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur shadow-[0_20px_60px_rgba(15,23,42,0.12)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-gray-500">Acompanhamento</div>
              <div className="text-2xl font-semibold text-gray-900">Ordem de Serviço</div>
            </div>
            {progress ? (
              <div className="rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-xs font-semibold">{pctLabel}</div>
            ) : null}
          </div>

          {loading ? (
            <div className="py-12 flex items-center justify-center text-sm text-gray-500">
              <Loader2 className="animate-spin mr-2" size={18} />
              Carregando…
            </div>
          ) : error ? (
            <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900">
              {error}
            </div>
          ) : data ? (
            <>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase">OS</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">#{data.os.numero}</div>
                  <div className="mt-2 text-sm text-gray-700">
                    <span className="font-medium">Status:</span> {statusLabel(data.os.status)}
                  </div>
                  {data.os.data_prevista ? (
                    <div className="mt-1 text-sm text-gray-700">
                      <span className="font-medium">Prevista:</span> {new Date(`${data.os.data_prevista}T00:00:00`).toLocaleDateString('pt-BR')}
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-4 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase">Descrição</div>
                  <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{data.os.descricao || '—'}</div>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">Checklist</div>
                <div className="mt-3 space-y-2">
                  {data.checklist.items.length === 0 ? (
                    <div className="text-sm text-gray-500">Nenhum checklist configurado para esta OS.</div>
                  ) : (
                    data.checklist.items.map((it) => (
                      <div key={it.step_id} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${it.done ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900">{it.titulo}</div>
                          {it.descricao ? <div className="text-xs text-gray-600 mt-1">{it.descricao}</div> : null}
                          {it.done_at ? <div className="text-xs text-gray-500 mt-1">Concluído em {new Date(it.done_at).toLocaleString('pt-BR')}</div> : null}
                        </div>
                        {it.done ? <CheckCircle2 className="text-green-600 mt-0.5" size={18} /> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">Fale conosco</div>
                <div className="text-xs text-gray-500 mt-1">Envie uma mensagem que ficará registrada no atendimento.</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
                  <Input
                    label="Seu nome"
                    name="portal_nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="md:col-span-2"
                    disabled={sending}
                  />
                  <div className="md:col-span-4">
                    <TextArea
                      label="Mensagem"
                      name="portal_msg"
                      value={mensagem}
                      onChange={(e) => setMensagem(e.target.value)}
                      rows={4}
                      disabled={sending}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  {sentOk ? <div className="text-sm text-green-700">Mensagem enviada. Obrigado!</div> : <div />}
                  <Button type="button" onClick={handleSend} disabled={sending || !nome.trim() || !mensagem.trim()} className="gap-2">
                    {sending ? <Loader2 className="animate-spin" size={18} /> : null}
                    Enviar mensagem
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

