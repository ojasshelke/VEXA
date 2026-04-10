import React from 'react';
import { Outfit, TryOnResult } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { Loader2, Zap } from 'lucide-react';

interface ProductCardProps {
  product: Outfit;
  tryOnResult?: TryOnResult;
  isLoading: boolean;
}

export default function ProductCard({ product, tryOnResult, isLoading }: ProductCardProps) {
  const router = useRouter();
  const { setSelectedOutfit, setTryOnResult } = useStore();

  const handleClick = () => {
    setSelectedOutfit(product);
    if (tryOnResult) {
      setTryOnResult(tryOnResult);
    } else {
      setTryOnResult(null);
    }
    router.push(`/products/${product.id}`);
  };

  const currentImage = tryOnResult?.resultImage || product.imageUrl;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      onClick={handleClick}
      className="glass-panel overflow-hidden rounded-2xl cursor-pointer group border border-white/10 hover:border-[#bef264]/40 transition-colors relative"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-white/5">
        <AnimatePresence mode="popLayout">
          <motion.img 
            key={currentImage}
            src={currentImage} 
            alt={product.name} 
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </AnimatePresence>
        
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center opacity-100 transition-opacity z-10">
            <Loader2 className="w-8 h-8 text-[#bef264] animate-spin mb-2" />
            <span className="text-[10px] font-bold text-[#bef264] uppercase tracking-widest px-2 py-1 bg-black/40 rounded-lg">Generating</span>
          </div>
        )}

        {tryOnResult && !isLoading && (
          <div className="absolute top-3 left-3 bg-[#bef264] text-black text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg z-20">
            <Zap className="w-3 h-3 fill-black" />
            TRY ON 
          </div>
        )}
      </div>

      <div className="p-4 relative z-20 bg-black/40">
        <div className="text-[10px] uppercase tracking-wider text-[#d9f99d] block font-medium mb-1.5 border border-[#d9f99d]/30 bg-[#bef264]/10 w-fit px-1.5 py-0.5 rounded">
          {product.category}
        </div>
        <h3 className="text-white font-medium text-sm mb-1 truncate">{product.name}</h3>
        <p className="text-white/80 text-sm font-semibold">${product.price.toFixed(2)}</p>
      </div>
    </motion.div>
  );
}
