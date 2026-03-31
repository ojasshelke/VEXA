"use client";

/**
 * /onboarding — One-time user avatar setup page.
 * Step 1: FaceCapture → Step 2: MeasurementForm → Step 3: Generation progress
 *
 * After generation, redirects to /studio with avatar ready.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaceCapture } from '@/components/FaceCapture';
import { MeasurementForm } from '@/components/MeasurementForm';
import { useAvatar } from '@/hooks/useAvatar';
import type { BodyMeasurements } from '@/types';
import {
  Camera, Ruler, Sparkles, CheckCircle2, ArrowRight, ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

type OnboardingStep = 'photo' | 'measurements' | 'generating' | 'done';

const DEMO_USER_ID = 'demo_user_001';
const DEMO_API_KEY = 'vx_dev_test_key_local';

const STEPS: { id: OnboardingStep; label: string; icon: React.ElementType }[] = [
  { id: 'photo', label: 'Photo', icon: Camera },
  { id: 'measurements', label: 'Measurements', icon: Ruler },
  { id: 'generating', label: 'Avatar', icon: Sparkles },
];

export default function OnboardingPage() {
  const [step, setStep] = useState<OnboardingStep>('photo');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [measurements, setMeasurements] = useState<BodyMeasurements | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId] = useState(DEMO_USER_ID);

  // Start polling only when generating
  const { status: avatarStatus, progress, glbUrl } = useAvatar(
    step === 'generating' ? userId : null,
    { apiKey: DEMO_API_KEY, enabled: step === 'generating' }
  );

  // Auto-advance to done when ready
  React.useEffect(() => {
    if (avatarStatus === 'ready' && step === 'generating') {
      setTimeout(() => setStep('done'), 800);
    }
  }, [avatarStatus, step]);

  const handlePhotoCapture = useCallback((file: File) => {
    setCapturedFile(file);
  }, []);

  const handleMeasurementsSubmit = useCallback(async (m: BodyMeasurements) => {
    if (!capturedFile) return;
    setMeasurements(m);
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Convert photo to base64
      const base64 = await fileToBase64(capturedFile);

      const res = await fetch('/api/avatar/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vexa-key': DEMO_API_KEY,
        },
        body: JSON.stringify({
          userId,
          measurements: m,
          photoBase64: base64,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to queue avatar generation');
      }

      const data = (await res.json()) as { job_id: string };
      setJobId(data.job_id);
      setStep('generating');
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [capturedFile, userId]);

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Background glow */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#bef264]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-xl space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#bef264]/10 border border-[#bef264]/20 mb-4">
            <Sparkles className="w-4 h-4 text-[#bef264]" />
            <span className="text-[#bef264] text-sm font-medium">One-Time Setup</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Build Your 3D Avatar</h1>
          <p className="text-white/50 mt-2">
            Takes under 2 minutes. You'll try on clothes as yourself — forever.
          </p>
        </div>

        {/* Step Indicator */}
        {step !== 'done' && (
          <div className="flex items-center gap-2 justify-center">
            {STEPS.map((s, i) => {
              const isDone = i < currentStepIndex;
              const isCurrent = (s.id as string) === (step as string) || (step === 'done' && i === STEPS.length - 1);
              return (
                <React.Fragment key={s.id}>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                    isCurrent
                      ? 'bg-[#bef264] text-black'
                      : isDone
                      ? 'bg-[#bef264]/20 text-[#bef264]'
                      : 'bg-white/5 text-white/30'
                  }`}>
                    {isDone ? <CheckCircle2 className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                    {s.label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-px w-6 transition-colors duration-300 ${isDone ? 'bg-[#bef264]/40' : 'bg-white/10'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Content Panel */}
        <div className="glass-panel rounded-3xl border border-white/10 p-6 sm:p-8">
          <AnimatePresence mode="wait">
            {/* Step 1: Photo */}
            {step === 'photo' && (
              <motion.div
                key="photo"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <FaceCapture onCapture={handlePhotoCapture} onClear={() => setCapturedFile(null)} />
                <button
                  id="onboarding-photo-next"
                  disabled={!capturedFile}
                  onClick={() => setStep('measurements')}
                  className="w-full py-4 rounded-2xl font-semibold bg-[#bef264] text-black hover:bg-[#a3e635] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* Step 2: Measurements */}
            {step === 'measurements' && (
              <motion.div
                key="measurements"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <button
                  onClick={() => setStep('photo')}
                  className="flex items-center gap-1 text-white/40 hover:text-white text-sm transition-colors mb-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <MeasurementForm onSubmit={handleMeasurementsSubmit} isLoading={isSubmitting} />
                {submitError && (
                  <p className="text-red-400 text-sm text-center">{submitError}</p>
                )}
              </motion.div>
            )}

            {/* Step 3: Generating */}
            {step === 'generating' && (
              <motion.div
                key="generating"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-6 py-8"
              >
                {/* Progress Ring */}
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <motion.circle
                      cx="60" cy="60" r="50"
                      fill="none"
                      stroke="#bef264"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 50}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 50 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 50 * (1 - progress / 100) }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Sparkles className="w-6 h-6 text-[#bef264] animate-pulse" />
                    <span className="text-white font-bold text-lg mt-1">{progress}%</span>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-white font-semibold text-lg">Building Your Avatar</p>
                  <p className="text-white/50 text-sm mt-1">
                    {avatarStatus === 'queued' && 'Queued for processing…'}
                    {avatarStatus === 'processing' && 'Analyzing measurements + face texture…'}
                    {avatarStatus === 'ready' && 'Avatar ready!'}
                  </p>
                </div>

                {/* Pipeline Steps */}
                <div className="w-full space-y-2">
                  {[
                    { label: 'Face landmark extraction', threshold: 20 },
                    { label: 'Beta parameter regression', threshold: 50 },
                    { label: 'Archetype blending', threshold: 75 },
                    { label: 'GLB export + caching', threshold: 95 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                        progress >= item.threshold
                          ? 'border-[#bef264] bg-[#bef264]'
                          : 'border-white/20'
                      }`}>
                        {progress >= item.threshold && (
                          <CheckCircle2 className="w-3 h-3 text-black" />
                        )}
                      </div>
                      <span className={`text-sm transition-colors duration-300 ${
                        progress >= item.threshold ? 'text-white' : 'text-white/30'
                      }`}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Done */}
            {step === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-6 py-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', bounce: 0.5 }}
                  className="w-20 h-20 rounded-full bg-[#bef264] flex items-center justify-center shadow-[0_0_60px_rgba(190,242,100,0.5)]"
                >
                  <CheckCircle2 className="w-10 h-10 text-black" />
                </motion.div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Avatar Ready!</h2>
                  <p className="text-white/50 mt-2">Your 3D avatar has been generated and cached.</p>
                </div>
                <Link href="/studio" className="w-full">
                  <button
                    id="onboarding-done-cta"
                    className="w-full py-4 rounded-2xl font-semibold bg-[#bef264] text-black hover:bg-[#a3e635] transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(190,242,100,0.4)]"
                  >
                    <Sparkles className="w-4 h-4" />
                    Go to Studio
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
