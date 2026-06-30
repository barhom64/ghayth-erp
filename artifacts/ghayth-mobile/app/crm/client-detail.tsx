/**
 * ملف العميل 360 — بطاقة شاملة مع تبويبات
 * يُفتح من: قائمة العملاء عبر detailRoute أو مباشرة
 * GET /api/clients/:id
 * GET /api/clients/:id/invoices?pageSize=5
 * GET /api/clients/:id/tickets?pageSize=5
 * GET /api/clients/:id/projects?pageSize=5
 * GET /api/clients/:id/opportunities?pageSize=5
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GAvatar } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type Tab = 'info' | 'invoices' | 'tickets' | 'projects' | 'opportunities';

interface Client {
  id: number;
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  classification?: string;
  status?: string;
  industry?: string;
  address?: string;
  contactPerson?: string;
  taxNumber?: string;
  registrationNumber?: string;
  createdAt?: string;
  totalRevenue?: number;
  outstandingBalance?: number;
  companyName?: string;
  website?: string;
}

interface Invoice {
  id: number;
  invoiceNumber?: string;
  number?: string;
  total?: number;
  amount?: number;
  status: string;
  dueDate?: string;
  issueDate?: string;
  date?: string;
}

interface Ticket {
  id: number;
  subject?: string;
  title?: string;
  priority?: string;
  status: string;
  createdAt?: string;
  category?: string;
}

interface Project {
  id: number;
  name?: string;
  title?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
}

interface Opportunity {
  id: number;
  title?: string;
  name?: string;
  stage?: string;
  value?: number;
  expectedCloseDate?: string;
}

function fmt(val: unknown): string {
  if (!val) return '—';
  return String(val);
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

export default function ClientDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: client, isLoading: clientLoading } = useList<Client>(`/api/clients/${id}`);
  const { data: invoicesResp, isLoading: invLoading } = useList<{ data?: Invoice[] }>(
    `/api/clients/${id}/invoices`, { pageSize: 10 }, { enabled: tab === 'invoices' }
  );
  const { data: ticketsResp, isLoading: tickLoading } = useList<{ data?: Ticket[] }>(
    `/api/clients/${id}/tickets`, { pageSize: 10 }, { enabled: tab === 'tickets' }
  );
  const { data: projectsResp, isLoading: projLoading } = useList<{ data?: Project[] }>(
    `/api/clients/${id}/projects`, { pageSize: 10 }, { enabled: tab === 'projects' }
  );
  const { data: oppsResp, isLoading: oppLoading } = useList<{ data?: Opportunity[] }>(
    `/api/clients/${id}/opportunities`, { pageSize: 10 }, { enabled: tab === 'opportunities' }
  );

  if (clientLoading) return <GLoadingState text="جارٍ تحميل ملف العميل…" />;
  if (!client) return <GEmptyState icon="person-outline" title="عميل غير موجود" description="تعذّر العثور على بيانات العميل" />;

  const name = client.name ?? client.fullName ?? '—';
  const st = statusBadge(client.status ?? '');

  const TABS: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'info', label: 'البطاقة', icon: 'person-outline' },
    { key: 'invoices', label: 'الفواتير', icon: 'receipt-outline' },
    { key: 'tickets', label: 'التذاكر', icon: 'headset-outline' },
    { key: 'projects', label: 'المشاريع', icon: 'folder-outline' },
    { key: 'opportunities', label: 'الفرص', icon: 'trending-up-outline' },
  ];

  const invoices = invoicesResp?.data ?? [];
  const tickets = ticketsResp?.data ?? [];
  const projects = projectsResp?.data ?? [];
  const opportunities = oppsResp?.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: name }} />

      {/* رأس البطاقة */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <GAvatar name={name} size="lg" />
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {client.industry ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{client.industry}</Text> : null}
          {client.contactPerson ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{client.contactPerson}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
      </View>

      {/* ملخص مالي */}
      {(client.totalRevenue !== undefined || client.outstandingBalance !== undefined) && (
        <View style={[styles.finRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <View style={styles.finBox}>
            <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>إجمالي الإيرادات</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#22C55E', textAlign: 'center' }}>{fmtMoney(client.totalRevenue)}</Text>
          </View>
          <View style={[styles.finDivider, { backgroundColor: c.border }]} />
          <View style={styles.finBox}>
            <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>الرصيد المستحق</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: (client.outstandingBalance ?? 0) > 0 ? '#EF4444' : c.textMuted, textAlign: 'center' }}>{fmtMoney(client.outstandingBalance)}</Text>
          </View>
        </View>
      )}

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

        {/* ─── البطاقة ─── */}
        {tab === 'info' && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'البريد الإلكتروني', value: client.email },
              { label: 'الجوال', value: client.phone },
              { label: 'العنوان', value: client.address },
              { label: 'الموقع الإلكتروني', value: client.website },
              { label: 'الرقم الضريبي', value: client.taxNumber },
              { label: 'رقم السجل التجاري', value: client.registrationNumber },
              { label: 'تصنيف العميل', value: client.classification },
              { label: 'تاريخ التسجيل', value: fmtDate(client.createdAt) },
            ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{fmt(row.value)}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 110, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {/* ─── الفواتير ─── */}
        {tab === 'invoices' && (
          invLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          invoices.length === 0 ? <GEmptyState icon="receipt-outline" title="لا فواتير" description="لا توجد فواتير لهذا العميل" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {invoices.map((inv, i) => {
              const st = statusBadge(inv.status);
              const num = inv.invoiceNumber ?? inv.number ?? `#${inv.id}`;
              const amount = inv.total ?? inv.amount;
              return (
                <View key={inv.id} style={[styles.listRow, { borderBottomColor: c.border }, i === invoices.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{num}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {fmtDate(inv.dueDate ?? inv.issueDate ?? inv.date)}{amount !== undefined ? ` · ${fmtMoney(amount)}` : ''}
                    </Text>
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}

        {/* ─── التذاكر ─── */}
        {tab === 'tickets' && (
          tickLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          tickets.length === 0 ? <GEmptyState icon="headset-outline" title="لا تذاكر" description="لا توجد تذاكر دعم لهذا العميل" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {tickets.map((tick, i) => {
              const st = statusBadge(tick.status);
              return (
                <View key={tick.id} style={[styles.listRow, { borderBottomColor: c.border }, i === tickets.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{tick.subject ?? tick.title ?? '—'}</Text>
                    {tick.category ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{tick.category}</Text> : null}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}

        {/* ─── المشاريع ─── */}
        {tab === 'projects' && (
          projLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          projects.length === 0 ? <GEmptyState icon="folder-outline" title="لا مشاريع" description="لا توجد مشاريع لهذا العميل" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {projects.map((proj, i) => {
              const st = statusBadge(proj.status ?? '');
              return (
                <View key={proj.id} style={[styles.listRow, { borderBottomColor: c.border }, i === projects.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{proj.name ?? proj.title ?? '—'}</Text>
                    {proj.startDate ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{fmtDate(proj.startDate)}{proj.budget ? ` · ${fmtMoney(proj.budget)}` : ''}</Text> : null}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}

        {/* ─── الفرص ─── */}
        {tab === 'opportunities' && (
          oppLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          opportunities.length === 0 ? <GEmptyState icon="trending-up-outline" title="لا فرص" description="لا توجد فرص مبيعات لهذا العميل" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {opportunities.map((opp, i) => {
              const st = statusBadge(opp.stage ?? '');
              return (
                <View key={opp.id} style={[styles.listRow, { borderBottomColor: c.border }, i === opportunities.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{opp.title ?? opp.name ?? '—'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {opp.value !== undefined ? fmtMoney(opp.value) : ''}{opp.expectedCloseDate ? ` · ${fmtDate(opp.expectedCloseDate)}` : ''}
                    </Text>
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', padding: 20 },
  finRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  finBox: { flex: 1, gap: 4 },
  finDivider: { width: 1, height: 40, marginHorizontal: 16 },
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
});
