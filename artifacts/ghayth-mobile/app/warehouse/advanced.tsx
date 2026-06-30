/**
 * المخزون المتقدم — دُفعات وأرقام تسلسلية وتصنيف ABC
 * GET /api/warehouse/lots | /api/warehouse/serials | /api/warehouse/abc-classification
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type AdvancedTab = 'lots' | 'serials' | 'abc';

interface Lot {
  id: number;
  lotNumber?: string;
  productName?: string;
  productId?: number;
  quantity?: number;
  expiryDate?: string;
  status?: string;
  warehouseName?: string;
}

interface Serial {
  id: number;
  serialNumber?: string;
  productName?: string;
  productId?: number;
  status?: string;
  warehouseName?: string;
  notes?: string;
}

interface AbcItem {
  productId?: number;
  productName?: string;
  sku?: string;
  classification?: string;
  totalValue?: number;
  totalQty?: number;
  currency?: string;
}

const CLASS_COLOR: Record<string, string> = {
  A: '#22C55E',
  B: '#F59E0B',
  C: '#EF4444',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function WarehouseAdvancedScreen() {
  const c = useColors();
  const [tab, setTab] = useState<AdvancedTab>('lots');

  const { data: lots, isLoading: loadL, refetch: refetchL } = useList<Lot[]>('/api/warehouse/lots');
  const { data: serials, isLoading: loadS, refetch: refetchS } = useList<Serial[]>('/api/warehouse/serials');
  const { data: abc, isLoading: loadA, refetch: refetchA } = useList<AbcItem[]>('/api/warehouse/abc-classification');

  const TABS: { key: AdvancedTab; label: string; icon: string }[] = [
    { key: 'lots', label: 'الدُّفعات', icon: 'layers-outline' },
    { key: 'serials', label: 'التسلسلية', icon: 'barcode-outline' },
    { key: 'abc', label: 'تصنيف ABC', icon: 'pie-chart-outline' },
  ];

  const isLoading = tab === 'lots' ? loadL : tab === 'serials' ? loadS : loadA;
  const refetch = tab === 'lots' ? refetchL : tab === 'serials' ? refetchS : refetchA;

  const lotList = Array.isArray(lots) ? lots : [];
  const serialList = Array.isArray(serials) ? serials : [];
  const abcList = Array.isArray(abc) ? abc : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المخزون المتقدم' }} />

      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={15} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 3 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : tab === 'lots' ? (
        <FlatList
          data={lotList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="layers-outline" title="لا توجد دُفعات" description="لا توجد دُفعات مخزون مسجّلة" />}
          renderItem={({ item }) => {
            const st = statusBadge(item.status ?? '');
            const isExpiring = item.expiryDate && new Date(item.expiryDate) < new Date(Date.now() + 30 * 864e5);
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                    {item.lotNumber ?? `#${item.id}`}
                  </Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                    {item.productName ?? '—'} · الكمية: {item.quantity ?? 0}
                  </Text>
                  <Text style={{ fontSize: 11, color: isExpiring ? '#EF4444' : c.textFaint, textAlign: 'right', marginTop: 2 }}>
                    تنتهي: {fmtDate(item.expiryDate)}
                  </Text>
                </View>
                {st ? <GStatusBadge status={st.label} size="sm" /> : null}
              </View>
            );
          }}
        />
      ) : tab === 'serials' ? (
        <FlatList
          data={serialList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد أرقام تسلسلية" description="لا توجد أرقام تسلسلية مسجّلة" />}
          renderItem={({ item }) => {
            const st = statusBadge(item.status ?? '');
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                    {item.serialNumber ?? `#${item.id}`}
                  </Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                    {item.productName ?? '—'}
                  </Text>
                  {item.warehouseName ? (
                    <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{item.warehouseName}</Text>
                  ) : null}
                </View>
                {st ? <GStatusBadge status={st.label} size="sm" /> : null}
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={abcList}
          keyExtractor={(item, i) => String(item.productId ?? i)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="pie-chart-outline" title="لا يوجد تصنيف" description="لا توجد بيانات تصنيف ABC" />}
          renderItem={({ item }) => {
            const clsColor = CLASS_COLOR[item.classification ?? ''] ?? c.textMuted;
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                <View style={[styles.classBadge, { backgroundColor: clsColor + '20', borderColor: clsColor }]}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: clsColor }}>{item.classification ?? '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                    {item.productName ?? item.sku ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                    القيمة: {Number(item.totalValue ?? 0).toLocaleString('ar-SA')} · الكمية: {item.totalQty ?? 0}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  classBadge: { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
