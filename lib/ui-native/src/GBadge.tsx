import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from './useTheme';

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info';
type Size = 'sm' | 'md';

interface GBadgeProps {
  label: string;
  tone?: Tone;
  size?: Size;
}

export function GBadge({ label, tone = 'default', size = 'md' }: GBadgeProps) {
  const { colors } = useTheme();

  const toneMap: Record<Tone, { bg: string; text: string }> = {
    default: { bg: colors.surfaceAlt, text: colors.textMuted },
    success: { bg: '#F0FDF4', text: '#15803D' },
    warning: { bg: '#FFFBEB', text: '#92400E' },
    danger:  { bg: '#FEF2F2', text: '#B91C1C' },
    info:    { bg: '#EFF6FF', text: '#1D4ED8' },
  };

  const { bg, text } = toneMap[tone];
  const pad = size === 'sm' ? { paddingHorizontal: 6, paddingVertical: 2 } : { paddingHorizontal: 10, paddingVertical: 4 };
  const fs = size === 'sm' ? 11 : 12;

  return (
    <View style={[{ borderRadius: 999, ...pad }, { backgroundColor: bg }]}>
      <Text style={{ fontSize: fs, fontWeight: '600', color: text, textAlign: 'right' }}>{label}</Text>
    </View>
  );
}
