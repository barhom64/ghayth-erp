import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmailDomainsData {
  data?: {
    domains?: string[];
    suggestedLocalPart?: string;
    hasConnectedDomains?: boolean;
  };
  [key: string]: unknown;
}

export default function EmailDomainsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<EmailDomainsData>('/api/communications/provisioning/email-domains');
  const resp = (data && !Array.isArray(data)) ? data as EmailDomainsData : null;
  const domains = resp?.data?.domains ?? [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل نطاقات البريد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نطاقات البريد الإلكتروني' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>
            النطاقات المرتبطة
          </Text>
          <Text style={{ fontSize: 12, color: resp?.data?.hasConnectedDomains ? '#22C55E' : '#EF4444', textAlign: 'right' }}>
            {resp?.data?.hasConnectedDomains ? 'يوجد نطاقات متصلة' : 'لا يوجد نطاقات متصلة'}
          </Text>
        </View>
        {domains.length === 0 ? (
          <GEmptyState icon="mail-outline" title="لا توجد نطاقات بريد" description="" />
        ) : (
          domains.map((domain, i) => (
            <View key={i} style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', alignItems: 'center' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginLeft: 8 }} />
              <Text style={{ fontSize: 14, color: c.text, fontFamily: 'monospace' }}>@{domain}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
