/**
 * تكاملات الحوكمة — منتهيات الإقامة والسجلات التجارية
 * GET /api/gov-integrations
 * GET /api/gov-integrations/expiring/iqama
 * GET /api/gov-integrations/expiring/registration
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

type IntegTab = 'iqama' | 'registration';

interface ExpiringItem {
  id: number;
  name?: string;
  iqamaNumber?: string;
  registrationNumber?: string;
  expiryDate?: string;
  daysLeft?: number;
  nationality?: string;
  branchName?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function urgencyColor(daysLeft?: number): string {
  if (!daysLeft) return '#EF4444';
  if (daysLeft <= 30) return '#EF4444';
  if (daysLeft <= 60) return '#F59E0B';
  return '#22C55E';
}

export default function GovernanceIntegrationsScreen() {
  const c = useColors();
  const [tab, setTab] = useState<IntegTab>('iqama');

  const { data: iqama, isLoading: loadI, refetch: refetchI } = useList<ExpiringItem[]>('/api/gov-integrations/expiring/iqama');
  const { data: reg, isLoading: loadR, refetch: refetchR } = useList<ExpiringItem[]>('/api/gov-integrations/expiring/registration');

  const iqamaList = Array.isArray(iqama) ? iqama : [];
  const regList = Array.isArray(reg) ? reg : [];
  const isLoading = tab === 'iqama' ? loadI : loadR;
  const refetch = tab === 'iqama' ? refetchI : refetchR;
  const items = tab === 'iqama' ? iqamaList : regList;

  const TABS: { key: IntegTab; label: string; icon: string }[] = [
    { key: 'iqama', label: 'الإقامة', icon: 'card-outline' },
    { key: 'registration', label: 'السجل التجاري', icon: 'business-outline' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تكاملات الحوكمة' }} />

      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={15} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <GEmptyState
              icon="checkmark-circle-outline"
              title="لا توجد منتهيات"
              description={tab === 'iqama' ? 'لا توجد إقامات منتهية أو قريبة من الانتهاء' : 'لا توجد سجلات تجارية منتهية أو قريبة من الانتهاء'}
            />
          }
          renderItem={({ item }) => {
            const color = urgencyColor(item.daysLeft);
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                <View style={[styles.urgencyBar, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                    {item.name ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                    {tab === 'iqama' ? item.iqamaNumber : item.registrationNumber ?? '—'}
                    {item.branchName ? ` · ${item.branchName}` : ''}
                  </Text>
                  <Text style={{ fontSize: 11, color, textAlign: 'right', marginTop: 2 }}>
                    ينتهي: {fmtDate(item.expiryDate)} · {item.daysLeft != null ? `${item.daysLeft} يوم` : ''}
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
  urgencyBar: { width: 4, height: 44, borderRadius: 2 },
});
