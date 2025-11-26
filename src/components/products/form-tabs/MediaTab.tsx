import React, { useCallback, useEffect, useState } from "react";
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, Loader2, Star, Trash2 } from 'lucide-react';
import { uploadProductImage, removeProductImage, setPrincipalProductImage } from "@/lib/storage";
import { useSupabase } from "@/providers/SupabaseProvider";
import { useToast } from "@/contexts/ToastProvider";
import ConfirmationModal from "@/components/ui/ConfirmationModal";

type Imagem = {
  id: string;
  empresa_id: string;
  produto_id: string;
  url: string;
  principal: boolean;
  ordem: number;
  created_at: string;
};

type Props = {
  produtoId: string;
  empresaId: string;
};

function assertUuid(id: string, label: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error(`[FORM][MEDIA] ${label} inválido`);
  }
}

export default function MediaTab({ produtoId, empresaId }: Props) {
  const supabase = useSupabase();
  const { addToast } = useToast();
  const [imagens, setImagens] = useState<Imagem[]>([]);
  const [signedImageUrls, setSignedImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<Imagem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  assertUuid(produtoId, "produtoId");
  assertUuid(empresaId, "empresaId");

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("produto_imagens")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("produto_id", produtoId)
        .order("principal", { ascending: false })
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setImagens((data as Imagem[]) ?? []);
    } catch (err: any) {
      console.error("[FORM][MEDIA][LOAD][ERR]", err);
      addToast("Erro ao carregar imagens.", "error");
    } finally {
      setLoading(false);
    }
  }, [empresaId, produtoId, addToast, supabase]);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  useEffect(() => {
    const fetchSignedUrls = async () => {
      const urls: Record<string, string> = {};
      const urlPromises = imagens.map(async (img) => {
        const { data, error } = await supabase.storage
          .from('product_images')
          .createSignedUrl(img.url, 3600); // 1 hour expiry
        if (!error) {
          urls[img.id] = data.signedUrl;
        }
      });
      await Promise.all(urlPromises);
      setSignedImageUrls(urls);
    };

    if (imagens.length > 0) {
      fetchSignedUrls();
    }
  }, [imagens, supabase]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    
    setUploading(true);
    addToast(`Enviando ${acceptedFiles.length} imagem(ns)...`, 'info');

    try {
      const baseOrder = (imagens?.reduce((acc, i) => Math.max(acc, i.ordem), 0) ?? 0) + 1;

      const uploadPromises = acceptedFiles.map(async (file, idx) => {
        try {
          const { key } = await uploadProductImage(empresaId, produtoId, file);

          const payload = {
            empresa_id: empresaId,
            produto_id: produtoId,
            url: key,
            ordem: baseOrder + idx,
            principal: imagens.length === 0 && idx === 0,
          };

          const { error: insErr } = await supabase.from("produto_imagens").insert(payload);
          if (insErr) throw insErr;

        } catch (uploadError: any) {
          console.error(`[MEDIA][UPLOAD][ERR] Falha no arquivo ${file.name}:`, uploadError);
          addToast(uploadError.message, 'error');
        }
      });

      await Promise.all(uploadPromises);

    } catch (err: any) {
      console.error("[MEDIA][UPLOAD][FATAL]", err);
      addToast(err?.message ?? "Falha geral ao enviar imagens.", "error");
    } finally {
      await loadImages();
      setUploading(false);
      addToast("Uploads finalizados.", "success");
    }
  }, [empresaId, produtoId, imagens, loadImages, addToast, supabase]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.webp', '.gif'] },
    disabled: uploading,
  });

  const openDeleteConfirmation = (img: Imagem) => {
    setImageToDelete(img);
    setIsDeleteModalOpen(true);
  };

  async function confirmDelete() {
    if (!imageToDelete) return;

    setIsDeleting(true);
    try {
      await removeProductImage(imageToDelete.id, imageToDelete.url);
      addToast("Imagem removida com sucesso.", "success");
      setImagens(prev => prev.filter(i => i.id !== imageToDelete.id));
    } catch (err: any) {
      console.error("[MEDIA][DELETE][ERR]", err);
      addToast(err?.message ?? "Falha ao excluir imagem", "error");
      await loadImages();
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
      setImageToDelete(null);
    }
  }

  async function handleSetPrincipal(img: Imagem) {
    try {
      await setPrincipalProductImage(produtoId, img.id);
      addToast("Imagem principal definida.", "success");
      setImagens(prev => prev.map(i => ({ ...i, principal: i.id === img.id })).sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0)));
    } catch (err: any) {
      console.error("[MEDIA][SET_PRINCIPAL][ERR]", err);
      addToast(err?.message ?? "Falha ao definir imagem principal", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        className={`p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors duration-200 text-center
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50/50 hover:border-gray-400'}
          ${uploading ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center">
          {uploading ? (
            <>
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="mt-4 text-sm font-semibold text-blue-600">Enviando imagens...</p>
            </>
          ) : (
            <>
              <UploadCloud className="w-10 h-10 text-gray-400" />
              <p className="mt-4 text-sm font-semibold text-gray-700">
                Arraste e solte as imagens aqui
              </p>
              <p className="text-xs text-gray-500">ou clique para selecionar os arquivos</p>
            </>
          )}
        </div>
      </div>

      <div>
        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 text-gray-400 animate-spin" /></div>
        ) : imagens.length === 0 ? (
          <div className="text-center p-8 text-sm text-gray-500">Nenhuma imagem enviada ainda.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <AnimatePresence>
              {imagens.map((img) => {
                const imageUrl = signedImageUrls[img.id];
                return (
                  <motion.div
                    key={img.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className={`relative group aspect-square rounded-xl overflow-hidden border-2
                      ${img.principal ? 'border-blue-500 shadow-lg' : 'border-transparent'}`}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Imagem do produto ${produtoId}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <Loader2 className="animate-spin text-gray-500" />
                      </div>
                    )}
                    {img.principal && (
                      <div className="absolute top-2 right-2 bg-blue-500 text-white p-1.5 rounded-full shadow-md">
                        <Star size={14} fill="white" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      {!img.principal && (
                        <button
                          type="button"
                          onClick={() => handleSetPrincipal(img)}
                          className="p-3 bg-white/20 text-white rounded-full hover:bg-white/30 backdrop-blur-sm"
                          title="Definir como principal"
                        >
                          <Star size={18} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openDeleteConfirmation(img)}
                        className="p-3 bg-red-500/50 text-white rounded-full hover:bg-red-500/70 backdrop-blur-sm"
                        title="Excluir"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Confirmar Exclusão"
        description="Tem certeza que deseja remover esta imagem? Esta ação não pode ser desfeita."
        confirmText="Sim, Remover"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
}
