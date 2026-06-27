import React from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import { useTheme } from './useTheme';

type Variant = 'body' | 'caption' | 'label' | 'heading' | 'subheading' | 'display';
type Align = 'right' | 'left' | 'center' | 'auto';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

interface GTextProps {
  variant?: Variant;
  color?: string;
  align?: Align;
  weight?: Weight;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  children?: React.ReactNode;
}

const variantStyles: Record<Variant, { fontSize: number; lineHeight: number; fontWeight: TextStyle['fontWeight'] }> = {
  display:    { fontSize: 36, lineHeight: 48, fontWeight: '700' },
  heading:    { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  subheading: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  label:      { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  body:       { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  caption:    { fontSize: 12, lineHeight: 18, fontWeight: '400' },
};

export function GText({ variant = 'body', color, align = 'right', weight, style, numberOfLines, children }: GTextProps) {
  const { colors } = useTheme();
  const v = variantStyles[variant];
  const fw = weight
    ? ({ regular: '400', medium: '500', semibold: '600', bold: '700' }[weight] as TextStyle['fontWeight'])
    : v.fontWeight;

  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontSize: v.fontSize, lineHeight: v.lineHeight, fontWeight: fw, textAlign: align, writingDirection: 'rtl', color: color ?? colors.text },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
