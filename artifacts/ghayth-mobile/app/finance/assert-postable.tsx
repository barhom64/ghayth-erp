import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PostableStatus { canPost?: boolean; blockers?: string[]; warnings?: string[]; }

export default function AssertPostableScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PostableStatus>('/api/finance/assert-postable');
  const status = (data && !Array.isArray(data)) ? data as PostableStatus : null;
  if (isLoading) return <GLoadingState text="جارٍ الفحص…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر الفحص" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فحص قابلية الترحيل' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {status ? (
          <>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: status.canPost ? c.brand : '#ef4444', fontSize: 22, fontWeight: '700' }}>{status.canPost ? 'قابل للترحيل ✅' : 'لا يمكن الترحيل ❌'}</Text>
            </View>
            {status.blockers && status.blockers.length > 0 && (
              <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600', marginBottom: 8 }}>حواجز ({status.blockers.length})</Text>
                {status.blockers.map((b, i) => <Text key={i} style={{ color: c.text, fontSize: 13, marginBottom: 4 }}>• {b}</Text>)}
              </View>
            )}
            {status.warnings && status.warnings.length > 0 && (
              <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12 }}>
                <Text style={{ color: '#f59e0b', fontSize: 14, fontWeight: '600', marginBottom: 8 }}>تحذيرات ({status.warnings.length})</Text>
                {status.warnings.map((w, i) => <Text key={i} style={{ color: c.text, fontSize: 13, marginBottom: 4 }}>• {w}</Text>)}
              </View>
            )}
          </>
        ) : <GEmptyState icon="checkbox-outline" title="لا توجد بيانات" description="" />}
      </ScrollView>
    </View>
  );
}
