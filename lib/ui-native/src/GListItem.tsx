import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './useTheme';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface GListItemProps {
  title: string;
  subtitle?: string;
  leading?: IoniconName | ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  showSeparator?: boolean;
}

export function GListItem({ title, subtitle, leading, trailing, onPress, showSeparator = true }: GListItemProps) {
  const { colors } = useTheme();

  const inner = (
    <View style={[styles.row, showSeparator && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      {onPress ? <Ionicons name="chevron-back" size={16} color={colors.textFaint} style={{ marginLeft: 2 }} /> : <View style={{ width: 18 }} />}
      {trailing ? <View style={{ marginLeft: 8 }}>{trailing}</View> : null}
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {leading ? (
        typeof leading === 'string' ? (
          <View style={[styles.leadingIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name={leading as IoniconName} size={18} color={colors.brand} />
          </View>
        ) : leading
      ) : null}
    </View>
  );

  if (!onPress) return <View style={{ backgroundColor: colors.surface }}>{inner}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  body: { flex: 1, marginHorizontal: 10 },
  title: { fontSize: 15, fontWeight: '500', textAlign: 'right' },
  subtitle: { fontSize: 13, marginTop: 2, textAlign: 'right' },
  leadingIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
