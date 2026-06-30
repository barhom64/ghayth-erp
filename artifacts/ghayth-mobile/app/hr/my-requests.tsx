/**
 * طلباتي — عرض طلبات الموظف الشخصية (إجازات، سلف، وقت إضافي، استئذان)
 * من /api/my-space/requests + /api/hr/excuse-requests (مُفلتَر بالتعيين)
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GScreen, GCard, GText, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { statusBadge } from '@/lib/moduleSections';

type FilterType = 'الكل' | 'إجازات' | 'سلف' | 'وقت إضافي' | 'استئذان';

interface RequestItem {
  id: number;
  requestType?: string;
  leaveTypeName?: string;
  excuseType?: string;
  title?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  excuseDate?: string;
  days?: number;
  createdAt: string;
}

interface MyRequestsResp {
  leaveRequests?: RequestItem[];
  data?: RequestItem[];
}

interface ExcuseResp { data?: RequestItem[] }

const FILTERS: FilterType[] = ['الكل', 'إجازات', 'سلف', 'وقت إضافي', 'استئذان'];

const typeLabel: Record<string, string> = {
  leave: 'إجازة',
  loan: 'سلفة',
  overtime: 'وقت إضافي',
  salary_advance: 'سلفة',
  excuse: 'استئذان',
};

function formatDateAr(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function MyRequestsScreen() {
  const c = useColors();
  const { user, assignments } = useAuth();
  const [filter, setFilter] = useState<FilterType>('الكل');

  const activeAssignment = assignments.find(a => a.companyId === user?.companyId);
  const { data: resp, isLoading, isError, refetch } = useList<MyRequestsResp>('/api/my-space/requests');
  const { data: excuseResp } = useList<ExcuseResp>('/api/hr/excuse-requests', { limit: 50 });

  const leaveItems: RequestItem[] = (resp?.leaveRequests ?? []).map(r => ({ ...r, requestType: 'leave' }));
  // فلترة استئذانات الموظف الحالي فقط من القائمة الشاملة
  const excuseItems: RequestItem[] = (excuseResp?.data ?? [])
    .filter((r: RequestItem & { assignmentId?: number }) => !activeAssignment || r.assignmentId === activeAssignment.id)
    .map(r => ({ ...r, requestType: 'excuse' }));
  const workflowItems: RequestItem[] = (resp?.data ?? []);
  const allItems = [...leaveItems, ...excuseItems, ...workflowItems].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filtered = allItems.filter(item => {
    if (filter === 'الكل') return true;
    if (filter === 'إجازات') return item.requestType === 'leave';
    if (filter === 'سلف') return item.requestType === 'loan' || item.requestType === 'salary_advance';
    if (filter === 'وقت إضافي') return item.requestType === 'overtime';
    if (filter === 'استئذان') return item.requestType === 'excuse';
    return true;
  });

  const doRefetch = () => { refetch(); };

  return (
    <GScreen>
      <Stack.Screen options={{ title: 'طلباتي' }} />

      {/* فلاتر */}
      <View style={[styles.filterRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {FILTERS.map(f => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterBtn, {
              backgroundColor: filter === f ? c.brand : c.surfaceAlt,
              borderColor: filter === f ? c.brand : c.border,
            }]}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: filter === f ? '#FFF' : c.textMuted }}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => `${item.requestType ?? 'req'}-${item.id}-${i}`}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        onRefresh={doRefetch}
        refreshing={isLoading}
        ListEmptyComponent={
          isError ? (
            <GEmptyState icon="alert-circle-outline" title="تعذّر تحميل الطلبات" description="تحقق من اتصالك وحاول مجدداً" />
          ) : (
            <GEmptyState
              icon="file-tray-outline"
              title="لا توجد طلبات"
              description={filter === 'الكل' ? 'لم ترسل أي طلبات بعد' : `لا توجد طلبات ${filter}`}
            />
          )
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status);
          const type = typeLabel[item.requestType ?? ''] ?? item.requestType ?? '';
          const name = item.leaveTypeName ?? item.title ?? type;
          return (
            <GCard>
              <View style={styles.itemHeader}>
                <GStatusBadge status={st?.label ?? item.status} size="sm" />
                <View style={{ flex: 1, marginRight: 8 }}>
                  <GText variant="label" numberOfLines={1}>{name}</GText>
                  {type ? <GText variant="caption" color={c.textMuted}>{type}</GText> : null}
                </View>
              </View>
              <View style={styles.itemMeta}>
                <GText variant="caption" color={c.textFaint}>{formatDateAr(item.createdAt)}</GText>
                {item.excuseDate ? (
                  <GText variant="caption" color={c.textMuted}>{formatDateAr(item.excuseDate)}{item.excuseType ? ` · ${item.excuseType}` : ''}</GText>
                ) : item.startDate ? (
                  <GText variant="caption" color={c.textMuted}>
                    {formatDateAr(item.startDate)}{item.endDate ? ` ← ${formatDateAr(item.endDate)}` : ''}
                    {item.days ? ` (${item.days} أيام)` : ''}
                  </GText>
                ) : null}
              </View>
            </GCard>
          );
        }}
      />
    </GScreen>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: 1, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  itemMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
});
