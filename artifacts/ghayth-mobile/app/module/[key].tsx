/**
 * مركز الوحدة — عرض sections الوحدة في شبكة
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GLoadingState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { NAV_MODULES } from '@/lib/modules';
import { getModuleDef } from '@/lib/moduleSections';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export default function ModuleHubScreen() {
  const c = useColors();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();

  const mod = NAV_MODULES.find(m => m.key === key);
  const def = getModuleDef(key);

  if (!def) {
    return (
      <View style={[styles.placeholder, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ title: mod?.label ?? 'وحدة' }} />
        <View style={[styles.iconWrap, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name={(mod?.icon ?? 'cube-outline') as IoniconName} size={44} color={c.brand} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>{mod?.label ?? 'هذه الوحدة'}</Text>
        <Text style={[styles.body, { color: c.textMuted }]}>
          هذه الوحدة قيد الإطلاق على تطبيق الجوال وستتوفر هنا قريبًا.
        </Text>
        <GButton title="رجوع" icon="arrow-forward-outline" variant="secondary" onPress={() => router.back()} style={{ marginTop: 8, width: '100%' }} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.list}>
      <Stack.Screen options={{ title: def.label }} />
      <View style={styles.grid}>
        {def.sections.map(s => (
          <Pressable
            key={s.key}
            onPress={() => router.push({ pathname: '/m/[module]/[section]', params: { module: def.key, section: s.key } })}
            style={({ pressed }) => [
              styles.sectionCard,
              { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border },
            ]}
          >
            <Ionicons name={(s.icon ?? 'list-outline') as IoniconName} size={28} color={c.brand} />
            <Text style={[styles.sectionLabel, { color: c.text }]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionCard: { width: '47%', borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center', gap: 10, minHeight: 90 },
  sectionLabel: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  iconWrap: { width: 96, height: 96, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
});
