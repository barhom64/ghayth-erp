/**
 * البحث العام — يبحث في كل الكيانات (موظفون، عملاء، فواتير، مركبات...)
 * GET /api/search?q=...&limit=20
 */
import React, { useState, useRef } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GScreen, GText, GCard, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/hooks/useApi';
import { setRecord } from '@/lib/recordStore';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface SearchHit {
  id: number | string;
  entityType: string;
  label: string;
  sub?: string;
  status?: string;
  url?: string;
}

interface SearchResp {
  results?: SearchHit[];
  hits?: SearchHit[];
}

const ENTITY_ICONS: Record<string, IoniconName> = {
  employee: 'person-outline',
  client: 'briefcase-outline',
  invoice: 'receipt-outline',
  vehicle: 'car-outline',
  project: 'construct-outline',
  ticket: 'help-buoy-outline',
  legal_case: 'hammer-outline',
  property_unit: 'home-outline',
  vendor: 'business-outline',
  document: 'document-text-outline',
  opportunity: 'trending-up-outline',
  task: 'checkbox-outline',
  journal: 'book-outline',
};

const ENTITY_LABELS: Record<string, string> = {
  employee: 'موظف',
  client: 'عميل',
  invoice: 'فاتورة',
  vehicle: 'مركبة',
  project: 'مشروع',
  ticket: 'تذكرة دعم',
  legal_case: 'قضية',
  property_unit: 'وحدة عقارية',
  vendor: 'مورّد',
  document: 'مستند',
  opportunity: 'فرصة بيعية',
  task: 'مهمة',
  journal: 'قيد يومي',
};

export default function SearchScreen() {
  const c = useColors();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const resp = await apiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`) as SearchResp;
      setResults(resp?.results ?? resp?.hits ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const onChangeText = (text: string) => {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(text), 400);
  };

  const onPress = (hit: SearchHit) => {
    setRecord({ title: hit.label, row: hit as unknown as Record<string, unknown> });
    router.push('/record');
  };

  return (
    <GScreen>
      <Stack.Screen options={{ title: 'البحث العام' }} />
      <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="search-outline" size={18} color={c.textMuted} style={{ marginHorizontal: 8 }} />
        <TextInput
          style={[styles.input, { color: c.text }]}
          value={query}
          onChangeText={onChangeText}
          placeholder="ابحث عن موظف، عميل، فاتورة..."
          placeholderTextColor={c.textFaint}
          autoFocus
          returnKeyType="search"
          textAlign="right"
        />
        {loading && <ActivityIndicator size="small" color={c.brand} style={{ marginRight: 8 }} />}
        {query.length > 0 && !loading && (
          <Pressable onPress={() => { setQuery(''); setResults([]); }} style={{ marginRight: 8 }}>
            <Ionicons name="close-circle" size={18} color={c.textMuted} />
          </Pressable>
        )}
      </View>

      {query.length < 2 && (
        <GEmptyState
          icon="search-outline"
          title="ابدأ البحث"
          description="اكتب حرفين أو أكثر للبحث في كل وحدات النظام"
        />
      )}

      {query.length >= 2 && !loading && results.length === 0 && (
        <GEmptyState icon="search-outline" title="لا توجد نتائج" description={`لم يُعثر على نتائج لـ "${query}"`} />
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => `${item.entityType}-${item.id}`}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => {
          const icon = ENTITY_ICONS[item.entityType] ?? 'ellipse-outline';
          const typeLabel = ENTITY_LABELS[item.entityType] ?? item.entityType;
          return (
            <Pressable
              onPress={() => onPress(item)}
              style={({ pressed }) => [styles.row, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.iconBox, { backgroundColor: c.surfaceAlt }]}>
                <Ionicons name={icon} size={18} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <GText variant="body" style={{ fontWeight: '600' }}>{item.label}</GText>
                {item.sub ? <GText variant="caption" color="muted">{item.sub}</GText> : null}
              </View>
              <View style={[styles.typePill, { backgroundColor: c.surfaceAlt }]}>
                <GText variant="caption" color="muted">{typeLabel}</GText>
              </View>
              <Ionicons name="chevron-back-outline" size={16} color={c.textFaint} />
            </Pressable>
          );
        }}
      />
    </GScreen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
    fontFamily: 'IBMPlexSansArabic_400Regular',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
});
