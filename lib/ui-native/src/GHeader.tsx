import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './useTheme';

interface GHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: ReactNode;
}

export function GHeader({ title, onBack, rightAction }: GHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      <View style={[styles.side, { alignItems: 'flex-start' }]}>
        {rightAction ?? <View style={{ width: 40 }} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 56, borderBottomWidth: 1,
  },
  side: { width: 48, alignItems: 'flex-end' },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
