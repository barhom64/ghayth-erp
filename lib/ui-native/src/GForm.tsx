import React, { type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTheme } from './useTheme';
import { GButton } from './GButton';

interface GFormProps {
  children: ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  loading?: boolean;
  error?: string;
}

export function GForm({ children, onSubmit, submitLabel = 'حفظ', loading, error }: GFormProps) {
  const { colors } = useTheme();

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
      {error ? (
        <View style={{ backgroundColor: colors.dangerSurface, borderRadius: colors.radius, padding: 12, marginBottom: 12 }}>
          <Text style={{ color: colors.danger, fontSize: 14, textAlign: 'right' }}>{error}</Text>
        </View>
      ) : null}
      <GButton title={submitLabel} onPress={onSubmit} loading={loading} size="lg" style={{ marginTop: 8 }} />
    </ScrollView>
  );
}
