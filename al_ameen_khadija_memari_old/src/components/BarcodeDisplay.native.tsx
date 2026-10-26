import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarcodeCreatorView, BarcodeFormat } from 'react-native-barcode-creator';

export { BarcodeFormat };

interface BarcodeDisplayProps {
  value: string;
  format?: any;
  width?: number;
  height?: number;
  style?: any;
  showText?: boolean;
}

export default function BarcodeDisplay({
  value,
  format = BarcodeFormat.CODE128,
  width = 240,
  height = 80,
  style,
  showText = true,
}: BarcodeDisplayProps) {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) {
    return (
      <View style={[styles.fallback, { width, height }, style]}>
        <Text style={styles.fallbackText}>No barcode data</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <BarcodeCreatorView
        value={cleanValue}
        format={format}
        style={{ width, height: Math.max(40, height - (showText ? 24 : 0)) }}
        background="#FFFFFF"
        foregroundColor="#000000"
      />
      {showText && <Text style={styles.label}>{cleanValue}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
    letterSpacing: 1.5,
  },
  fallback: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  fallbackText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
});
