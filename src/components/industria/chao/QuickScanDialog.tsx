import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Loader2, XCircle, Camera } from 'lucide-react';

type QuickScanDialogProps = {
  open: boolean;
  title?: string;
  helper?: React.ReactNode;
  onResult: (text: string) => void;
  onClose: () => void;
};

const dialogRoot = typeof document !== 'undefined' ? document.body : null;

const QuickScanDialog: React.FC<QuickScanDialogProps> = ({
  open,
  title = 'Escanear QR / Código',
  helper,
  onResult,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setReady(false);
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | null = null;

    const start = async () => {
      try {
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, err, ctl) => {
            if (result) {
              ctl.stop();
              onResult(result.getText());
            }
            if (err && err.name !== 'NotFoundException') {
              setError(err.message ?? 'Falha ao ler o código.');
            }
          }
        );
        setReady(true);
      } catch (err: any) {
        setError(
          err?.message ||
            'Não foi possível acessar a câmera. Verifique permissões/HTTPS.'
        );
      }
    };

    start();

    return () => {
      controls?.stop();
    };
  }, [open, onResult]);

  if (!dialogRoot || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
      <div className="relative w-full max-w-xl rounded-3xl bg-slate-950/80 border border-slate-800 p-5 text-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors"
        >
          <XCircle size={24} />
        </button>

        <div className="space-y-3 mb-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Camera size={22} className="text-blue-400" />
            {title}
          </h2>
          {helper && <p className="text-sm text-slate-300">{helper}</p>}
        </div>

        <div className="relative h-72 rounded-2xl overflow-hidden border border-slate-800 bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          {!ready && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-sm">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              Iniciando câmera...
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4 text-center text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-slate-400">
          Funcionamento ideal apenas em HTTPS/dispositivos com câmera.
        </div>
      </div>
    </div>,
    dialogRoot
  );
};

export default QuickScanDialog;
