import React, { useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Option = { value: string; label: string };

export function Select({
  label,
  value,
  options,
  onChange,
  searchable = false,
  style,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  searchable?: boolean;
  style?: any;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState({ x: 16, y: 60, width: 200, maxHeight: 300 });
  const buttonRef = useRef<any>(null);
  const visibleOptions = searchable && query
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const handleOpen = (event: any) => {
    const w = Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerHeight : 800;

    const calculate = (bx: number, by: number, bw: number, bh: number) => {
      const dropdownW = Math.min(260, Math.max(160, Math.min(Math.max(bw, 160), w - 16)));
      let left = bx;
      if (left + dropdownW > w - 12) {
        left = Math.max(8, w - dropdownW - 12);
      }
      if (left < 8) left = 8;

      const estimatedH = Math.min(300, (searchable ? 100 : 40) + Math.max(visibleOptions.length, 1) * 40);
      const spaceBelow = h - (by + bh) - 12;
      const spaceAbove = by - 12;

      let top: number;
      let maxHeight: number;

      if (spaceBelow >= Math.min(estimatedH, 160) || spaceBelow >= spaceAbove) {
        top = by + bh + 4;
        maxHeight = Math.max(120, Math.min(300, spaceBelow - 8));
      } else {
        const actualH = Math.min(estimatedH, Math.max(120, spaceAbove - 8));
        top = Math.max(8, by - actualH - 4);
        maxHeight = Math.max(120, spaceAbove - 8);
      }

      setAnchor({ x: Math.round(left), y: Math.round(top), width: dropdownW, maxHeight: Math.round(maxHeight) });
      setQuery('');
      setOpen(true);
    };

    if (Platform.OS === 'web') {
      const el = (buttonRef.current as any) || (event?.currentTarget as any);
      if (el && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        calculate(rect.left, rect.top, rect.width, rect.height);
        return;
      }
    }

    if (buttonRef.current?.measureInWindow) {
      buttonRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        calculate(x || 16, y || 60, width || 160, height || 36);
      });
      return;
    }

    const n = event?.nativeEvent || {};
    const cy = Number(n.clientY ?? n.pageY) || 60;
    const cx = Number(n.clientX ?? n.pageX) || 16;
    calculate(cx, cy, 160, 36);
  };

  return (
    <>
      <TouchableOpacity
        ref={buttonRef}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${options.find((o) => o.value === value)?.label || value}`}
        onPress={handleOpen}
        style={[s.select, style]}
      >
        <Text style={[s.selectText, !value && s.selectPlaceholder]} numberOfLines={1}>
          {options.find((o) => o.value === value)?.label || label} ▼
        </Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={[s.overlay, Platform.OS === 'web' && s.webSelectOverlay]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close dropdown"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            onPress={() => setOpen(false)}
          />
          <View
            style={[
              s.selectPanel,
              Platform.OS === 'web' && {
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                width: anchor.width,
                maxHeight: anchor.maxHeight,
                borderWidth: 1,
                borderColor: '#cbd5e1',
              },
            ]}
          >
            <Text style={s.panelTitle}>{label}</Text>
            {searchable && (
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder={label ? `Search ${label}...` : 'Type to search...'}
                style={[s.search, { width: '100%', marginBottom: 8 }]}
              />
            )}
            <ScrollView keyboardShouldPersistTaps="handled">
              {visibleOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: value === option.value }}
                  style={[s.option, value === option.value && s.selected]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[s.optionText, value === option.value && s.selectedText]}>
                    {option.label}
                    {value === option.value ? ' ✓' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  select: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  selectPlaceholder: {
    color: '#94a3b8',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webSelectOverlay: {
    backgroundColor: 'transparent',
  },
  selectPanel: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    minWidth: 160,
    maxWidth: 260,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  search: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12.5,
  },
  option: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  optionText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  selected: {
    backgroundColor: '#ecfdf5',
  },
  selectedText: {
    color: '#059669',
    fontWeight: '800',
  },
});
