import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Point, Area } from 'react-easy-crop/types';
import Modal from '../../ui/Modal';
import { Loader2 } from 'lucide-react';

interface LogoCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (croppedAreaPixels: Area) => void;
}

const LogoCropperModal: React.FC<LogoCropperModalProps> = ({ isOpen, onClose, imageSrc, onCropComplete }) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [loading, setLoading] = useState(false);

  const onCropCompleteCallback = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirmCrop = async () => {
    if (croppedAreaPixels) {
      setLoading(true);
      await onCropComplete(croppedAreaPixels);
      setLoading(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajustar Logo" size="lg">
      <div className="relative w-full h-[50vh] bg-gray-200">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropCompleteCallback}
          cropShape="round"
          showGrid={false}
        />
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-4">
          <label htmlFor="zoom" className="text-sm font-medium text-gray-700">Zoom</label>
          <input
            id="zoom"
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-labelledby="Zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleConfirmCrop}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Confirmar e Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default LogoCropperModal;
