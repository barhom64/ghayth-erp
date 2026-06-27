/**
 * wrapper حول useTheme — يعيد colors مباشرة للتوافق مع الكود الحالي
 */
import { useTheme } from '@workspace/ui-native';

export function useColors() {
  const { colors } = useTheme();
  return colors;
}
