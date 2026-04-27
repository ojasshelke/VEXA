'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';

// ─── Props ────────────────────────────────────────────────────────────────────

interface LightXTryOnProps {
  productImageUrl: string;
  productName: string;
  onResult?: (resultUrl: string) => void;
  className?: string;
}

// ─── Internal state machine ───────────────────────────────────────────────────

type UIState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

const PROCESSING_MESSAGES: { after: number; text: string }[] = [
  { after: 0,  text: 'Analyzing your body shape...' },
  { after: 15, text: 'Fitting the garment...' },
  { after: 30, text: 'Rendering photorealistic result...' },
  { after: 45, text: 'Almost there...' },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function processingMessage(elapsedSecs: number): string {
  const sorted = [...PROCESSING_MESSAGES].sort((a, b) => b.after - a.after);
  return sorted.find((m) => elapsedSecs >= m.after)?.text ?? PROCESSING_MESSAGES[0].text;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LightXTryOn({
  productImageUrl,
  productName,
  onResult,
  className = '',
}: LightXTryOnProps) {
  const { userPhotoUrl, currentUser } = useStore();

  const [uiState, setUiState] = useState<UIState>('idle');
  const [photoPreview, setPhotoPreview] = useState<string | null>(userPhotoUrl ?? null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync store photo on mount
  useEffect(() => {
    if (userPhotoUrl && !photoPreview) {
      setPhotoPreview(userPhotoUrl);
    }
  }, [userPhotoUrl, photoPreview]);

  // Elapsed timer during processing
  useEffect(() => {
    if (uiState === 'processing') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [uiState]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a JPEG, PNG, or WebP image.');
      setUiState('error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorMsg('Image exceeds 10 MB. Please choose a smaller file.');
      setUiState('error');
      return;
    }
    try {
      const b64 = await fileToBase64(file);
      setPhotoPreview(b64);
      setPhotoBase64(b64);
    } catch {
      setErrorMsg('Could not read the selected file.');
      setUiState('error');
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  // ── Try-On flow ────────────────────────────────────────────────────────────

  const handleTryOn = async () => {
    if (!photoPreview) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setUiState('uploading');
    setErrorMsg('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      const userId = currentUser?.id ?? session?.user?.id ?? 'demo_user_001';

      // Determine person URL — upload base64 if needed
      let personUrl: string;

      const sourcePhoto = photoBase64 ?? photoPreview;

      if (sourcePhoto.startsWith('data:') || sourcePhoto.startsWith('blob:')) {
        if (!token) throw new Error('Sign in to upload your photo.');

        const uploadRes = await fetch('/api/lightx/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ base64Image: sourcePhoto, userId, type: 'person' }),
          signal,
        });

        if (!uploadRes.ok) {
          const errData = (await uploadRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error ?? `Upload failed (${uploadRes.status})`);
        }

        const { publicUrl } = (await uploadRes.json()) as { publicUrl: string };
        personUrl = publicUrl;
      } else {
        personUrl = sourcePhoto;
      }

      setUiState('processing');

      // Call the try-on API
      const tryOnRes = await fetch('/api/tryon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId,
          userPhotoUrl: personUrl,
          productId: 'lightx-direct',
          productImageUrl: productImageUrl,
        }),
        signal,
      });

      if (!tryOnRes.ok) {
        const errData = (await tryOnRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `Try-on failed (${tryOnRes.status})`);
      }

      const data = (await tryOnRes.json()) as { result_url?: string; resultUrl?: string };
      const output = data.result_url ?? data.resultUrl;

      if (!output) throw new Error('No result URL received from the engine.');

      setResultUrl(output);
      setUiState('success');
      onResult?.(output);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Unexpected error. Please try again.';
      setErrorMsg(msg);
      setUiState('error');
    }
  };

  const resetToIdle = (clearPhoto = false) => {
    abortRef.current?.abort();
    setUiState('idle');
    setResultUrl(null);
    setErrorMsg('');
    setElapsed(0);
    setSliderPos(50);
    if (clearPhoto) {
      setPhotoPreview(userPhotoUrl ?? null);
      setPhotoBase64(null);
    }
  };

  const downloadResult = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `vexa-tryon-${Date.now()}.jpg`;
    a.click();
  };

  // ── Slider drag ────────────────────────────────────────────────────────────

  const sliderContainerRef = useRef<HTMLDivElement>(null);

  const onSliderDrag = (clientX: number) => {
    const rect = sliderContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pct);
  };

  const onMouseMove = (e: React.MouseEvent) => { if (e.buttons === 1) onSliderDrag(e.clientX); };
  const onTouchMove = (e: React.TouchEvent) => { onSliderDrag(e.touches[0].clientX); };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`w-full ${className}`}>
      <AnimatePresence mode="wait">

        {/* ── IDLE ── */}
        {uiState === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex flex-col gap-6"
          >
            <div className="grid grid-cols-2 gap-4">
              {/* Person photo upload */}
              <div
                ref={dropRef}
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 backdrop-blur-sm p-5 cursor-pointer hover:border-[#bef264]/60 hover:bg-white/10 transition-all min-h-[180px] group"
              >
                {photoPreview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt="Your photo"
                      className="w-full h-40 object-cover rounded-xl"
                    />
                    <span className="text-xs text-white/50 group-hover:text-[#bef264] transition-colors">
                      Click to change
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-white/70">Your Photo</p>
                    <p className="text-xs text-white/30 text-center">Drag & drop or click<br />JPG, PNG, WebP · max 10 MB</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>

              {/* Garment (fixed) */}
              <div className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 min-h-[180px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={productImageUrl}
                  alt={productName}
                  className="w-full h-40 object-contain rounded-xl"
                />
                <p className="text-xs text-white/60 text-center truncate w-full px-2">{productName}</p>
              </div>
            </div>

            <button
              onClick={() => void handleTryOn()}
              disabled={!photoPreview}
              className="w-full py-4 rounded-2xl font-semibold text-black bg-[#bef264] hover:bg-[#a3e635] disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm tracking-wide shadow-lg shadow-[#bef264]/20"
            >
              Try On
            </button>
          </motion.div>
        )}

        {/* ── UPLOADING ── */}
        {uiState === 'uploading' && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-6 py-12"
          >
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-t-[#bef264] border-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
            </div>
            <p className="text-white/70 text-sm font-medium">Uploading images…</p>
          </motion.div>
        )}

        {/* ── PROCESSING ── */}
        {uiState === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-6 py-12"
          >
            {/* Animated ring */}
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border border-white/10" />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-t-[#bef264] border-r-[#bef264]/30 border-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-mono text-[#bef264]">{elapsed}s</span>
              </div>
            </div>

            {/* Cycling message */}
            <AnimatePresence mode="wait">
              <motion.p
                key={processingMessage(elapsed)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="text-white/80 text-sm font-medium text-center"
              >
                {processingMessage(elapsed)}
              </motion.p>
            </AnimatePresence>

            {/* Progress bar */}
            <div className="w-full max-w-xs h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#bef264] to-[#ecfccb] rounded-full"
                animate={{ width: `${Math.min(95, (elapsed / 60) * 100)}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>

            <p className="text-xs text-white/30">Powered by LightX AI</p>
          </motion.div>
        )}

        {/* ── SUCCESS ── */}
        {uiState === 'success' && resultUrl && photoPreview && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-5"
          >
            {/* Before / after slider */}
            <div
              ref={sliderContainerRef}
              className="relative w-full rounded-2xl overflow-hidden cursor-col-resize select-none"
              style={{ aspectRatio: '3/4' }}
              onMouseMove={onMouseMove}
              onTouchMove={onTouchMove}
            >
              {/* After (result) — full width base */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultUrl}
                alt="Try-on result"
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />

              {/* Before (original) — clipped to left of slider */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Original photo"
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                />
                <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/60 text-xs text-white/80 backdrop-blur-sm">
                  Before
                </div>
              </div>

              {/* Slider handle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#bef264] shadow-[0_0_12px_rgba(190,242,100,0.6)]"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#bef264] flex items-center justify-center shadow-lg">
                  <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l-4 3 4 3M16 9l4 3-4 3" />
                  </svg>
                </div>
              </div>

              {/* After label */}
              <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/60 text-xs text-white/80 backdrop-blur-sm">
                After
              </div>

              {/* LightX badge */}
              <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-black/60 text-xs text-[#bef264] backdrop-blur-sm">
                ✨ Powered by LightX
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => resetToIdle(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-sm font-medium transition-colors"
              >
                Try Another
              </button>
              <button
                onClick={downloadResult}
                className="flex-1 py-3 rounded-xl bg-[#bef264] hover:bg-[#a3e635] text-black text-sm font-semibold transition-colors"
              >
                Save Result
              </button>
            </div>
          </motion.div>
        )}

        {/* ── ERROR ── */}
        {uiState === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 backdrop-blur-sm p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium mb-1">Try-On Failed</p>
                <p className="text-white/60 text-sm leading-relaxed">{errorMsg}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => resetToIdle(true)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-sm font-medium transition-colors"
              >
                Try a Different Photo
              </button>
              <button
                onClick={() => { resetToIdle(false); void handleTryOn(); }}
                disabled={!photoPreview}
                className="flex-1 py-3 rounded-xl bg-[#bef264] hover:bg-[#a3e635] text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Try Again
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
