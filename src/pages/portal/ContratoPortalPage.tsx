import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { acceptContratoPortal, getContratoPortal, type ServicosContratoPortalPayload } from '@/services/servicosContratosPortal';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';

export default function ContratoPortalPage() {
  const { token } = useParams();
  const [data, setData] = useState<ServicosContratoPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [acceptedOk, setAcceptedOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setAcceptedOk(false);
      try {
        if (!token) throw new Error('Link inválido.');
        const payload = await getContratoPortal(token);
        if (!cancelled) {
          setData(payload);
          setNome(payload.documento.accepted_nome || payload.cliente?.nome || '');
          setEmail(payload.documento.accepted_email || payload.cliente?.email || '');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Não foi possível carregar o contrato.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const acceptedAtLabel = useMemo(() => {
    const acceptedAt = data?.documento?.accepted_at;
    if (!acceptedAt) return null;
    return new Date(acceptedAt).toLocaleString('pt-BR');
  }, [data?.documento?.accepted_at]);

  const handleAccept = async () => {
    setAcceptedOk(false);
    if (!token) return;
    const n = nome.trim();
    const e = email.trim();
    if (!n || !e) return;
    setAccepting(true);
    try {
      const res = await acceptContratoPortal({ token, nome: n, email: e });
      setAcceptedOk(true);
      setData((s) =>
        s
          ? {
              ...s,
              documento: { ...s.documento, accepted_at: res.acceptedAt, accepted_nome: n, accepted_email: e },
            }
          : s,
      );
    } catch (err: any) {
      setError(err?.message || 'Não foi possível registrar o aceite.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(37,99,235,0.12),transparent_35%),radial-gradient(900px_circle_at_90%_10%,rgba(99,102,241,0.10),transparent_40%)]">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur shadow-[0_20px_60px_rgba(15,23,42,0.12)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-gray-500">Documento</div>
              <div className="text-2xl font-semibold text-gray-900">Contrato de Serviços</div>
            </div>
            {data?.documento?.accepted_at ? (
              <div className="rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-semibold">Aceito em {acceptedAtLabel}</div>
            ) : null}
          </div>

          {loading ? (
            <div className="py-12 flex items-center justify-center text-sm text-gray-500">
              <Loader2 className="animate-spin mr-2" size={18} />
              Carregando…
            </div>
          ) : error ? (
            <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900">{error}</div>
          ) : data ? (
            <>
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold text-gray-500 uppercase">Título</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">{data.documento.titulo}</div>
                <div className="mt-2 text-sm text-gray-700">
                  <span className="font-medium">Contrato:</span> {data.contrato.numero ? `#${data.contrato.numero} • ` : ''}
                  {data.contrato.descricao}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">Conteúdo</div>
                <div className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">{data.documento.corpo}</div>
              </div>

              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">Aceite</div>
                <div className="text-xs text-gray-500 mt-1">Confirme seus dados e registre o aceite.</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
                  <Input
                    label="Nome"
                    name="contrato_nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="md:col-span-3"
                    disabled={accepting || Boolean(data.documento.accepted_at)}
                  />
                  <Input
                    label="E-mail"
                    name="contrato_email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="md:col-span-3"
                    disabled={accepting || Boolean(data.documento.accepted_at)}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  {acceptedOk ? <div className="text-sm text-green-700">Aceite registrado com sucesso.</div> : <div />}
                  <Button
                    type="button"
                    onClick={handleAccept}
                    disabled={accepting || !nome.trim() || !email.trim() || Boolean(data.documento.accepted_at)}
                    className="gap-2"
                  >
                    {accepting ? <Loader2 className="animate-spin" size={18} /> : null}
                    {data.documento.accepted_at ? (
                      <>
                        <CheckCircle2 size={18} /> Já aceito
                      </>
                    ) : (
                      'Aceitar contrato'
                    )}
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

