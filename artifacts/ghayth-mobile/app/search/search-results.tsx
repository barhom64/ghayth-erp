import React, { useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SearchResult { id?: number; type?: string; label?: string; description?: string; }

export default function SearchResultsScreen() {
  const c = useColors();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const { data, isLoading, refetch } = useList<SearchResult[]>(active ? `/api/search?q=${encodeURIComponent(active)}` : '/api/search');
  const list = Array.isArray(data) ? data : [];
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'البحث' }} />
      <View style={{ padding: 12, flexDirection: 'row-reverse', gap: 8 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن أي شيء…" placeholderTextColor={c.textFaint}
          style={{ flex: 1, backgroundColor: c.surface, borderRadius: 8, paddingHorizontal: 12, height: 40, color: c.text, textAlign: 'right' }} />
        <GButton title="بحث" onPress={() => setActive(query)} variant="primary" />
      </View>
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="search-outline" title="أدخل كلمة للبحث" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.label ?? String(item.id ?? '')}</Text>
            {!!item.type && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.type}</Text>}
            {!!item.description && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{item.description}</Text>}
          </View>
        )}
      />
    </View>
  );
}
