import React from 'react';
import { Text, TextInput, View, type StyleProp, type ViewStyle, type KeyboardTypeOptions, type TextStyle } from 'react-native';
import { useTheme } from './useTheme';

interface GInputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  style?: StyleProp<ViewStyle>;
}

export function GInput({
  label, value, onChangeText, placeholder, error, hint,
  secureTextEntry, keyboardType, multiline, editable = true,
  autoCapitalize = 'none', style,
}: GInputProps) {
  const { colors } = useTheme();

  const inputStyle: TextStyle = {
    backgroundColor: editable ? colors.inputBg : colors.surfaceAlt,
    borderColor: error ? colors.danger : colors.inputBorder,
    borderWidth: 1,
    borderRadius: colors.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    minHeight: multiline ? 96 : 48,
    textAlignVertical: multiline ? 'top' : 'center',
  };

  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {label ? (
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textMuted, marginBottom: 6, textAlign: 'right' }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        autoCapitalize={autoCapitalize}
        style={inputStyle}
      />
      {error ? (
        <Text style={{ fontSize: 12, color: colors.danger, marginTop: 4, textAlign: 'right' }}>{error}</Text>
      ) : null}
      {hint && !error ? (
        <Text style={{ fontSize: 12, color: colors.textFaint, marginTop: 4, textAlign: 'right' }}>{hint}</Text>
      ) : null}
    </View>
  );
}
