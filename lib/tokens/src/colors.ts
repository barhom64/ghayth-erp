/**
 * ألوان نظام غيث — مصدر الحقيقة للتصميم
 * مستخرجة من index.css للويب
 */

/** لون العلامة التجارية — ذهبي/برتقالي hsl(35,91%,44%) */
export const brand = {
  50:  '#FEF6E8',
  100: '#FDEACE',
  200: '#FBD49C',
  300: '#F9BB65',
  400: '#F7A332',
  500: '#D6810A', // اللون الأساسي hsl(35,91%,44%)
  600: '#B56B08',
  700: '#8C5206',
  800: '#633A04',
  900: '#3A2102',
} as const;

/** لون البحري/الداكن — hsl(222,47%,11%) = #0F1729 */
export const navy = {
  50:  '#EEF1F8',
  100: '#CDD5E9',
  200: '#9BACD2',
  300: '#6982BB',
  400: '#3759A4',
  500: '#1E3A8A',
  600: '#1A306F',
  700: '#152554',
  800: '#101B3A',
  900: '#0F1729', // اللون الأساسي hsl(222,47%,11%)
} as const;

/** محايد / رمادي فاتح */
export const neutral = {
  50:  '#F8FAFC', // hsl(210,40%,98%)
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
} as const;

/** ألوان دلالية */
export const semantic = {
  success: {
    default: '#22C55E',
    surface: '#F0FDF4',
    foreground: '#15803D',
  },
  warning: {
    default: '#F59E0B',
    surface: '#FFFBEB',
    foreground: '#92400E',
  },
  error: {
    default: '#EF4444',
    surface: '#FEF2F2',
    foreground: '#B91C1C',
  },
  info: {
    default: '#3B82F6',
    surface: '#EFF6FF',
    foreground: '#1D4ED8',
  },
} as const;

/** ألوان الثيم الفاتح */
export const lightTheme = {
  bg:           '#F7F9FC',
  surface:      '#FFFFFF',
  card:         '#FFFFFF',
  border:       '#E2E8F0',
  text:         '#0F1729',
  textMuted:    '#64748B',
  textFaint:    '#94A3B8',
  textInverse:  '#F8FAFC',
  primary:      '#0F1729',
  brand:        '#D6810A',
  onPrimary:    '#F8FAFC',
  inputBg:      '#FFFFFF',
  inputBorder:  '#E2E8F0',
  surfaceAlt:   '#F1F5F9',
  danger:       '#EF4444',
  dangerSurface:'#FEF2F2',
  radius:       8,
} as const;

/** ألوان الثيم الداكن */
export const darkTheme = {
  bg:           '#0F1729',
  surface:      '#1A2442',
  card:         '#1A2442',
  border:       '#2D3F5C',
  text:         '#F8FAFC',
  textMuted:    '#94A3B8',
  textFaint:    '#64748B',
  textInverse:  '#0F1729',
  primary:      '#F8FAFC',
  brand:        '#D6810A',
  onPrimary:    '#0F1729',
  inputBg:      '#1A2442',
  inputBorder:  '#2D3F5C',
  surfaceAlt:   '#0F1729',
  danger:       '#EF4444',
  dangerSurface:'#3B1010',
  radius:       8,
} as const;

export type ThemeColors = typeof lightTheme;
