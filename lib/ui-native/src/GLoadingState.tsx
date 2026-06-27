import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './useTheme';

interface GLoadingStateProps {
  text?: string;
}

export function GLoadingState({ text }: GLoadingStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brand} />
      {text ? <Text style={[styles.text, { color: colors.textMuted }]}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  text: { fontSize: 14, textAlign: 'center' },
});
