import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './useTheme';

export interface GSelectOption {
  value: string;
  label: string;
}

interface GSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: GSelectOption[];
  placeholder?: string;
  error?: string;
}

export function GSelect({ label, value, onChange, options, placeholder = 'اختر...', error }: GSelectProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <View style={{ marginBottom: 12 }}>
      {label ? (
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textMuted, marginBottom: 6, textAlign: 'right' }}>
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: colors.inputBg, borderColor: error ? colors.danger : colors.inputBorder,
          borderWidth: 1, borderRadius: colors.radius, paddingHorizontal: 12, height: 48,
        }}
      >
        <Ionicons name="chevron-back" size={16} color={colors.textFaint} />
        <Text style={{ fontSize: 15, color: selected ? colors.text : colors.textFaint, textAlign: 'right', flex: 1 }}>
          {selected ? selected.label : placeholder}
        </Text>
      </Pressable>
      {error ? (
        <Text style={{ fontSize: 12, color: colors.danger, marginTop: 4, textAlign: 'right' }}>{error}</Text>
      ) : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setOpen(false)} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable onPress={() => setOpen(false)}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
            {label ? <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{label}</Text> : null}
            <View style={{ width: 22 }} />
          </View>
          <ScrollView>
            {options.map(opt => (
              <Pressable
                key={opt.value}
                onPress={() => { onChange(opt.value); setOpen(false); }}
                style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, color: colors.text, textAlign: 'right', flex: 1 }}>{opt.label}</Text>
                {opt.value === value ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
