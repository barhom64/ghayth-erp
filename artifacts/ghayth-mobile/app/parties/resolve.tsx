import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ResolvedParty { id?: number; name?: string; type?: string; phone?: string; email?: string; }

export default function PartiesResolveScreen() {
  const c = useColors();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const { data, isLoading, refetch } = useList<ResolvedParty>(active ? `/api/parties/resolve?q=${encodeURIComponent(active)}` : null as unknown as string);
  const party = (data && !Array.isArray(data)) ? data as ResolvedParty : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'البحث عن طرف' }} />
      <View style={{ padding: 12, flexDirection: 'row-reverse', gap: 8 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="رقم هاتف أو اسم…" placeholderTextColor={c.textFaint}
          style={{ flex: 1, backgroundColor: c.surface, borderRadius: 8, paddingHorizontal: 12, height: 40, color: c.text, textAlign: 'right' }} />
        <GButton title="بحث" onPress={() => setActive(query)} variant="primary" />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {party ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{party.name ?? ''}</Text>
            {!!party.type && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{party.type}</Text>}
            {!!party.phone && <Text style={{ color: c.textFaint, fontSize: 13, marginTop: 4 }}>{party.phone}</Text>}
            {!!party.email && <Text style={{ color: c.textFaint, fontSize: 13, marginTop: 4 }}>{party.email}</Text>}
          </View>
        ) : <GEmptyState icon="search-outline" title="أدخل رقمًا أو اسمًا للبحث" description="" />}
      </ScrollView>
    </View>
  );
}
