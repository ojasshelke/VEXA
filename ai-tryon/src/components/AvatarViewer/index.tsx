'use client';
import React, { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, ContactShadows } from '@react-three/drei';
import type { Group } from 'three';
import * as THREE from 'three';
import { RotateCcw, ZoomIn, ZoomOut, Sun } from 'lucide-react';

class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("[AvatarViewer] Model load error:", error); }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function AvatarModel({ glbUrl }: { glbUrl: string }) {
  console.log('[AvatarModel] Loading GLB:', glbUrl);
  const { scene } = useGLTF(glbUrl);
  const ref = useRef<Group>(null);
  const { camera } = useThree();

  // Auto-scale and center the model to fit the viewport
  useEffect(() => {
    if (!ref.current) return;
    const box = new THREE.Box3().setFromObject(ref.current);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 2; // We want the model to be about 2 units tall
    const scale = targetSize / maxDim;

    console.log('[AvatarModel] Model size:', size, 'scale:', scale, 'center:', center);

    ref.current.scale.setScalar(scale);
    // Recalculate after scale
    const newBox = new THREE.Box3().setFromObject(ref.current);
    const newCenter = new THREE.Vector3();
    newBox.getCenter(newCenter);
    // Move model so it sits on the ground
    ref.current.position.sub(newCenter);
    ref.current.position.y += (newBox.max.y - newBox.min.y) / 2 * 0;
  }, [scene]);

  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.15;
  });

  return (
    <primitive ref={ref} object={scene} dispose={null} />
  );
}

function PlaceholderAvatar() {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => { if (ref.current) ref.current.rotation.y += delta * 0.5; });
  return (
    <group ref={ref}>
      {/* Head */}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshStandardMaterial color="#bef264" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* Neck */}
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.1, 16]} />
        <meshStandardMaterial color="#a3e635" roughness={0.3} />
      </mesh>
      {/* Torso */}
      <mesh position={[0, 1.05, 0]}>
        <capsuleGeometry args={[0.18, 0.4, 8, 16]} />
        <meshStandardMaterial color="#bef264" opacity={0.7} transparent roughness={0.2} metalness={0.1} />
      </mesh>
      {/* Left arm */}
      <mesh position={[-0.3, 1.1, 0]} rotation={[0, 0, 0.3]}>
        <capsuleGeometry args={[0.05, 0.35, 8, 16]} />
        <meshStandardMaterial color="#a3e635" opacity={0.5} transparent />
      </mesh>
      {/* Right arm */}
      <mesh position={[0.3, 1.1, 0]} rotation={[0, 0, -0.3]}>
        <capsuleGeometry args={[0.05, 0.35, 8, 16]} />
        <meshStandardMaterial color="#a3e635" opacity={0.5} transparent />
      </mesh>
      {/* Left leg */}
      <mesh position={[-0.1, 0.4, 0]}>
        <capsuleGeometry args={[0.07, 0.45, 8, 16]} />
        <meshStandardMaterial color="#bef264" opacity={0.4} transparent />
      </mesh>
      {/* Right leg */}
      <mesh position={[0.1, 0.4, 0]}>
        <capsuleGeometry args={[0.07, 0.45, 8, 16]} />
        <meshStandardMaterial color="#bef264" opacity={0.4} transparent />
      </mesh>
      {/* Glow ring around feet */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.35, 32]} />
        <meshBasicMaterial color="#bef264" opacity={0.3} transparent side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

const CanvasLoader = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/20 backdrop-blur-sm z-50">
    <div className="w-12 h-12 border-4 border-[#bef264]/20 border-t-[#bef264] rounded-full animate-spin" />
    <p className="text-[#bef264] text-xs font-bold uppercase tracking-widest animate-pulse">Initializing Mesh...</p>
  </div>
);

/**
 * AvatarViewer — the CANONICAL 3D avatar viewer component.
 */
interface AvatarViewerProps {
  avatarUrl?: string | null;
  glbUrl?: string | null;
  className?: string;
  showControls?: boolean;
}

function resolveGlbUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const isValid = url.includes('.glb') ||
    url.includes('/avatars/') ||
    url.includes('/models/') ||
    url.startsWith('http') ||
    url.startsWith('/') ||
    url.startsWith('data:');
  return isValid ? url : null;
}

export const AvatarViewer = ({
  avatarUrl,
  glbUrl: glbUrlProp,
  className = "",
  showControls = true,
}: AvatarViewerProps) => {
  const [isAutoRotate, setIsAutoRotate] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [env, setEnv] = useState<'city' | 'studio' | 'apartment'>('city');
  const [modelError, setModelError] = useState(false);

  const rawUrl = avatarUrl || glbUrlProp;
  const finalGlbUrl = resolveGlbUrl(rawUrl);

  console.log('[AvatarViewer] finalGlbUrl:', finalGlbUrl);

  return (
    <div className={`relative w-full h-full bg-zinc-950/50 rounded-2xl overflow-hidden border border-white/5 ${className}`}
         style={{ minHeight: '300px' }}>
      <Canvas
        camera={{ position: [0, 1, 3.5 / zoom], fov: 50 }}
        shadows
        dpr={[1, 2]}
        style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)' }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0a0a0a');
        }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <directionalLight position={[-5, 3, -5]} intensity={0.4} color="#bef264" />
        <pointLight position={[0, 3, 0]} intensity={0.3} color="#bef264" />

        <Suspense fallback={null}>
          <Environment preset={env as any} />
        </Suspense>

        <Suspense fallback={null}>
          {finalGlbUrl && !modelError ? (
            <ErrorBoundary fallback={<PlaceholderAvatar />}>
              <AvatarModel key={finalGlbUrl} glbUrl={finalGlbUrl} />
            </ErrorBoundary>
          ) : (
            <PlaceholderAvatar />
          )}
        </Suspense>

        <ContactShadows opacity={0.4} scale={10} blur={2.5} far={10} resolution={256} color="#000000" position={[0, -0.01, 0]} />
        <OrbitControls
          autoRotate={isAutoRotate}
          autoRotateSpeed={2}
          enablePan={false}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 1.5}
          minDistance={1.5}
          maxDistance={6}
          target={[0, 0.8, 0]}
        />
      </Canvas>

      {showControls && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 p-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl z-10">
          <button onClick={() => setIsAutoRotate(!isAutoRotate)} className={`p-2 rounded-xl transition-colors ${isAutoRotate ? 'text-[#bef264] bg-[#bef264]/10' : 'text-white/40 hover:text-white'}`}>
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/10" />
          <button onClick={() => setZoom(Math.min(zoom + 0.2, 2))} className="p-2 text-white/40 hover:text-white"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={() => setZoom(Math.max(zoom - 0.2, 0.5))} className="p-2 text-white/40 hover:text-white"><ZoomOut className="w-4 h-4" /></button>
          <div className="w-px h-4 bg-white/10" />
          <button onClick={() => setEnv(e => e === 'city' ? 'studio' : e === 'studio' ? 'apartment' : 'city')} className="p-2 text-white/40 hover:text-white"><Sun className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};
