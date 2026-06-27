import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './useTheme';
import { GButton } from './GButton';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface GEmptyStateProps {
  icon?: IoniconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: import('react-native').ViewStyle;
}

export function GEmptyState({ icon = 'file-tray-outline', title, description, actionLabel, onAction, style }: GEmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <Ionicons name={icon} size={56} color={colors.textFaint} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {description ? <Text style={[styles.desc, { color: colors.textMuted }]}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <GButton title={actionLabel} onPress={onAction} variant="secondary" style={{ marginTop: 16 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  desc: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
