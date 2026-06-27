import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, spacing, fontSizes, fontWeights, lineHeights, fontFamilies, radius, shadows } from '@workspace/tokens';

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkTheme : lightTheme;
  return { colors, spacing, typography: { fontSizes, fontWeights, lineHeights, fontFamilies }, radius, shadows, isDark };
}

export type Theme = ReturnType<typeof useTheme>;
