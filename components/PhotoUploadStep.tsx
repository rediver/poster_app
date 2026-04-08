import React, { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from './ui/button';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];

interface PhotoUploadStepProps {
  /** Activity metadata shown in the header */
  activityName?: string;
  activityType?: string;
  activityDate?: string;
  onPhotoUploaded: (photoUrl: string) => void;
  onBack: () => void;
  /** When true, render only the drop zone (no full-page wrapper / stepper) */
  inline?: boolean;
}

export function PhotoUploadStep({
  activityName,
  activityType,
  activityDate,
  onPhotoUploaded,
  onBack,
  inline,
}: PhotoUploadStepProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || '';

  const processFile = useCallback(async (file: File) => {
    setError(null);

    // Validate type
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const validExt = ACCEPTED_EXTENSIONS.some(e => ext === e.replace('.', ''));
    if (!ACCEPTED_TYPES.includes(file.type) && !validExt) {
      setError('Unsupported file type. Please use JPEG, PNG, WebP, or HEIC.');
      return;
    }

    setUploading(true);

    // Local dev: keep photo in browser memory (no backend needed)
    if (!BACKEND_URL) {
      const localUrl = URL.createObjectURL(file);
      setUploading(false);
      onPhotoUploaded(localUrl);
      return;
    }

    // Production (Render): upload to backend → S3
    try {
      const formData = new FormData();
      formData.append('photo', file);

      const res = await fetch(`${BACKEND_URL}/api/upload_photo`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || `Upload failed (${res.status})`);
      }

      onPhotoUploaded(data.photo_url);
    } catch (e: any) {
      console.error('Photo upload failed:', e);
      setError(e.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [BACKEND_URL, onPhotoUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // Shared drop zone
  const dropZone = (
    <div
      className={`relative rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-4 ${
        inline ? 'w-full h-full' : 'w-full max-w-3xl aspect-[3/2]'
      } ${
        dragOver
          ? 'border-orange-500 bg-orange-50'
          : 'border-gray-300 bg-white hover:border-gray-400'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleFileChange}
        className="hidden"
      />

      {uploading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Uploading…</p>
        </div>
      ) : (
        <>
          <Upload className="w-10 h-10 text-gray-400" />
          <p className="text-base text-gray-700 font-medium">Drop photo here or click to upload</p>
          <p className="text-sm text-gray-400">JPEG, PNG, WebP, or HEIC — at least 1875×1275px</p>
        </>
      )}

      {error && (
        <p className="text-sm text-red-500 mt-2">{error}</p>
      )}
    </div>
  );

  // Inline mode: just the drop zone, no page chrome
  if (inline) {
    return (
      <div className="flex flex-col items-center w-full h-full p-8">
        {dropZone}
      </div>
    );
  }

  // Full-page mode (kept for potential standalone use)
  return (
    <div className="min-h-screen bg-[#fdf8f3] flex flex-col">
      {/* Activity header */}
      {activityName && (
        <div className="px-8 pt-6 pb-4 flex items-center gap-3">
          {activityType && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
              {activityType === 'Ride' ? '🚴' : activityType === 'Run' ? '🏃' : '🚶'}
              {activityType}
            </span>
          )}
          <span className="text-lg font-semibold">{activityName}</span>
          {activityDate && <span className="text-sm text-gray-500">{activityDate}</span>}
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center justify-center gap-0 py-6">
        {[
          { num: 1, label: 'Template', done: true },
          { num: 2, label: 'Photo', active: true },
          { num: 3, label: 'Customize' },
          { num: 4, label: 'Recipient' },
          { num: 5, label: 'Review' },
        ].map((step, i, arr) => (
          <React.Fragment key={step.num}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
                  step.done
                    ? 'bg-orange-500 text-white'
                    : step.active
                    ? 'bg-orange-500 text-white ring-4 ring-orange-200'
                    : 'bg-white text-gray-400 border-2 border-gray-300'
                }`}
              >
                {step.done ? '✓' : step.num}
              </div>
              <span className={`text-xs ${step.active || step.done ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
            {i < arr.length - 1 && (
              <div className={`w-16 h-0.5 mt-[-18px] ${i < 1 ? 'bg-orange-500' : 'bg-gray-300'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Upload area */}
      <div className="flex-1 flex flex-col items-center px-8 pb-8">
        <h2 className="text-2xl font-bold mb-6">Upload a Photo</h2>
        {dropZone}

        <button
          onClick={onBack}
          className="mt-8 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Back to templates
        </button>
      </div>
    </div>
  );
}
