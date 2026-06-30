import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ContactSummary {
  totalCalls?: number;
  totalEmails?: number;
  totalMeetings?: number;
  lastContactDate?: string;
  lastContactType?: string;
  openTickets?: number;
  openOpportunities?: number;
}

export default function ClientContactSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ContactSummary>('/api/clients/0/contact-summary');
  const d = (data && !Array.isArray(data)) ? data as ContactSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص التواصل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص تواصل العميل' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
          {[
            { label: 'مكالمات', value: d?.totalCalls ?? 0 },
            { label: 'بريد إلكتروني', value: d?.totalEmails ?? 0 },
            { label: 'اجتماعات', value: d?.totalMeetings ?? 0 },
            { label: 'تذاكر مفتوحة', value: d?.openTickets ?? 0 },
            { label: 'فرص مفتوحة', value: d?.openOpportunities ?? 0 },
          ].map((row, i, arr) => (
            <View key={row.label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, color: c.text }}>{row.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{row.value}</Text>
            </View>
          ))}
          {d?.lastContactDate ? (
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
              <Text style={{ fontSize: 14, color: c.text }}>آخر تواصل</Text>
              <Text style={{ fontSize: 13, color: c.textMuted }}>
                {new Date(d.lastContactDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
