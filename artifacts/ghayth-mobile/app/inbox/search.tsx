import React, { useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SearchResult { id?: string; subject?: string; from?: string; snippet?: string; }

export default function InboxSearch() {
  const c = useColors();
  const [q, setQ] = useState('');
  const { data, isLoading, refetch } = useList<SearchResult[]>(`/api/inbox/search?q=${encodeURIComponent(q)}`);
  const list = Array.isArray(data) ? data : [];
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بحث في البريد' }} />
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => refetch()}
          placeholder="ابحث في الرسائل…" placeholderTextColor={c.textFaint}
          style={{ backgroundColor: c.surface, borderRadius: 8, padding: 10, color: c.text, textAlign: 'right' }} />
      </View>
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        ListEmptyComponent={<GEmptyState icon="search-outline" title="أدخل كلمة البحث" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.subject ?? '—'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.from ?? ''}</Text>
            <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{item.snippet ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
