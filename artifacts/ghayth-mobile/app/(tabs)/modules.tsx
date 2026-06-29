/**
 * الوحدات — شبكة 2 عمود لكل وحدة في النظام
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GScreen, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { visibleModules, type NavModule } from '@/lib/modules';

export default function ModulesScreen() {
  const c = useColors();
  const { user } = useAuth();
  const router = useRouter();

  const modules = visibleModules(user?.userRoles);

  const renderItem = ({ item }: { item: NavModule }) => (
    <Pressable
      onPress={() => {
        if (item.route) {
          router.push(item.route as never);
        } else {
          router.push(`/module/${item.key}` as never);
        }
      }}
      style={({ pressed }) => [
        styles.moduleCard,
        {
          backgroundColor: pressed ? c.surfaceAlt : c.surface,
          borderColor: c.border,
        },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: c.primary + '18' }]}>
        <Ionicons name={item.icon} size={26} color={c.brand} />
      </View>
      <Text style={[styles.moduleLabel, { color: c.text }]}>{item.label}</Text>
    </Pressable>
  );

  return (
    <GScreen>
      <GText variant="heading" style={{ padding: 16, paddingBottom: 8 }}>الوحدات</GText>
      <FlatList
        data={modules}
        keyExtractor={item => item.key}
        numColumns={2}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40, gap: 8 }}
        renderItem={renderItem}
      />
    </GScreen>
  );
}

const styles = StyleSheet.create({
  moduleCard: {
    flex: 1, borderWidth: 1, borderRadius: 12, padding: 16,
    alignItems: 'center', gap: 10, minHeight: 100,
  },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  moduleLabel: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
