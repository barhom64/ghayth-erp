/**
 * أنواع الإجازات
 * GET /api/hr/leave-types
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LeaveType {
  id: number;
  name?: string;
  code?: string;
  maxDaysPerYear?: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
  requiresDocument?: boolean;
  gender?: string;
  isActive?: boolean;
  accrualMethod?: string;
}

export default function LeaveTypesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LeaveType[]>('/api/hr/leave-types');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أنواع الإجازات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أنواع الإجازات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد أنواع إجازات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.code ? <Text style={{ fontSize: 11, color: c.brand, fontWeight: '700' }}>{item.code}</Text> : null}
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 10, flexWrap: 'wrap' }}>
              {item.maxDaysPerYear != null ? (
                <Text style={{ fontSize: 12, color: c.text }}>{item.maxDaysPerYear} يوم/سنة</Text>
              ) : null}
              <Text style={{ fontSize: 12, color: item.isPaid ? '#22C55E' : '#F59E0B' }}>
                {item.isPaid ? 'مدفوع' : 'غير مدفوع'}
              </Text>
              {item.requiresApproval ? <Text style={{ fontSize: 12, color: c.textMuted }}>يستلزم موافقة</Text> : null}
              {item.requiresDocument ? <Text style={{ fontSize: 12, color: c.textMuted }}>يستلزم وثيقة</Text> : null}
              {item.gender && item.gender !== 'all' ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>{item.gender === 'female' ? 'إناث فقط' : 'ذكور فقط'}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
