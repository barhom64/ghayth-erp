import React, { useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { GButton, GEmptyState, GLoadingState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Recipient { id?: number; name?: string; email?: string; phone?: string; }

export default function InboxRecipientsSearch() {
  const c = useColors();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const { data, isLoading, isError, refetch } = useList<Recipient[]>(`/api/inbox/recipients/search?q=${active}`);
  const list = Array.isArray(data) ? data : [];
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بحث عن مستلم' }} />
      <View style={{ padding: 12, flexDirection: 'row-reverse', gap: 8 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="اسم أو بريد أو هاتف…" placeholderTextColor={c.textFaint}
          style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, textAlign: 'right' }} />
        <GButton title="بحث" onPress={() => setActive(query)} variant="primary" />
      </View>
      {isLoading ? <GLoadingState text="جارٍ البحث…" /> :
       isError ? <GEmptyState icon="alert-circle-outline" title="تعذّر البحث" description="" actionLabel="إعادة المحاولة" onAction={refetch} /> :
       <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
         contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
         ListEmptyComponent={<GEmptyState icon="search-outline" title="لا توجد نتائج" description="" />}
         renderItem={({ item }) => (
           <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
             <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? '—'}</Text>
             <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.email ?? ''} {item.phone ?? ''}</Text>
           </View>
         )} />}
    </View>
  );
}
