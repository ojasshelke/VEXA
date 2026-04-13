"use client";

/**
 * TryOnOverlay — drop-in component for marketplace product pages.
 * Embeds VEXA's 3D avatar try-on viewer inside an iframe-friendly container.
 * Shows fit metadata, size recommendation, and heatmap toggle.
 *
 * RULE: "use client"
 * RULE: No raw GLB paths — all URLs come from signed API responses
 */

import React, { useState } from 'react';
import { AvatarViewer } from '@/components/AvatarViewer';
import { useTryOn } from '@/hooks/useTryOn';
import {
  Shirt,
  Ruler,
  Activity,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Star,
} from 'lucide-react';

interface TryOnOverlayProps {
  /** Authenticated user ID */
  userId: string;
  /** Marketplace product ID */
  productId: string;
  /** Presigned avatar GLB URL (from useAvatar hook) */
  avatarGlbUrl: string;
  /** Presigned clothing GLB URL (from marketplace product catalog) */
  clothingGlbUrl: string;
  /** Product metadata for display */
  product?: {
    name: string;
    brand: string;
    price: number;
    currency: string;
    sizes: string[];
  };
}

export function TryOnOverlay({
  userId,
  productId,
  avatarGlbUrl,
  clothingGlbUrl,
  product,
}: TryOnOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { status, result, error, triggerTryOn, reset } = useTryOn({ userId });

  const handleTryOn = () => {
    triggerTryOn(productId);
  };

  return (
    <div
      id="vexa-tryon-overlay"
      className="w-full rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#bef264]/10 flex items-center justify-center">
            <Shirt className="w-4 h-4 text-[#bef264]" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Try on your avatar</p>
            {product && (
              <p className="text-white/40 text-xs">{product.brand} · {product.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === 'ready' && (
            <span className="px-2 py-0.5 rounded-full bg-[#bef264]/20 text-[#bef264] text-xs font-medium">
              Fitted
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </div>
      </div>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="border-t border-white/10 p-4 space-y-4">
          {/* 3D Viewer or Result Image */}
          <div className="relative h-72 w-full rounded-xl overflow-hidden border border-white/5 bg-black/20">
            {status === 'ready' && result?.renderUrl ? (
              <div className="relative w-full h-full group">
                <img
                  src={result.renderUrl}
                  alt="Try-on Result"
                  className="w-full h-full object-cover animate-in fade-in zoom-in duration-500"
                />
                <div className="absolute top-3 left-3 px-2 py-1 bg-[#bef264] text-black text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Your Fitting
                </div>
                {/* Visual Polishing Overlay */}
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-xl" />
              </div>
            ) : (
              <AvatarViewer
                glbUrl={avatarGlbUrl}
                className="h-full"
                showControls={status === 'idle'}
              />
            )}
            
            {status === 'loading' && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                 <div className="flex flex-col items-center gap-3">
                   <div className="relative">
                     <div className="w-12 h-12 border-2 border-[#bef264]/20 border-t-[#bef264] rounded-full animate-spin" />
                     <div className="absolute inset-0 flex items-center justify-center">
                        <Shirt className="w-5 h-5 text-[#bef264] animate-pulse" />
                     </div>
                   </div>
                   <p className="text-[#bef264] text-xs font-bold uppercase tracking-[0.2em]">Draping...</p>
                 </div>
              </div>
            )}
          </div>


          {/* Try-On Controls */}
          {status === 'idle' && (
            <button
              id="vexa-tryon-trigger"
              onClick={handleTryOn}
              className="w-full py-3 rounded-xl bg-[#bef264] text-black font-semibold text-sm hover:bg-[#a3e635] transition-colors flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(190,242,100,0.3)]"
            >
              <Shirt className="w-4 h-4" />
              Try This On My Avatar
            </button>
          )}

          {status === 'loading' && (
            <div className="flex items-center justify-center gap-3 py-3 text-white/60 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-[#bef264]" />
              Draping clothing on your avatar…
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-red-300 text-sm flex-1">{error}</p>
              <button
                onClick={reset}
                className="text-white/60 hover:text-white text-xs underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Fit Metadata */}
          {status === 'ready' && result && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Star className="w-3 h-3 text-[#bef264]" />
                  <span className="text-white/50 text-xs">Fit Score</span>
                </div>
                <p className="text-white font-bold text-lg">{result.fitScore ?? '—'}%</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Ruler className="w-3 h-3 text-[#bef264]" />
                  <span className="text-white/50 text-xs">Your Size</span>
                </div>
                <p className="text-white font-bold text-lg">{result.sizeRecommendation ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Activity className="w-3 h-3 text-[#bef264]" />
                  <span className="text-white/50 text-xs">Status</span>
                </div>
                <p className="text-[#bef264] font-bold text-sm">Ready</p>
              </div>
            </div>
          )}

          {/* Retake */}
          {status === 'ready' && (
            <button
              onClick={reset}
              className="w-full py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm transition-colors"
            >
              Reset view
            </button>
          )}
        </div>
      )}
    </div>
  );
}
