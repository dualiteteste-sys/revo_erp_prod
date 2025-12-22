import React, { useEffect, useMemo, useState } from 'react';
import { listCentrosTrabalho, CentroTrabalho } from '@/services/industriaCentros';
import { deleteOperador, listOperadores, OperadorPayload, OperadorRecord, upsertOperador } from '@/services/industriaOperadores';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2, Plus, Pencil, Trash2, RefreshCw, KeyRound, ShieldCheck, Printer, IdCard } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/button';
import QRCode from 'react-qr-code';
import { useAuth } from '@/contexts/AuthProvider';
import { useSupabase } from '@/providers/SupabaseProvider';

const randomPin = () => Math.floor(1000 + Math.random() * 9000).toString();

export default function OperadoresPage() {
  const { addToast } = useToast();
  const [items, setItems] = useState<OperadorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [centros, setCentros] = useState<CentroTrabalho[]>([]);
  const { activeEmpresa } = useAuth();
  const supabase = useSupabase();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<OperadorPayload>({ nome: '', email: '', pin: randomPin(), centros_trabalho_ids: [], ativo: true });
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [printTarget, setPrintTarget] = useState<OperadorRecord | null>(null);
  const [printPin, setPrintPin] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [savingPrintPin, setSavingPrintPin] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ops, cts] = await Promise.all([
        listOperadores(search),
        listCentrosTrabalho(undefined, true),
      ]);
      setItems(ops);
      setCentros(cts);
    } catch (err: any) {
      addToast(err.message || 'Não foi possível carregar operadores.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!form.nome.trim() || !form.pin) {
      addToast('Nome e PIN são obrigatórios.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload: OperadorPayload = {
        ...form,
        email: form.email || null,
        centros_trabalho_ids: form.centros_trabalho_ids || [],
      };
      await upsertOperador(payload);
      addToast('Operador salvo.', 'success');
      setModalOpen(false);
      setForm({ nome: '', email: '', pin: randomPin(), centros_trabalho_ids: [], ativo: true });
      loadData();
    } catch (err: any) {
      addToast(err.message || 'Falha ao salvar operador.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (op: OperadorRecord) => {
    setForm({
      id: op.id,
      nome: op.nome,
      email: op.email || undefined,
      pin: '', // vazio para não trocar se não preencher (hash não é reversível)
      centros_trabalho_ids: op.centros_trabalho_ids || [],
      ativo: op.ativo,
    });
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await deleteOperador(confirmDeleteId);
      addToast('Operador removido.', 'success');
      setConfirmDeleteId(null);
      loadData();
    } catch (err: any) {
      addToast(err.message || 'Falha ao remover.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const centrosSelecionados = useMemo(() => new Set(form.centros_trabalho_ids || []), [form.centros_trabalho_ids]);

  const toggleCentro = (id: string) => {
    const set = new Set(centrosSelecionados);
    if (set.has(id)) set.delete(id); else set.add(id);
    setForm((prev) => ({ ...prev, centros_trabalho_ids: Array.from(set) }));
  };

  const handleOpenPrint = (op: OperadorRecord) => {
    setPrintTarget(op);
    setPrintPin('');
  };

  const getCentroCode = (id?: string) => {
    if (!id) return null;
    const ct = centros.find((c) => c.id === id);
    return ct?.codigo || ct?.nome || null;
  };

  const firstCentroCode = printTarget?.centros_trabalho_ids?.length
    ? getCentroCode(printTarget.centros_trabalho_ids[0])
    : null;

  const qrPayload = printTarget
    ? JSON.stringify({
        nome: printTarget.nome,
        email: printTarget.email,
        pin: printPin || undefined,
        token: printPin || undefined, // token curto para auto-login
        operador_id: printTarget.id,
        centro: firstCentroCode || undefined,
      })
    : '';

  const handlePrint = () => {
    window.print();
  };

  const handleSavePinAndPrint = async () => {
    if (!printTarget || !printPin) {
      addToast('Defina um PIN para salvar.', 'warning');
      return;
    }
    setSavingPrintPin(true);
    try {
      await upsertOperador({
        id: printTarget.id,
        nome: printTarget.nome,
        email: printTarget.email || undefined,
        pin: printPin,
        centros_trabalho_ids: printTarget.centros_trabalho_ids || [],
        ativo: printTarget.ativo,
      });
      addToast('PIN atualizado. Agora você pode imprimir a credencial.', 'success');
      loadData();
      handlePrint();
    } catch (err: any) {
      addToast(err.message || 'Falha ao atualizar PIN.', 'error');
    } finally {
      setSavingPrintPin(false);
    }
  };

  useEffect(() => {
    if (activeEmpresa?.logotipo_url) {
      setLogoLoading(true);
      supabase.storage.from('company_logos').createSignedUrl(activeEmpresa.logotipo_url, 3600)
        .then(({ data, error }) => {
          if (error) {
            setLogoUrl(null);
          } else {
            setLogoUrl(data?.signedUrl || null);
          }
        })
        .finally(() => setLogoLoading(false));
    } else {
      setLogoUrl(null);
    }
  }, [activeEmpresa?.logotipo_url, supabase]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="text-blue-600" size={20} /> Operadores
          </h1>
          <p className="text-sm text-gray-500">Gerencie PIN/QR e centros permitidos.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <Button onClick={loadData} variant="outline" className="gap-2" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </Button>
          <Button
            onClick={() => {
              setForm({ nome: '', email: '', pin: randomPin(), centros_trabalho_ids: [], ativo: true });
              setModalOpen(true);
            }}
            className="gap-2"
          >
            <Plus size={16} /> Novo operador
          </Button>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2 text-left">Nome</th>
              <th className="px-4 py-2 text-left">E-mail</th>
              <th className="px-4 py-2 text-left">Centros</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center py-6 text-gray-500">
                  <Loader2 className="inline-block h-5 w-5 animate-spin mr-2" />
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-6 text-gray-500">
                  Nenhum operador encontrado.
                </td>
              </tr>
            )}
            {!loading && items.map((op) => (
              <tr key={op.id} className="border-t">
                <td className="px-4 py-2 font-semibold text-gray-900">{op.nome}</td>
                <td className="px-4 py-2 text-gray-700">{op.email || '—'}</td>
                <td className="px-4 py-2 text-gray-700">
                  {op.centros_trabalho_ids?.length
                    ? op.centros_trabalho_ids.length
                    : 'Todos'}
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    op.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {op.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right flex justify-end gap-2">
                  <button
                    onClick={() => handleEdit(op)}
                    className="p-2 rounded-lg border hover:bg-gray-50"
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleOpenPrint(op)}
                    className="p-2 rounded-lg border hover:bg-gray-50"
                    title="Imprimir credencial"
                  >
                    <Printer size={16} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(op.id)}
                    className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Editar operador' : 'Novo operador'} size="xl">
        <div className="space-y-5 p-6">
          <Input
            label="Nome"
            value={form.nome}
            onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
          />
          <Input
            label="E-mail (opcional)"
            value={form.email || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <div className="flex items-end gap-3">
            <Input
              label="PIN (4 dígitos)"
              value={form.pin}
              onChange={(e) => setForm((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
              placeholder="0000"
            />
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, pin: randomPin() }))}
              className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-gray-50"
            >
              Gerar PIN
            </button>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Deixe o PIN vazio para manter o atual (não exibimos o PIN salvo por segurança).
          </p>
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">Centros de trabalho permitidos</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto border rounded-lg p-4 bg-gray-50/60">
              {centros.map((ct) => (
                <label key={ct.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={centrosSelecionados.has(ct.id)}
                    onChange={() => toggleCentro(ct.id)}
                  />
                  {ct.nome}
                </label>
              ))}
              {centros.length === 0 && <p className="text-sm text-gray-500">Nenhum centro cadastrado.</p>}
            </div>
            <p className="text-xs text-gray-500 mt-1">Deixe vazio para permitir todos os centros.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ativo ?? true}
              onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.checked }))}
            />
            Operador ativo
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border font-semibold">
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2 font-semibold shadow-sm"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="Excluir operador" size="sm">
        <div className="space-y-4 p-5">
          <p>Confirma excluir este operador? Essa ação é irreversível.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-lg border font-semibold">Cancelar</button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50 flex items-center gap-2 font-semibold"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!printTarget}
        onClose={() => setPrintTarget(null)}
        title="Imprimir credencial"
        size="lg"
      >
        {printTarget && (
          <div className="space-y-5 p-6">
            <style>{`@media print { body * { visibility: hidden; } #credencial-print, #credencial-print * { visibility: visible; } #credencial-print { position: absolute; inset: 0; margin: auto; } }`}</style>
            <div className="flex flex-col gap-2 print:hidden">
              <p className="text-sm text-gray-600">Ajuste o PIN que irá para o QR (opcional). Deixe vazio para gerar um QR apenas de identificação.</p>
              <div className="flex items-end gap-3">
                <Input
                  label="PIN no QR"
                  value={printPin}
                  onChange={(e) => setPrintPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="0000"
                />
                <button
                  type="button"
                  onClick={() => setPrintPin(randomPin())}
                  className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-gray-50"
                >
                  Gerar
                </button>
              </div>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 font-semibold w-fit"
              >
                <IdCard size={16} /> Imprimir credencial
              </button>
              <button
                onClick={handleSavePinAndPrint}
                disabled={savingPrintPin}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 font-semibold w-fit disabled:opacity-60"
              >
                {savingPrintPin && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar PIN e imprimir
              </button>
            </div>

            <div
              id="credencial-print"
              className="mx-auto w-[360px] text-gray-900"
            >
              <div className="grid grid-cols-1 gap-4 print:gap-2">
                {/* Frente */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-900 text-white px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.08em] text-gray-300">Operador</p>
                      <p className="text-lg font-semibold">{printTarget.nome}</p>
                    </div>
                    <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center overflow-hidden">
                      {logoLoading ? (
                        <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
                      ) : logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <ShieldCheck className="text-gray-700" />
                      )}
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-gray-500">E-mail</p>
                      <p className="font-semibold">{printTarget.email || '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-gray-500">Centro principal</p>
                      <p className="font-semibold">{firstCentroCode || 'Todos'}</p>
                    </div>

                    <div className="mt-4">
                      <div className="bg-gray-100 rounded-2xl p-4 flex flex-col items-center gap-2">
                        <QRCode value={qrPayload || ' '} size={140} />
                        <p className="text-xs text-gray-600 text-center">
                          Aponte a câmera para logar. QR inclui nome, opcional PIN e centro.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 px-5 py-3 text-xs text-gray-600 flex items-center justify-between">
                    <span>{activeEmpresa?.fantasia || activeEmpresa?.razao_social || 'Empresa'}</span>
                    <span>{new Date().getFullYear()}</span>
                  </div>
                </div>

                {/* Verso */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
                  <div className="h-full flex flex-col items-center justify-center bg-gray-900 text-white p-6">
                    <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center overflow-hidden shadow-lg mb-3">
                      {logoLoading ? (
                        <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
                      ) : logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <ShieldCheck className="text-gray-700" />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-center">
                      {activeEmpresa?.fantasia || activeEmpresa?.razao_social || 'Empresa'}
                    </p>
                    <p className="text-[11px] text-gray-300 mt-1">Credencial de acesso ao chão de fábrica</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
