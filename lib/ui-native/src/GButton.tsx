import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from './useTheme';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface GButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: IoniconName;
  style?: ViewStyle;
}

export function GButton({ title, onPress, variant = 'primary', size = 'md', loading, disabled, icon, style }: GButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<Variant, string> = {
    primary:   colors.primary,
    secondary: colors.surfaceAlt,
    ghost:     'transparent',
    danger:    colors.danger,
  };
  const fg: Record<Variant, string> = {
    primary:   colors.onPrimary,
    secondary: colors.text,
    ghost:     colors.primary,
    danger:    '#FFFFFF',
  };
  const heights: Record<Size, number> = { sm: 36, md: 44, lg: 52 };
  const textSizes: Record<Size, number> = { sm: 13, md: 15, lg: 16 };
  const hPad: Record<Size, number> = { sm: 12, md: 16, lg: 20 };

  const handle = () => {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress();
  };

  return (
    <Pressable
      onPress={handle}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg[variant],
          borderRadius: colors.radius,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: colors.border,
          height: heights[size],
          paddingHorizontal: hPad[size],
          opacity: isDisabled ? 0.5 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg[variant]} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={textSizes[size] + 2} color={fg[variant]} style={{ marginLeft: 4 }} /> : null}
          <Text style={{ fontSize: textSizes[size], fontWeight: '600', color: fg[variant], textAlign: 'center' }}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
