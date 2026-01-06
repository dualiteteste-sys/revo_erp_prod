import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Camera, Clipboard, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';

type QuickScanModalProps = {
  isOpen: boolean;
  title?: string;
  helper?: React.ReactNode;
  confirmLabel?: string;
  onResult: (text: string) => void;
  onClose: () => void;
};

export default function QuickScanModal({
  isOpen,
  title = 'Escanear código',
  helper,
  confirmLabel = 'Usar',
  onResult,
  onClose,
}: QuickScanModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setReady(false);
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | null = null;

    const start = async () => {
      try {
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err, ctl) => {
          if (result) {
            ctl.stop();
            onResult(result.getText());
          }
          if (err && err.name !== 'NotFoundException') {
            setError(err.message ?? 'Falha ao ler o código.');
          }
        });
        setReady(true);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível acessar a câmera. Verifique permissões/HTTPS.');
      }
    };

    void start();

    return () => {
      controls?.stop();
    };
  }, [isOpen, onResult]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="2xl"
      bodyClassName="p-6"
    >
      <div className="space-y-4">
        {helper ? <div className="text-sm text-slate-700">{helper}</div> : null}

        <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-black shadow-sm">
          <video ref={videoRef} autoPlay muted playsInline className="h-72 w-full object-cover" />
          {!ready && !error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-sm text-white">
              <Loader2 className="h-6 w-6 animate-spin text-blue-300" />
              Iniciando câmera…
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2 text-xs text-white backdrop-blur">
            <Camera size={14} className="text-blue-200" />
            Aponte para o código
          </div>
        </div>

        <div className="rounded-2xl border border-white/40 bg-white/60 p-4 backdrop-blur">
          <div className="text-xs font-semibold text-slate-700">Sem câmera? Cole o conteúdo:</div>
          <div className="mt-2 flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ex.: EAN/SKU/Tracking…"
              className="w-full rounded-xl border border-white/50 bg-white/70 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
            />
            <Button
              type="button"
              onClick={() => manual.trim() && onResult(manual.trim())}
              className="shrink-0 rounded-xl"
              title="Usar o texto colado"
            >
              <Clipboard size={16} className="mr-2" />
              {confirmLabel}
            </Button>
          </div>
          <div className="mt-2 text-[11px] text-slate-600">
            Funciona melhor em HTTPS e com permissão de câmera. Em dispositivos sem câmera, use o campo acima.
          </div>
        </div>
      </div>
    </Modal>
  );
}

