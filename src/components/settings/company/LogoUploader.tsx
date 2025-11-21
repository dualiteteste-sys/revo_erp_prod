import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Loader2, Building2, Trash2 } from 'lucide-react';
import { useToast } from '../../../contexts/ToastProvider';
import { uploadCompanyLogo, deleteCompanyLogo } from '../../../services/company';
import { useAuth } from '../../../contexts/AuthProvider';
import LogoCropperModal from './LogoCropperModal';
import { getCroppedImg } from '../../../lib/imageUtils';
import { Area } from 'react-easy-crop/types';
import { useSupabase } from '@/providers/SupabaseProvider';

const LOGO_BUCKET = 'company_logos';

interface LogoUploaderProps {
  logoPath: string | null;
  onLogoChange: (newPath: string | null) => void;
}

const LogoUploader: React.FC<LogoUploaderProps> = ({ logoPath, onLogoChange }) => {
  const supabase = useSupabase();
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  useEffect(() => {
    if (logoPath) {
      const generateSignedUrl = async () => {
        const { data, error } = await supabase.storage
          .from(LOGO_BUCKET)
          .createSignedUrl(logoPath, 3600); // 1 hour expiry
        if (error) {
          addToast('Não foi possível carregar o logo.', 'error');
          setDisplayUrl(null);
        } else {
          setDisplayUrl(data.signedUrl);
        }
      };
      generateSignedUrl();
    } else {
      setDisplayUrl(null);
    }
  }, [logoPath, addToast, supabase]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result as string);
        setIsCropperOpen(true);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleCropComplete = async (croppedAreaPixels: Area) => {
    if (!activeEmpresa || !imageToCrop) return;

    setIsUploading(true);
    try {
      const croppedImageFile = await getCroppedImg(imageToCrop, croppedAreaPixels);
      if (!croppedImageFile) {
        throw new Error('Não foi possível cortar a imagem.');
      }

      if (logoPath) {
        try {
          await deleteCompanyLogo(logoPath);
        } catch (deleteError) {
          console.warn("Falha ao remover logo antigo, prosseguindo com o upload:", deleteError);
        }
      }

      const newLogoPath = await uploadCompanyLogo(activeEmpresa.id, croppedImageFile);
      onLogoChange(newLogoPath);
      addToast('Logo enviado com sucesso!', 'success');
    } catch (error: any) {
        const friendlyMessage = error.message.includes('Failed to fetch')
        ? 'Falha ao ler o arquivo. Se estiver na nuvem (iCloud/OneDrive), baixe-o para o dispositivo antes de enviar.'
        : error.message || 'Falha no upload do logo.';
      addToast(friendlyMessage, 'error');
    } finally {
      setIsUploading(false);
      setImageToCrop(null);
      setIsCropperOpen(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!logoPath) return;

    try {
      await deleteCompanyLogo(logoPath);
      onLogoChange(null);
      addToast('Logo removido.', 'info');
    } catch (error: any) {
      addToast(error.message || 'Falha ao remover o logo.', 'error');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.webp', '.gif'] },
    multiple: false,
    disabled: isUploading,
  });

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Logo da Empresa</h2>
        <div className="flex items-center gap-6">
          <div 
            {...getRootProps()} 
            className={`relative w-40 h-40 rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors
              ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50/50 hover:border-gray-400'}`}
          >
            <input {...getInputProps()} />
            
            {displayUrl ? (
              <img src={displayUrl} alt="Logo da empresa" className="w-full h-full object-cover rounded-full" />
            ) : (
              <div className="text-center text-gray-500">
                <Building2 className="mx-auto h-10 w-10" />
              </div>
            )}

            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              {isUploading ? (
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              ) : (
                <UploadCloud className="h-8 w-8 text-white" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
              <button type="button" {...getRootProps()} disabled={isUploading} className="text-sm text-blue-600 font-medium hover:underline disabled:opacity-50">
                  {isUploading ? 'Enviando...' : 'Trocar logo'}
              </button>
              {logoPath && (
                  <button type="button" onClick={handleDeleteLogo} className="flex items-center gap-1 text-sm text-red-600 font-medium hover:underline">
                      <Trash2 size={14} /> Remover
                  </button>
              )}
              <p className="text-xs text-gray-500 mt-2">PNG, JPG, WEBP ou GIF (máx. 5MB)</p>
          </div>
        </div>
      </div>
      {imageToCrop && (
        <LogoCropperModal
          isOpen={isCropperOpen}
          onClose={() => setIsCropperOpen(false)}
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
        />
      )}
    </>
  );
};

export default LogoUploader;
