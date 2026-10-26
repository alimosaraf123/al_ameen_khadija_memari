import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import JsBarcode from 'jsbarcode';

export const BarcodeFormat = {
  AZTEC: 'AZTEC',
  CODE128: 'CODE_128',
  PDF417: 'PDF_417',
  QR: 'QR_CODE',
  EAN13: 'EAN_13',
  UPCA: 'UPC_A',
} as const;

export type BarcodeFormatValue = (typeof BarcodeFormat)[keyof typeof BarcodeFormat];

interface BarcodeDisplayProps {
  value: string;
  format?: BarcodeFormatValue | string;
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

  // On Web: generate SVG data URL using JsBarcode (Code128 format)
  const webSvgUri = useMemo(() => {
    if (!cleanValue || typeof document === 'undefined') {
      return '';
    }
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, cleanValue, {
        format: 'CODE128',
        width: 2,
        height: Math.max(40, height - (showText ? 24 : 6)),
        displayValue: showText,
        fontSize: 15,
        font: 'Arial',
        fontOptions: 'bold',
        textMargin: 4,
        margin: 6,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.outerHTML);
    } catch (e) {
      console.warn('Barcode SVG generation error:', e);
      return '';
    }
  }, [cleanValue, height, showText]);

  if (!cleanValue) {
    return (
      <View style={[styles.fallback, { width, height }, style]}>
        <Text style={styles.fallbackText}>No barcode data</Text>
      </View>
    );
  }

  if (webSvgUri) {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={{ uri: webSvgUri }}
          style={{ width, height }}
          resizeMode="contain"
          accessibilityLabel={`Barcode ${cleanValue}`}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fallback, { width, height }, style]}>
      <Text style={styles.fallbackText}>{cleanValue}</Text>
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
