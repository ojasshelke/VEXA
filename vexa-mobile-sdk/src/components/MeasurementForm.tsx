import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type { Measurements } from '../types';

interface FieldMeta {
  key: keyof Measurements;
  label: string;
  placeholder: string;
}

interface MeasurementFormProps {
  onSubmit: (measurements: Measurements) => void;
  isLoading?: boolean;
}

const FIELDS: FieldMeta[] = [
  { key: 'heightCm', label: 'Height (cm)', placeholder: '170' },
  { key: 'chestCm', label: 'Chest (cm)', placeholder: '95' },
  { key: 'waistCm', label: 'Waist (cm)', placeholder: '80' },
  { key: 'hipsCm', label: 'Hips (cm)', placeholder: '98' },
  { key: 'inseamCm', label: 'Inseam (cm)', placeholder: '78' },
  { key: 'shoulderWidthCm', label: 'Shoulder Width (cm)', placeholder: '40' },
];

const REQUIRED_KEYS: ReadonlyArray<keyof Measurements> = [
  'heightCm',
  'chestCm',
  'waistCm',
  'hipsCm',
  'inseamCm',
  'shoulderWidthCm',
];

export function MeasurementForm({
  onSubmit,
  isLoading = false,
}: MeasurementFormProps): React.JSX.Element {
  const [measurements, setMeasurements] = useState<Partial<Measurements>>({});

  const handleChange = (key: keyof Measurements, val: string): void => {
    const num = parseFloat(val);
    setMeasurements((prev) => ({
      ...prev,
      [key]: Number.isNaN(num) ? undefined : num,
    }));
  };

  const handleSubmit = (): void => {
    const isComplete = REQUIRED_KEYS.every((k) => measurements[k] != null);
    if (!isComplete) return;
    onSubmit(measurements as Measurements);
  };

  return (
    <ScrollView style={styles.container}>
      {FIELDS.map(({ key, label, placeholder }) => (
        <View key={key} style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.3)"
            keyboardType="numeric"
            onChangeText={(val) => handleChange(key, val)}
          />
        </View>
      ))}
      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {isLoading ? 'Generating...' : 'Generate My Avatar'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  field: { marginBottom: 16 },
  label: { color: '#fff', fontSize: 14, marginBottom: 6, opacity: 0.7 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  button: {
    backgroundColor: '#bef264',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
