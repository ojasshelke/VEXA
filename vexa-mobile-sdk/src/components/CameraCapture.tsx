import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface UploadResponse {
  url?: string;
  error?: string;
}

interface CameraCaptureProps {
  apiBaseUrl: string;
  apiKey: string;
  onCapture: (photoUrl: string) => void;
}

export function CameraCapture({
  apiBaseUrl,
  apiKey,
  onCapture,
}: CameraCaptureProps): React.JSX.Element {
  const [isUploading, setIsUploading] = useState(false);

  const pickImage = async (): Promise<void> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed for try-on.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [3, 4],
    });

    if (result.canceled || !result.assets[0]) return;

    const { uri } = result.assets[0];
    setIsUploading(true);

    try {
      const formData = new FormData();
      // React Native FormData accepts this shape; cast via unknown to avoid any
      formData.append('file', {
        uri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as unknown as Blob);
      formData.append('folder', 'photos');

      const uploadRes = await fetch(`${apiBaseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'x-vexa-key': apiKey },
        body: formData,
      });

      const raw: unknown = await uploadRes.json();
      if (raw === null || typeof raw !== 'object') {
        throw new Error('Invalid upload response');
      }
      const data = raw as UploadResponse;

      if (!uploadRes.ok) {
        throw new Error(data.error ?? 'Upload failed');
      }

      const uploadedUrl = data.url;
      if (!uploadedUrl) {
        throw new Error('No URL returned from upload');
      }

      onCapture(uploadedUrl);
    } catch (err: unknown) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isUploading && styles.disabled]}
        onPress={() => void pickImage()}
        disabled={isUploading}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {isUploading ? 'Uploading...' : 'Take Photo'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: 16 },
  button: {
    backgroundColor: '#bef264',
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
