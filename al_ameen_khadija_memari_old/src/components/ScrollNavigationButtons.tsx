import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ScrollNavigationButtonsProps {
  scrollRef?: React.RefObject<any>;
  bottomOffset?: number;
  rightOffset?: number;
}

export function scrollToTop(scrollRef?: React.RefObject<any>) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // 1. Scroll browser window & document
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
    if (document.documentElement) {
      try {
        document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      } catch {
        document.documentElement.scrollTop = 0;
      }
    }
    if (document.body) {
      try {
        document.body.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      } catch {
        document.body.scrollTop = 0;
      }
    }

    // 2. If scrollRef is an overflowing container
    try {
      const node =
        scrollRef?.current?.getScrollableNode?.() ||
        (typeof scrollRef?.current?.scrollTop === 'number' ? scrollRef.current : null);
      if (node && node.scrollHeight > node.clientHeight + 10) {
        if (typeof node.scrollTo === 'function') {
          node.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        } else {
          node.scrollTop = 0;
        }
      }
    } catch {}

    // 3. React Native Web ScrollView method fallback
    try {
      if (typeof scrollRef?.current?.scrollTo === 'function') {
        scrollRef.current.scrollTo({ y: 0, x: 0, animated: true });
      }
    } catch {}
  } else {
    // Mobile (Android / iOS)
    try {
      if (scrollRef?.current) {
        if (typeof scrollRef.current.scrollTo === 'function') {
          scrollRef.current.scrollTo({ y: 0, x: 0, animated: true });
        } else if (typeof scrollRef.current.getScrollResponder === 'function') {
          scrollRef.current.getScrollResponder()?.scrollTo?.({ y: 0, x: 0, animated: true });
        }
      }
    } catch (e) {
      console.error('scrollToTop mobile error', e);
    }
  }
}

export function scrollToBottom(scrollRef?: React.RefObject<any>) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // 1. Calculate max document height
    const maxY = Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0,
      document.documentElement?.offsetHeight || 0,
      document.body?.offsetHeight || 0,
      100000
    );

    // 2. Scroll browser window & document
    try {
      window.scrollTo({ top: maxY, left: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, maxY);
    }
    if (document.documentElement) {
      try {
        document.documentElement.scrollTo({ top: maxY, left: 0, behavior: 'smooth' });
      } catch {
        document.documentElement.scrollTop = maxY;
      }
    }
    if (document.body) {
      try {
        document.body.scrollTo({ top: maxY, left: 0, behavior: 'smooth' });
      } catch {
        document.body.scrollTop = maxY;
      }
    }

    // 3. If scrollRef is an overflowing container
    try {
      const node =
        scrollRef?.current?.getScrollableNode?.() ||
        (typeof scrollRef?.current?.scrollTop === 'number' ? scrollRef.current : null);
      if (node && node.scrollHeight > node.clientHeight + 10) {
        const nodeMax = Math.max(node.scrollHeight, 100000);
        if (typeof node.scrollTo === 'function') {
          node.scrollTo({ top: nodeMax, left: 0, behavior: 'smooth' });
        } else {
          node.scrollTop = nodeMax;
        }
      }
    } catch {}

    // 4. React Native Web ScrollView method fallback (passing y AND top)
    try {
      if (typeof scrollRef?.current?.scrollTo === 'function') {
        scrollRef.current.scrollTo({ y: maxY, top: maxY, x: 0, animated: true });
      }
    } catch {}
  } else {
    // Mobile (Android / iOS)
    try {
      if (scrollRef?.current) {
        if (typeof scrollRef.current.scrollToEnd === 'function') {
          scrollRef.current.scrollToEnd({ animated: true });
        } else if (typeof scrollRef.current.scrollTo === 'function') {
          scrollRef.current.scrollTo({ y: 9999999, x: 0, animated: true });
        } else if (typeof scrollRef.current.getScrollResponder === 'function') {
          scrollRef.current.getScrollResponder()?.scrollToEnd?.({ animated: true });
        }
      }
    } catch (e) {
      console.error('scrollToBottom mobile error', e);
    }
  }
}

export default function ScrollNavigationButtons({
  scrollRef,
  bottomOffset = 24,
  rightOffset = 20,
}: ScrollNavigationButtonsProps) {
  const isWeb = Platform.OS === 'web';

  const webPropsTop = isWeb
    ? ({ title: 'Scroll to Top (পৃষ্ঠার শীর্ষে যান)', accessibilityLabel: 'Scroll to Top' } as any)
    : { accessibilityLabel: 'Scroll to Top' };

  const webPropsBottom = isWeb
    ? ({ title: 'Scroll to Bottom (পৃষ্ঠার নিচে যান)', accessibilityLabel: 'Scroll to Bottom' } as any)
    : { accessibilityLabel: 'Scroll to Bottom' };

  return (
    <View
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          right: rightOffset,
          position: isWeb ? ('fixed' as any) : 'absolute',
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Scroll to Top Button */}
      <TouchableOpacity
        style={[styles.circleButton, styles.topButton]}
        onPress={() => scrollToTop(scrollRef)}
        activeOpacity={0.75}
        accessibilityRole="button"
        {...webPropsTop}
      >
        <Text style={styles.arrowText}>↑</Text>
      </TouchableOpacity>

      {/* Scroll to Bottom Button */}
      <TouchableOpacity
        style={[styles.circleButton, styles.bottomButton]}
        onPress={() => scrollToBottom(scrollRef)}
        activeOpacity={0.75}
        accessibilityRole="button"
        {...webPropsBottom}
      >
        <Text style={styles.arrowText}>↓</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 99999,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    elevation: 10,
  },
  circleButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#38a8e8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 8,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'transform 0.15s ease, background-color 0.15s ease',
        } as any)
      : {}),
  },
  topButton: {
    backgroundColor: '#38a8e8',
  },
  bottomButton: {
    backgroundColor: '#38a8e8',
  },
  arrowText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 25,
    textAlign: 'center',
    marginTop: Platform.OS === 'android' ? -2 : 0,
  },
});
