/**
 * بوابة التوظيف — الوظائف الشاغرة المتاحة للتقديم
 * GET /api/careers/postings
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface JobPosting {
  id: number;
  title?: string;
  department?: string;
  location?: string;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  deadline?: string;
  status?: string;
  applicantCount?: number;
}

const TYPE_LABEL: Record<string, string> = {
  full_time: 'دوام كامل',
  part_time: 'دوام جزئي',
  contract: 'عقد مؤقت',
  internship: 'تدريب',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

function fmtSalary(min?: number, max?: number): string {
  if (!min && !max) return '';
  if (min && max) return `${Number(min).toLocaleString('ar-SA')} – ${Number(max).toLocaleString('ar-SA')} ر.س`;
  if (min) return `من ${Number(min).toLocaleString('ar-SA')} ر.س`;
  return `حتى ${Number(max).toLocaleString('ar-SA')} ر.س`;
}

export default function CareersPortalScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<JobPosting[]>('/api/careers/postings');
  const postings = Array.isArray(data) ? data : [];
  const open = postings.filter(p => p.status === 'published' || p.status === 'open');

  if (isLoading) return <GLoadingState text="جارٍ تحميل الوظائف…" />;
  if (isError) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر التحميل"
      description="تحقق من الاتصال وأعد المحاولة"
      actionLabel="إعادة المحاولة"
      onAction={refetch}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بوابة التوظيف' }} />
      <FlatList
        data={open}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1, padding: 12, gap: 10 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="briefcase-outline" title="لا توجد وظائف" description="لا توجد وظائف شاغرة حالياً" />
        }
        renderItem={({ item }) => {
          const salary = fmtSalary(item.salaryMin, item.salaryMax);
          return (
            <Pressable
              style={({ pressed }) => [styles.card, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
              onPress={() => router.push({ pathname: '/hr/recruitment-detail' as never, params: { id: String(item.id) } })}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconBox, { backgroundColor: c.primary + '18' }]}>
                  <Ionicons name="briefcase-outline" size={22} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>{item.department ?? ''}</Text>
                </View>
              </View>
              <View style={styles.cardMeta}>
                {item.location ? (
                  <View style={styles.metaChip}>
                    <Ionicons name="location-outline" size={13} color={c.textMuted} />
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{item.location}</Text>
                  </View>
                ) : null}
                {item.employmentType ? (
                  <View style={styles.metaChip}>
                    <Ionicons name="time-outline" size={13} color={c.textMuted} />
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{TYPE_LABEL[item.employmentType] ?? item.employmentType}</Text>
                  </View>
                ) : null}
                {salary ? (
                  <View style={styles.metaChip}>
                    <Ionicons name="cash-outline" size={13} color={c.textMuted} />
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{salary}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.cardFooter}>
                <Text style={{ fontSize: 11, color: c.textFaint }}>آخر موعد: {fmtDate(item.deadline)}</Text>
                {item.applicantCount !== undefined ? (
                  <Text style={{ fontSize: 11, color: c.brand }}>{item.applicantCount} مقدّم</Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  iconBox: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardMeta: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  metaChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
