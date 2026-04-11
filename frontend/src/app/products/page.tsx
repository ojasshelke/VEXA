"use client";

import React, { useEffect, useState } from 'react';
import { Outfit, TryOnResult } from '@/types';
import { useStore } from '@/store/useStore';
import ProductCard from '@/components/ProductCard';
import { Camera } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

// Generate 12 mock products
const MOCK_PRODUCTS: Outfit[] = Array.from({ length: 12 }).map((_, i) => ({
  id: `mock-prod-${i+1}`,
  name: `Premium Collection Item ${i+1}`,
  price: 89.99 + (i * 10),
  imageUrl: `https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=400&h=600`,
  category: i % 2 === 0 ? "TOPS" : (i % 3 === 0 ? "DRESS" : "OUTERWEAR")
}));

export default function ProductsPage() {
  const { currentUser, userPhotoUrl } = useStore();
  const [results, setResults] = useState<Record<string, TryOnResult>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (userPhotoUrl && currentUser?.id) {
      const runBatch = async () => {
        const initialLoadMap: Record<string, boolean> = {};
        MOCK_PRODUCTS.forEach(p => { initialLoadMap[p.id] = true; });
        setLoadingMap(initialLoadMap);

        try {
          const res = await fetch("/api/tryon/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: currentUser.id,
              user_photo_url: userPhotoUrl,
              products: MOCK_PRODUCTS.map(p => ({
                product_id: p.id,
                product_image_url: p.imageUrl
              }))
            })
          });

          if (res.ok) {
            const data: Array<{ product_id: string, result_url: string }> = await res.json();
            const newResults: Record<string, TryOnResult> = {};
            data.forEach(item => {
              newResults[item.product_id] = {
                id: Date.now().toString(),
                userId: currentUser.id,
                productId: item.product_id,
                resultImage: item.result_url,
                originalImage: userPhotoUrl,
                status: 'ready'
              } as TryOnResult;
              setLoadingMap(prev => ({ ...prev, [item.product_id]: false }));
            });
            setResults(prev => ({ ...prev, ...newResults }));
            
            // To ensure safety, set everything false just in case
            MOCK_PRODUCTS.forEach(p => {
               setLoadingMap(prev => ({ ...prev, [p.id]: false }));
            });
          }
        } catch (e) {
          console.error("Batch dispatch error", e);
          MOCK_PRODUCTS.forEach(p => {
             setLoadingMap(prev => ({ ...prev, [p.id]: false }));
          });
        }
      };

      runBatch();
    }
  }, [userPhotoUrl, currentUser]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-12 relative min-h-screen">
      <div className="absolute top-0 right-0 w-1/2 h-[500px] bg-[#bef264]/10 blur-[120px] rounded-full pointer-events-none -z-10" />

      <div className="mb-10 flex flex-col gap-2">
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight text-center sm:text-left">
          Discover <span className="text-[#bef264]">Your</span> Look
        </h1>
        <p className="text-white/60 text-center sm:text-left text-lg max-w-2xl">
          Browse our latest collection. Uploading a photo enables virtual try-on on every single item in the store.
        </p>
      </div>

      {!userPhotoUrl && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 p-6 rounded-2xl glass-panel border border-[#bef264]/20 bg-gradient-to-r from-black/40 to-[#bef264]/5 flex flex-col sm:flex-row items-center justify-between gap-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#bef264]/20 flex items-center justify-center">
              <Camera className="w-6 h-6 text-[#bef264]" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg">Upload your photo to see clothes on you</h3>
              <p className="text-white/50 text-sm">Personalize the entire store instantly.</p>
            </div>
          </div>
          <Link 
            href="/onboarding" 
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#bef264] to-[#a3e635] text-black font-semibold text-sm hover:shadow-[0_0_20px_rgba(190,242,100,0.4)] transition-shadow whitespace-nowrap"
          >
            Setup Profile
          </Link>
        </motion.div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {MOCK_PRODUCTS.map((product) => (
          <ProductCard 
            key={product.id}
            product={product}
            tryOnResult={results[product.id]}
            isLoading={!!loadingMap[product.id]}
          />
        ))}
      </div>
    </div>
  );
}
