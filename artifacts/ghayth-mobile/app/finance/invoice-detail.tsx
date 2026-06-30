/**
 * تفاصيل الفاتورة — بنود + حالة الدفع + إجراءات
 * GET /api/finance/invoices/:id
 * POST /api/finance/invoices/:id/approve
 * POST /api/finance/invoices/:id/send
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Invoice {
  id: number;
  invoiceNumber?: string;
  number?: string;
  clientName?: string;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  paid?: number;
  remaining?: number;
  notes?: string;
  terms?: string;
  currency?: string;
  lines?: InvoiceLine[];
}

interface InvoiceLine {
  id?: number;
  description?: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
  total?: number;
  vatRate?: number;
  vatAmount?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function InvoiceDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: invoice, isLoading, refetch } = useList<Invoice>(`/api/finance/invoices/${id}`);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/finance/invoices/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch (e) {
          Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفاتورة…" />;
  if (!invoice) return <GEmptyState icon="receipt-outline" title="فاتورة غير موجودة" description="تعذّر العثور على بيانات الفاتورة" />;

  const num = invoice.invoiceNumber ?? invoice.number ?? `#${invoice.id}`;
  const st = statusBadge(invoice.status ?? '');
  const lines = invoice.lines ?? [];
  const paidPct = invoice.total && invoice.paid ? Math.min((invoice.paid / invoice.total) * 100, 100) : 0;
  const currency = invoice.currency;

  const isDraft = invoice.status === 'draft';
  const isSent = invoice.status === 'sent';
  const isPayable = ['sent', 'partial', 'overdue'].includes(invoice.status ?? '');
  const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && (invoice.remaining ?? 0) > 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `فاتورة ${num}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>فاتورة {num}</Text>
          {invoice.clientName ? <Text style={{ fontSize: 14, color: c.onPrimary + 'CC', textAlign: 'right' }}>{invoice.clientName}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 6, gap: 8 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {isOverdue ? <View style={styles.overdueBadge}><Text style={{ fontSize: 11, color: '#FFF', fontWeight: '700' }}>متأخرة</Text></View> : null}
          </View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(invoice.total, currency)}</Text>
        </View>
      </View>

      {/* شريط الدفع */}
      {invoice.total !== undefined && (
        <View style={[styles.payBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
            <View style={[styles.progressFill, { width: `${paidPct}%`, backgroundColor: paidPct >= 100 ? '#22C55E' : c.brand }]} />
          </View>
          <View style={styles.payAmounts}>
            <Text style={{ fontSize: 12, color: '#22C55E', fontWeight: '600' }}>مدفوع: {fmtMoney(invoice.paid, currency)}</Text>
            <Text style={{ fontSize: 12, color: (invoice.remaining ?? 0) > 0 ? '#EF4444' : c.textMuted, fontWeight: '600' }}>
              متبقي: {fmtMoney(invoice.remaining, currency)}
            </Text>
          </View>
        </View>
      )}

      <View style={{ padding: 16, gap: 16 }}>
        {/* معلومات الفاتورة */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تاريخ الإصدار', value: fmtDate(invoice.issueDate) },
            { label: 'تاريخ الاستحقاق', value: fmtDate(invoice.dueDate) },
            { label: 'المجموع الفرعي', value: fmtMoney(invoice.subtotal, currency) },
            { label: 'ضريبة القيمة المضافة', value: invoice.vatAmount !== undefined ? fmtMoney(invoice.vatAmount, currency) : undefined },
            { label: 'الإجمالي', value: fmtMoney(invoice.total, currency) },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, fontWeight: row.label === 'الإجمالي' ? '700' : '400', color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {/* البنود */}
        {lines.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>بنود الفاتورة</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              {/* رأس الجدول */}
              <View style={[styles.lineHeader, { backgroundColor: c.surfaceAlt }]}>
                <Text style={{ fontSize: 11, color: c.textMuted, flex: 1, textAlign: 'right' }}>الوصف</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 50, textAlign: 'center' }}>الكمية</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 80, textAlign: 'left' }}>الإجمالي</Text>
              </View>
              {lines.map((line, i) => (
                <View key={line.id ?? i} style={[styles.lineRow, { borderBottomColor: c.border }, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>{line.description ?? line.name ?? '—'}</Text>
                    <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>
                      {fmtMoney(line.unitPrice ?? line.price, currency)} × {line.quantity ?? 1}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: c.textMuted, width: 50, textAlign: 'center' }}>{line.quantity ?? 1}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, width: 80, textAlign: 'left' }}>
                    {fmtMoney(line.total, currency)}
                  </Text>
                </View>
              ))}
            </GCard>
          </>
        )}

        {/* ملاحظات */}
        {invoice.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{invoice.notes}</Text>
          </GCard>
        ) : null}

        {/* إجراءات */}
        {isDraft && (
          <GButton
            title="اعتماد الفاتورة"
            onPress={() => doAction('approve', 'اعتماد الفاتورة')}
            loading={acting}
          />
        )}
        {isSent && (
          <GButton
            title="إرسال للعميل"
            variant="secondary"
            onPress={() => doAction('send', 'إرسال الفاتورة')}
            loading={acting}
          />
        )}
        {isPayable && (
          <GButton
            title="تسجيل دفعة"
            icon="barcode-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/finance/payment-new' as never, params: { invoiceId: id } })}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  overdueBadge: { backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  payBar: { padding: 12, borderBottomWidth: 1, gap: 8 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  payAmounts: { flexDirection: 'row', justifyContent: 'space-between' },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  lineHeader: { flexDirection: 'row', padding: 8, gap: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderBottomWidth: 1 },
});
