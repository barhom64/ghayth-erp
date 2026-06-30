/**
 * تفاصيل مهمة المشروع
 * GET /api/projects/tasks/:id
 * POST /api/projects/tasks/:id/complete
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Task {
  id: number;
  ref?: string;
  title?: string;
  description?: string;
  projectName?: string;
  assigneeName?: string;
  assigneeId?: number;
  priority?: string;
  status?: string;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  estimatedHours?: number;
  actualHours?: number;
  progress?: number;
  notes?: string;
  tags?: string[];
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const PRIORITY_COLOR: Record<string, string> = {
  low: '#22C55E',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7C3AED',
};
const PRIORITY_LABEL: Record<string, string> = {
  low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة',
};

export default function TaskDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: task, isLoading, refetch } = useList<Task>(`/api/projects/tasks/${id}`);

  const doComplete = async () => {
    Alert.alert('إتمام المهمة', 'هل تريد تحديد هذه المهمة كمكتملة؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/projects/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تحديث حالة المهمة');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل المهمة…" />;
  if (!task) return <GEmptyState icon="checkbox-outline" title="مهمة غير موجودة" description="تعذّر العثور على بيانات المهمة" />;

  const st = statusBadge(task.status ?? '');
  const priorityColor = PRIORITY_COLOR[task.priority ?? ''] ?? c.textMuted;
  const priorityLabel = PRIORITY_LABEL[task.priority ?? ''] ?? task.priority;
  const progress = task.progress ?? 0;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done' && task.status !== 'completed';
  const isDone = task.status === 'done' || task.status === 'completed';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: task.title ?? 'المهمة' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{task.title ?? '—'}</Text>
          {task.projectName ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right', marginTop: 2 }}>{task.projectName}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {priorityLabel ? (
              <View style={{ backgroundColor: priorityColor + '30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: priorityColor, fontWeight: '700' }}>{priorityLabel}</Text>
              </View>
            ) : null}
            {isOverdue ? (
              <View style={{ backgroundColor: '#EF444440', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700' }}>متأخرة</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: c.onPrimary }}>{progress}%</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>الإنجاز</Text>
        </View>
      </View>

      {/* شريط التقدم */}
      <View style={[styles.progressContainer, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
          <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: progress >= 100 ? '#22C55E' : c.brand }]} />
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* المعلومات */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المكلّف', value: task.assigneeName },
            { label: 'تاريخ البداية', value: fmtDate(task.startDate) },
            { label: 'تاريخ الاستحقاق', value: fmtDate(task.dueDate) },
            { label: 'الساعات المقدّرة', value: task.estimatedHours ? `${task.estimatedHours} ساعة` : undefined },
            { label: 'الساعات الفعلية', value: task.actualHours ? `${task.actualHours} ساعة` : undefined },
            { label: 'تاريخ الإتمام', value: task.completedAt ? fmtDate(task.completedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {task.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{task.description}</Text>
          </GCard>
        ) : null}

        {task.tags && task.tags.length > 0 ? (
          <GCard>
            <GText variant="caption" color="muted">التصنيفات</GText>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {task.tags.map(tag => (
                <View key={tag} style={{ backgroundColor: c.surfaceAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{tag}</Text>
                </View>
              ))}
            </View>
          </GCard>
        ) : null}

        {task.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{task.notes}</Text>
          </GCard>
        ) : null}

        {!isDone && (
          <GButton title="تحديد كمكتملة" onPress={doComplete} loading={acting} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  progressContainer: { padding: 12, borderBottomWidth: 1 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
