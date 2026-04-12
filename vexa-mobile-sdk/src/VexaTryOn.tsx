import React, { useState } from 'react';
import { View, Image, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { CameraCapture } from './components/CameraCapture';
import { MeasurementForm } from './components/MeasurementForm';
import { useTryOn } from './hooks/useTryOn';
import { useAvatar } from './hooks/useAvatar';
import type { VexaConfig, Measurements } from './types';

type Step = 'photo' | 'measurements' | 'result';

interface VexaTryOnProps {
  apiKey: string;
  apiBaseUrl: string;
  productId: string;
  productImageUrl: string;
  userId: string;
}

export function VexaTryOn({
  apiKey,
  apiBaseUrl,
  productId,
  productImageUrl,
  userId,
}: VexaTryOnProps): React.JSX.Element | null {
  const config: VexaConfig = { apiKey, apiBaseUrl };
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('photo');

  const { status: avatarStatus, generateAvatar } = useAvatar(config);
  const { tryOnResult, status: tryOnStatus, triggerTryOn } = useTryOn(config);

  const handleCapture = (url: string): void => {
    setPhotoUrl(url);
    setStep('measurements');
  };

  const handleMeasurementsSubmit = async (measurements: Measurements): Promise<void> => {
    if (!photoUrl) return;
    setStep('result');
    await generateAvatar({ userId, photoUri: photoUrl, measurements });
    await triggerTryOn({
      userId,
      userPhotoUrl: photoUrl,
      productImageUrl,
      productId,
    });
  };

  if (step === 'photo') {
    return (
      <CameraCapture
        apiBaseUrl={apiBaseUrl}
        apiKey={apiKey}
        onCapture={handleCapture}
      />
    );
  }

  if (step === 'measurements') {
    return (
      <MeasurementForm
        onSubmit={(m) => void handleMeasurementsSubmit(m)}
        isLoading={avatarStatus === 'generating'}
      />
    );
  }

  if (tryOnStatus === 'loading' || avatarStatus === 'generating') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#bef264" />
        <Text style={styles.loadingText}>
          {avatarStatus === 'generating'
            ? 'Creating your avatar...'
            : 'Generating try-on...'}
        </Text>
      </View>
    );
  }

  if (tryOnResult?.resultUrl) {
    return (
      <View style={styles.result}>
        <Image
          source={{ uri: tryOnResult.resultUrl }}
          style={styles.resultImage}
          resizeMode="contain"
          accessibilityLabel="Try-on result"
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: { color: '#fff', fontSize: 16, opacity: 0.7 },
  result: { flex: 1 },
  resultImage: { width: '100%', flex: 1 },
});
