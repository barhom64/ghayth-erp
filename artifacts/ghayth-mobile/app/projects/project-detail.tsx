/**
 * تفاصيل المشروع — بطاقة 360
 * GET /api/projects/:id
 * GET /api/projects/:id/milestones?pageSize=10
 * GET /api/projects/:id/tasks?pageSize=10
 * GET /api/projects/:id/team?pageSize=20
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GButton, GLoadingState, GEmptyState, GStatusBadge, GAvatar } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type Tab = 'info' | 'milestones' | 'tasks' | 'team';

interface Project {
  id: number;
  name?: string;
  title?: string;
  description?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  spent?: number;
  completionRate?: number;
  clientName?: string;
  managerName?: string;
  type?: string;
  priority?: string;
}

interface Milestone {
  id: number;
  title?: string;
  name?: string;
  dueDate?: string;
  status?: string;
  completionRate?: number;
}

interface Task {
  id: number;
  title?: string;
  name?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  assigneeName?: string;
}

interface TeamMember {
  id: number;
  name?: string;
  role?: string;
  jobTitle?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ر.س';
}

export default function ProjectDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const router = useRouter();
  const { data: project, isLoading: projLoading } = useList<Project>(`/api/projects/${id}`);
  const { data: msResp, isLoading: msLoading } = useList<{ data?: Milestone[] }>(
    `/api/projects/${id}/milestones`, { pageSize: 10 }, { enabled: tab === 'milestones' }
  );
  const { data: tasksResp, isLoading: tasksLoading } = useList<{ data?: Task[] }>(
    `/api/projects/${id}/tasks`, { pageSize: 10 }, { enabled: tab === 'tasks' }
  );
  const { data: teamResp, isLoading: teamLoading } = useList<{ data?: TeamMember[] }>(
    `/api/projects/${id}/team`, { pageSize: 20 }, { enabled: tab === 'team' }
  );

  if (projLoading) return <GLoadingState text="جارٍ تحميل المشروع…" />;
  if (!project) return <GEmptyState icon="folder-outline" title="مشروع غير موجود" description="تعذّر العثور على بيانات المشروع" />;

  const name = project.name ?? project.title ?? '—';
  const st = statusBadge(project.status ?? '');
  const pct = project.completionRate ?? 0;

  const TABS: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'info', label: 'المعلومات', icon: 'information-circle-outline' },
    { key: 'milestones', label: 'المراحل', icon: 'flag-outline' },
    { key: 'tasks', label: 'المهام', icon: 'checkbox-outline' },
    { key: 'team', label: 'الفريق', icon: 'people-outline' },
  ];

  const milestones = msResp?.data ?? [];
  const tasks = tasksResp?.data ?? [];
  const team = teamResp?.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: name }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {project.clientName ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{project.clientName}</Text> : null}
          {project.managerName ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>م: {project.managerName}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 8, gap: 8 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            <Text style={{ fontSize: 12, color: c.onPrimary + 'AA' }}>{pct}% مكتمل</Text>
          </View>
        </View>
      </View>

      {/* شريط التقدم */}
      <View style={[styles.progressBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
          <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: pct >= 100 ? '#22C55E' : c.brand }]} />
        </View>
      </View>

      {/* تبويبات */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabItem, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={16} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 40 }}>

        {/* ─── المعلومات ─── */}
        {tab === 'info' && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'النوع', value: project.type },
              { label: 'الأولوية', value: project.priority },
              { label: 'تاريخ البداية', value: fmtDate(project.startDate) },
              { label: 'تاريخ الانتهاء', value: fmtDate(project.endDate) },
              { label: 'الميزانية', value: project.budget !== undefined ? fmtMoney(project.budget) : undefined },
              { label: 'المصروف', value: project.spent !== undefined ? fmtMoney(project.spent) : undefined },
              { label: 'الوصف', value: project.description },
            ].filter(r => r.value).map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 90, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {/* ─── المراحل ─── */}
        {tab === 'milestones' && (
          <>
          <GButton
            title="إضافة مرحلة"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/projects/milestone-new' as never, params: { projectId: id } })}
            style={{ marginBottom: 8 }}
          />
          {msLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          milestones.length === 0 ? <GEmptyState icon="flag-outline" title="لا مراحل" description="لا توجد مراحل لهذا المشروع" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {milestones.map((ms, i) => {
              const st = statusBadge(ms.status ?? '');
              return (
                <View key={ms.id} style={[styles.listRow, { borderBottomColor: c.border }, i === milestones.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{ms.title ?? ms.name ?? '—'}</Text>
                    {ms.dueDate ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{fmtDate(ms.dueDate)}</Text> : null}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>}
          </>
        )}

        {/* ─── المهام ─── */}
        {tab === 'tasks' && (
          <>
          <GButton
            title="إضافة مهمة"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/projects/task-new' as never, params: { projectId: id } })}
            style={{ marginBottom: 8 }}
          />
          {tasksLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          tasks.length === 0 ? <GEmptyState icon="checkbox-outline" title="لا مهام" description="لا توجد مهام لهذا المشروع" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {tasks.map((task, i) => {
              const st = statusBadge(task.status ?? '');
              return (
                <Pressable key={task.id} onPress={() => router.push({ pathname: '/projects/task-detail' as never, params: { id: String(task.id) } })}
                  style={[styles.listRow, { borderBottomColor: c.border }, i === tasks.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{task.title ?? task.name ?? '—'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {task.assigneeName ?? ''}{task.dueDate ? ` · ${fmtDate(task.dueDate)}` : ''}
                    </Text>
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </Pressable>
              );
            })}
          </GCard>}
          </>
        )}

        {/* ─── الفريق ─── */}
        {tab === 'team' && (
          teamLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          team.length === 0 ? <GEmptyState icon="people-outline" title="لا أعضاء" description="لا يوجد فريق مضاف لهذا المشروع" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {team.map((m, i) => (
              <View key={m.id} style={[styles.memberRow, { borderBottomColor: c.border }, i === team.length - 1 && { borderBottomWidth: 0 }]}>
                <GAvatar name={m.name ?? '?'} size="sm" />
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{m.name ?? '—'}</Text>
                  {(m.role ?? m.jobTitle) ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{m.role ?? m.jobTitle}</Text> : null}
                </View>
              </View>
            ))}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 20 },
  progressBar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
  memberRow: { flexDirection: 'row-reverse', alignItems: 'center', padding: 12, borderBottomWidth: 1 },
});
