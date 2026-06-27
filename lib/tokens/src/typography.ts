/**
 * الطباعة — IBM Plex Sans Arabic أولاً
 */
export const fontFamilies = {
  sans:  ['IBMPlexSansArabic_400Regular', 'System', 'sans-serif'] as string[],
  mono:  ['Courier', 'monospace'] as string[],
} as const;

export const fontSizes = {
  xs:   12,
  sm:   14,
  base: 16,
  lg:   18,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const fontWeights = {
  regular:   '400' as const,
  medium:    '500' as const,
  semibold:  '600' as const,
  bold:      '700' as const,
} as const;

export const lineHeights = {
  xs:   18,
  sm:   20,
  base: 24,
  lg:   28,
  xl:   30,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

export type FontSizeKey = keyof typeof fontSizes;
export type FontWeightKey = keyof typeof fontWeights;
