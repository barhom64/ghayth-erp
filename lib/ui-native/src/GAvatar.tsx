import React from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from './useTheme';

type AvatarSize = 'sm' | 'md' | 'lg';

interface GAvatarProps {
  name?: string;
  uri?: string;
  size?: AvatarSize;
}

const sizes: Record<AvatarSize, number> = { sm: 32, md: 44, lg: 64 };
const fontSizes: Record<AvatarSize, number> = { sm: 12, md: 17, lg: 24 };

export function GAvatar({ name, uri, size = 'md' }: GAvatarProps) {
  const { colors } = useTheme();
  const dim = sizes[size];
  const fs = fontSizes[size];
  const initial = name ? name.charAt(0) : '؟';

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: dim, height: dim, borderRadius: dim / 2, backgroundColor: colors.surfaceAlt }}
      />
    );
  }

  return (
    <View style={{
      width: dim, height: dim, borderRadius: dim / 2,
      backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: fs, fontWeight: '700', color: '#FFFFFF' }}>{initial}</Text>
    </View>
  );
}
