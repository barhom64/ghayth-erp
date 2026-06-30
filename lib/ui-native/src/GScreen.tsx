import React, { type ReactNode } from 'react';
import { RefreshControl, ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './useTheme';

interface GScreenProps {
  children: ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
}

export function GScreen({ children, scrollable = false, style, contentStyle, refreshControl }: GScreenProps) {
  const { colors } = useTheme();
  const bg = { backgroundColor: colors.bg, flex: 1 };

  if (scrollable) {
    return (
      <SafeAreaView style={[bg, style]} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[{ paddingBottom: 32 }, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[bg, style]} edges={['top', 'left', 'right']}>
      <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}
