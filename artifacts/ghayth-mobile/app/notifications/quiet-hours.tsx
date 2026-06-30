import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface QuietHours {
  enabled?: boolean;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  days?: string[];
  [key: string]: unknown;
}

export default function QuietHoursScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<QuietHours>('/api/notifications/quiet-hours');
  const d = (data && !Array.isArray(data)) ? data as QuietHours : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل أوقات الهدوء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const statusColor = d?.enabled ? '#22C55E' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أوقات الهدوء' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: statusColor }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: statusColor }}>{d?.enabled ? 'مفعّل' : 'غير مفعّل'}</Text>
          <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 6 }}>أوقات الهدوء</Text>
        </View>
        {(d?.startTime || d?.endTime) ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ fontSize: 13, color: c.textMuted }}>من</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{d?.startTime ?? '—'}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: c.border }} />
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ fontSize: 13, color: c.textMuted }}>إلى</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{d?.endTime ?? '—'}</Text>
            </View>
            {d?.timezone ? (
              <>
                <View style={{ height: 1, backgroundColor: c.border }} />
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>المنطقة الزمنية</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{d.timezone}</Text>
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
