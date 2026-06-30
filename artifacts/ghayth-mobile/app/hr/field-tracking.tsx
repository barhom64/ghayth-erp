/**
 * التتبع الميداني
 * GET /api/my-field-tracking/eligibility
 * POST /api/my-field-tracking/ping
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GCard, GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';

interface Eligibility {
  eligible?: boolean;
  reason?: string;
  policy?: { requiresLocation?: boolean; intervalMinutes?: number; radiusMeters?: number };
}

interface TrackingRecord {
  id: number;
  lat?: number;
  lng?: number;
  accuracy?: number;
  timestamp?: string;
  note?: string;
}

export default function FieldTrackingScreen() {
  const c = useColors();
  const [pinging, setPinging] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);

  const { data: eligData, isLoading: loadE } = useList<Eligibility>('/api/my-field-tracking/eligibility');
  const { data: trackData, isLoading: loadT, refetch } = useList<TrackingRecord[]>('/api/hr/attendance/field-track');
  const { refreshing, onRefresh } = useRefresh([['/api/my-field-tracking/eligibility'], ['/api/hr/attendance/field-track']]);

  const eligibility = Array.isArray(eligData) ? eligData[0] : eligData as Eligibility | null;
  const records = Array.isArray(trackData) ? trackData : [];

  async function ping() {
    setPinging(true);
    try {
      await apiFetch('/api/my-field-tracking/ping', { method: 'POST', body: JSON.stringify({}) });
      setLastPing(new Date().toLocaleTimeString('ar-SA'));
      refetch?.();
    } finally {
      setPinging(false);
    }
  }

  if (loadE) return <GLoadingState text="جارٍ التحقق من الأهلية…" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التتبع الميداني' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GCard>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Ionicons name="location" size={22} color={eligibility?.eligible ? '#22C55E' : '#EF4444'} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: eligibility?.eligible ? '#22C55E' : '#EF4444' }}>
              {eligibility?.eligible ? 'مؤهل للتتبع الميداني' : 'غير مؤهل'}
            </Text>
          </View>
          {eligibility?.reason ? (
            <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right' }}>{eligibility.reason}</Text>
          ) : null}
          {eligibility?.policy && (
            <View style={{ flexDirection: 'row-reverse', gap: 16, marginTop: 10 }}>
              {eligibility.policy.intervalMinutes != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{eligibility.policy.intervalMinutes}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>دقيقة (الفاصل)</Text>
                </View>
              )}
              {eligibility.policy.radiusMeters != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{eligibility.policy.radiusMeters}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>متر (النطاق)</Text>
                </View>
              )}
            </View>
          )}
          {eligibility?.eligible && (
            <View style={{ marginTop: 14 }}>
              <GButton
                title={pinging ? 'جارٍ الإرسال…' : 'إرسال موقعي الآن'}
                variant="primary"
                onPress={ping}
                disabled={pinging}
              />
              {lastPing && (
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 8 }}>
                  آخر إرسال: {lastPing}
                </Text>
              )}
            </View>
          )}
        </GCard>

        {records.length > 0 && (
          <GCard style={{ padding: 0, gap: 0 }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>سجل التتبع</Text>
            </View>
            {records.slice(0, 10).map((rec: TrackingRecord, i: number) => (
              <View key={rec.id} style={{ padding: 12, borderBottomWidth: i === Math.min(records.length, 10) - 1 ? 0 : 1, borderBottomColor: c.border }}>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: c.text }}>
                    {rec.lat?.toFixed(5)}, {rec.lng?.toFixed(5)}
                  </Text>
                  <Text style={{ fontSize: 11, color: c.textFaint }}>
                    {rec.timestamp ? new Date(rec.timestamp).toLocaleTimeString('ar-SA') : '—'}
                  </Text>
                </View>
                {rec.note ? <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>{rec.note}</Text> : null}
              </View>
            ))}
          </GCard>
        )}
      </ScrollView>
    </View>
  );
}
