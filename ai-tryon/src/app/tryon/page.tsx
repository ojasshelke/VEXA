'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AvatarViewer } from '@/components/AvatarViewer';
import { ResultUI } from '@/components/ResultUI';
import TryOnFlow from '@/components/TryOnFlow';
import { useAuth } from '@/hooks/useAuth';
import { useAvatar } from '@/hooks/useAvatar';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';
import {
  Sparkles, Shirt, ShoppingBag, ArrowRight,
  Loader2, Upload, Camera, ChevronRight,
} from 'lucide-react';

// Sample products for demo
const SAMPLE_PRODUCTS = [
  { id: 'p1', name: 'Classic White Tee', price: 29, imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&q=80', category: 'tops' },
  { id: 'p2', name: 'Denim Jacket', price: 89, imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&q=80', category: 'tops' },
  { id: 'p3', name: 'Black Hoodie', price: 59, imageUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&q=80', category: 'tops' },
  { id: 'p4', name: 'Flannel Shirt', price: 45, imageUrl: 'https://images.unsplash.com/photo-1589310243389-96a5483213a8?w=400&q=80', category: 'tops' },
];

export default function TryOnPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { glbUrl, isLoading: avatarLoading } = useAvatar(user?.id);
  const {
    userImage, setUserImage,
    selectedOutfit, setSelectedOutfit,
    isProcessing, setIsProcessing,
    tryOnResult,
  } = useStore();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Handle photo upload for try-on
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUserImage(ev.target?.result as string);
      setUploadingPhoto(false);
    };
    reader.readAsDataURL(file);
  };

  // Handle product selection and trigger try-on
  const handleSelectProduct = (product: typeof SAMPLE_PRODUCTS[0]) => {
    if (!userImage) {
      alert('Please upload your photo first');
      return;
    }
    setSelectedOutfit(product);
    setIsProcessing(true);
  };

  // In production, redirect to login if not authenticated
  // For demo/dev mode, allow page to render without auth
  useEffect(() => {
    if (!authLoading && !user) {
      console.log('[TryOnPage] No user session — running in demo mode');
      // TODO: Uncomment for production:
      // router.push('/login?redirect=/tryon');
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#bef264] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#bef264] selection:text-black">
      {/* Processing Overlay */}
      <TryOnFlow />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-black tracking-tighter flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-[#bef264]" />
              Virtual Try-On
            </h1>
            <p className="text-white/40 text-sm mt-1">Upload your photo, pick a garment, see the AI magic</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#bef264]/10 border border-[#bef264]/20">
            <div className="w-2 h-2 rounded-full bg-[#bef264] animate-pulse" />
            <span className="text-[#bef264] text-xs font-bold uppercase tracking-widest">Engine Active</span>
          </div>
        </div>

        {/* Result UI (shows after try-on completes) */}
        {tryOnResult && <ResultUI />}

        {/* Main Grid (shows when no result) */}
        {!tryOnResult && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Avatar + Photo Upload */}
            <div className="space-y-6">
              {/* 3D Avatar */}
              <div className="aspect-[3/4] rounded-2xl overflow-hidden border border-white/5">
                <AvatarViewer avatarUrl={glbUrl || '/models/avatar.glb'} />
              </div>

              {/* Photo Upload */}
              <div className="relative">
                {userImage ? (
                  <div className="relative rounded-2xl overflow-hidden border border-[#bef264]/20">
                    <img src={userImage} alt="Your photo" className="w-full aspect-[3/4] object-cover" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                      <span className="px-3 py-1.5 rounded-lg bg-[#bef264] text-black text-xs font-bold">Photo Ready</span>
                      <button
                        onClick={() => setUserImage(null)}
                        className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur text-white/70 text-xs font-bold hover:bg-black/80"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="block cursor-pointer">
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    <div className="aspect-[3/4] rounded-2xl border-2 border-dashed border-white/10 hover:border-[#bef264]/30 transition-colors flex flex-col items-center justify-center gap-4 bg-white/[0.02]">
                      {uploadingPhoto ? (
                        <Loader2 className="w-8 h-8 text-[#bef264] animate-spin" />
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-2xl bg-[#bef264]/10 flex items-center justify-center">
                            <Camera className="w-8 h-8 text-[#bef264]" />
                          </div>
                          <div className="text-center">
                            <p className="text-white font-bold text-sm">Upload Your Photo</p>
                            <p className="text-white/30 text-xs mt-1">Full body photo works best</p>
                          </div>
                        </>
                      )}
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Right: Product Grid */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <ShoppingBag className="w-5 h-5 text-[#bef264]" />
                <h2 className="text-xl font-bold tracking-tight">Select a Garment</h2>
                <span className="text-white/20 text-xs">({SAMPLE_PRODUCTS.length} items)</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                {SAMPLE_PRODUCTS.map((product) => (
                  <motion.div
                    key={product.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`group cursor-pointer rounded-2xl border overflow-hidden transition-all ${
                      selectedOutfit?.id === product.id
                        ? 'border-[#bef264] shadow-[0_0_30px_rgba(190,242,100,0.2)]'
                        : 'border-white/5 hover:border-white/20'
                    }`}
                    onClick={() => handleSelectProduct(product)}
                  >
                    <div className="aspect-[3/4] relative overflow-hidden bg-zinc-900">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      {isProcessing && selectedOutfit?.id === product.id && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-[#bef264] animate-spin" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 rounded-xl bg-[#bef264] flex items-center justify-center shadow-lg">
                          <Shirt className="w-5 h-5 text-black" />
                        </div>
                      </div>
                    </div>
                    <div className="p-4 bg-zinc-950">
                      <p className="text-[10px] font-bold text-[#bef264] uppercase tracking-widest mb-1">{product.category}</p>
                      <h3 className="text-white font-bold text-sm mb-1">{product.name}</h3>
                      <div className="flex items-center justify-between">
                        <p className="text-white text-lg font-black">${product.price}</p>
                        <span className="text-white/20 text-xs flex items-center gap-1 group-hover:text-[#bef264] transition-colors">
                          Try on <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {!userImage && (
                <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                  <Upload className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <p className="text-amber-200/80 text-sm">Upload your photo first, then click any garment to start the AI try-on.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
