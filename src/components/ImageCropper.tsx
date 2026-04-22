import React, { useCallback, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface ImageCropperProps {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  onCropComplete: (croppedBlob: Blob) => void;
}

/**
 * Returns a cropped Blob from the source image using canvas.
 */
async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = imageSrc;
  });

  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxWidth = image.width * cos + image.height * sin;
  const bBoxHeight = image.width * sin + image.height * cos;

  // Draw rotated image on an offscreen canvas first
  const rotatedCanvas = document.createElement('canvas');
  rotatedCanvas.width = bBoxWidth;
  rotatedCanvas.height = bBoxHeight;
  const rCtx = rotatedCanvas.getContext('2d');
  if (!rCtx) throw new Error('Canvas not supported');
  rCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
  rCtx.rotate(rad);
  rCtx.drawImage(image, -image.width / 2, -image.height / 2);

  // Crop the rotated canvas
  const outSize = 512; // output 512x512 for good avatar quality
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(
    rotatedCanvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outSize,
    outSize
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      'image/jpeg',
      0.92
    );
  });
}

export function ImageCropper({ open, imageSrc, onCancel, onCropComplete }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixelArea, setPixelArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onAreaComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixelArea(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !pixelArea) return;
    try {
      setSaving(true);
      const blob = await getCroppedBlob(imageSrc, pixelArea, rotation);
      onCropComplete(blob);
      // Reset local state for next use
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    } catch (e) {
      console.error('Crop failed', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="p-0 overflow-hidden max-w-md rounded-3xl bg-white/95 ring-1 ring-sky-400/10 backdrop-blur-xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-sky-400/10">
          <DialogTitle className="text-lg font-extrabold text-slate-800" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Crop your photo
          </DialogTitle>
          <p className="text-xs text-slate-500">Drag to reposition · pinch or use slider to zoom</p>
        </DialogHeader>

        <div className="relative h-80 w-full bg-slate-900">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onAreaComplete}
            />
          )}
        </div>

        <div className="px-6 py-4 space-y-3 bg-sky-50/40">
          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 text-slate-500 shrink-0" />
            <input
              data-testid="cropper-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1 accent-sky-500 cursor-pointer"
            />
            <ZoomIn className="h-4 w-4 text-slate-500 shrink-0" />
            <button
              type="button"
              data-testid="cropper-rotate"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white ring-1 ring-sky-400/20 text-sky-600 hover:bg-sky-400 hover:text-white transition"
              aria-label="Rotate 90 degrees"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
              className="flex-1 h-10 rounded-2xl bg-white text-slate-700 ring-1 ring-sky-400/10 hover:bg-sky-50"
              data-testid="cropper-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !pixelArea}
              className="flex-1 h-10 rounded-2xl bg-sky-400 hover:bg-sky-500 text-white font-bold shadow-[0_10px_15px_-3px_rgba(56,189,248,0.3),0_4px_6px_-4px_rgba(56,189,248,0.3)]"
              data-testid="cropper-save"
            >
              {saving ? 'Saving...' : 'Save photo'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
