"use client";

import React, { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Ruler, Box, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useClothingGlb } from '@/hooks/useClothingGlb';
import { AvatarViewer } from '@/components/AvatarViewer';
import { TryOnOverlay } from '@/components/TryOnOverlay';

export default function ProductDetailPage() {
  const router = useRouter();
  const { selectedOutfit, currentUser, tryOnResult } = useStore();
  
  const [fitLabel, setFitLabel] = useState<string | null>(null);
  const [recommendedSize, setRecommendedSize] = useState<string | null>(null);
  const [isSizeLoading, setIsSizeLoading] = useState(false);

  const { glbUrl, isLoading: clothingLoading } = useClothingGlb(
    selectedOutfit?.id, 
    selectedOutfit?.imageUrl, 
    'tops'
  );

  useEffect(() => {
    if (!selectedOutfit) {
      router.push('/products');
    }
  }, [selectedOutfit, router]);

  useEffect(() => {
    const fetchSize = async () => {
      if (!currentUser?.id || !selectedOutfit?.id) return;
      setIsSizeLoading(true);
      try {
        const res = await fetch("/api/size", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: currentUser.id, product_id: selectedOutfit.id })
        });
        if (res.ok) {
          const data = await res.json();
          setFitLabel(data.fitLabel);
          setRecommendedSize(data.recommendedSize);
        }
      } catch (e) {
        console.error("Size fetch failed:", e);
      } finally {
        setIsSizeLoading(false);
      }
    };
    
    fetchSize();
  }, [currentUser, selectedOutfit]);

  if (!selectedOutfit) return null;

  const displayImage = tryOnResult?.resultImage || selectedOutfit.imageUrl;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 relative min-h-screen pb-32">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-[#bef264]/5 blur-[120px] rounded-full pointer-events-none -z-10" />

      <button 
        onClick={() => router.back()}
        className="flex items-center gap-2 text-white/50 hover:text-white mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Products
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
        {/* Left: Large Image (Try-on result) */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative aspect-[3/4] w-full max-w-lg mx-auto lg:mx-0 glass-panel rounded-3xl overflow-hidden shadow-[0_0_40px_rgba(190,242,100,0.1)] border border-white/10"
        >
          <img 
            src={displayImage} 
            alt={selectedOutfit.name} 
            className="w-full h-full object-cover"
          />
          {tryOnResult && (
            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-[#bef264] border border-[#bef264]/20 flex items-center gap-1.5">
              <span>Personalized Try-On</span>
            </div>
          )}
        </motion.div>

        {/* Right: Details & Features */}
        <div className="flex flex-col gap-8">
          <div>
            <div className="text-sm font-bold uppercase tracking-widest text-[#bef264] mb-2">
              {selectedOutfit.category}
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">
              {selectedOutfit.name}
            </h1>
            <div className="text-2xl font-medium text-white/90">
              ${selectedOutfit.price.toFixed(2)}
            </div>
          </div>

          <div className="h-px w-full bg-white/10" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Size Recommendation Panel */}
            <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3 relative overflow-hidden border border-[#bef264]/20">
              <div className="absolute top-0 right-0 w-20 h-20 bg-[#bef264]/10 blur-xl rounded-full" />
              <div className="flex items-center gap-2 text-white/60 font-semibold uppercase tracking-wider text-xs">
                <Ruler className="w-4 h-4" />
                VEXA Fit Engine
              </div>
              
              {isSizeLoading ? (
                <div className="h-10 flex items-center">
                  <div className="w-5 h-5 border-2 border-[#bef264]/30 border-t-[#bef264] rounded-full animate-spin" />
                </div>
              ) : fitLabel && recommendedSize ? (
                <div>
                  <p className="text-white text-sm mb-1">
                    This fits you <span className="font-bold text-[#bef264]">{fitLabel}</span>
                  </p>
                  <p className="text-2xl font-black text-white">
                    Try Size {recommendedSize}
                  </p>
                </div>
              ) : (
                <p className="text-white/50 text-sm">Please upload photos to get personalized sizing.</p>
              )}
            </div>

            {/* 3D Viewer & Try-On Logic */}
            <div className="glass-panel p-5 rounded-2xl flex flex-col items-center justify-center gap-3 relative overflow-hidden border border-white/10 min-h-[140px]">
              {clothingLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-[#bef264]/30 border-t-[#bef264] rounded-full animate-spin" />
                  <p className="text-white/40 text-xs">Generating 3D model...</p>
                </div>
              ) : glbUrl ? (
                <div className="w-full flex flex-col gap-4">
                  <div className="h-64 w-full rounded-xl overflow-hidden border border-white/5">
                    <AvatarViewer glbUrl={glbUrl} className="h-full" />
                  </div>
                  <TryOnOverlay 
                    userId={currentUser?.id || 'guest'}
                    productId={selectedOutfit?.id || ''}
                    avatarGlbUrl={currentUser?.avatar_url || 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/rp-character/model.glb'}
                    clothingGlbUrl={glbUrl}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-center">
                  <Box className="w-6 h-6 text-white/40" />
                  <div>
                    <p className="text-white font-medium text-sm">3D View Unavailable</p>
                    <p className="text-white/40 text-xs mt-1">Could not load garment model</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button className="w-full py-4 rounded-2xl bg-[#bef264] text-black font-bold text-lg hover:bg-[#a3e635] hover:shadow-[0_0_30px_rgba(190,242,100,0.3)] transition-all flex items-center justify-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
