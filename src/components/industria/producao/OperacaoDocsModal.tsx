import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { createOperacaoDocSignedUrl, deleteOperacaoDoc, listOperacaoDocs, uploadOperacaoDoc, OperacaoDoc } from '@/services/industriaOperacaoDocs';
import { Button } from '@/components/ui/button';
import { Loader2, Paperclip, Download, Trash2 } from 'lucide-react';

export default function OperacaoDocsModal({
  operacaoId,
  open,
  onClose,
}: {
  operacaoId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const { activeEmpresaId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<OperacaoDoc[]>([]);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const canSubmit = useMemo(() => !!activeEmpresaId && !!operacaoId && !!titulo.trim() && !!file, [activeEmpresaId, operacaoId, titulo, file]);

  const load = async () => {
    if (!operacaoId) return;
    setLoading(true);
    try {
      const data = await listOperacaoDocs(operacaoId, false);
      setDocs(data);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar documentos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operacaoId]);

  const handleUpload = async () => {
    if (!canSubmit || !file || !activeEmpresaId) return;
    setUploading(true);
    try {
      await uploadOperacaoDoc({
        empresaId: activeEmpresaId,
        operacaoId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        file,
      });
      addToast('Documento enviado. Nova versão registrada.', 'success');
      setTitulo('');
      setDescricao('');
      setFile(null);
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao enviar documento.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenDoc = async (doc: OperacaoDoc) => {
    try {
      const url = await createOperacaoDocSignedUrl(doc.arquivo_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e.message || 'Falha ao abrir documento.', 'error');
    }
  };

  const handleDeleteDoc = async (doc: OperacaoDoc) => {
    if (!confirm(`Excluir "${doc.titulo}" v${doc.versao}?`)) return;
    try {
      await deleteOperacaoDoc({ id: doc.id, arquivoPath: doc.arquivo_path });
      addToast('Documento excluído.', 'success');
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao excluir documento.', 'error');
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Instruções / Documentos da operação" size="xl">
      <div className="p-6 space-y-6">
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Título do documento" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Instrução de Setup, Desenho, IT-001" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo</label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Ao enviar com o mesmo título, a versão é incrementada automaticamente.</p>
            </div>
          </div>
          <TextArea label="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
          <div className="flex justify-end">
            <Button onClick={handleUpload} disabled={!canSubmit || uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Paperclip className="w-4 h-4 mr-2" />}
              Enviar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Versões</h3>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Atualizar
            </Button>
          </div>

          <div className="border rounded-2xl overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">Título</th>
                  <th className="px-4 py-2 text-left">Versão</th>
                  <th className="px-4 py-2 text-left">Criado</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      <Loader2 className="inline-block w-4 h-4 animate-spin mr-2" />
                      Carregando...
                    </td>
                  </tr>
                )}
                {!loading && docs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Nenhum documento anexado.
                    </td>
                  </tr>
                )}
                {!loading && docs.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-gray-900">{d.titulo}</div>
                      {d.descricao && <div className="text-xs text-gray-500">{d.descricao}</div>}
                    </td>
                    <td className="px-4 py-2">v{d.versao}</td>
                    <td className="px-4 py-2 text-gray-600">{new Date(d.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDoc(d)}>
                        <Download className="w-4 h-4 mr-2" />
                        Abrir
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteDoc(d)} className="text-rose-600 hover:text-rose-700">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
