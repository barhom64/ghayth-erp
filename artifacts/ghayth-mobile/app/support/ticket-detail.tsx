/**
 * تفاصيل تذكرة الدعم — معلومات + المحادثة + التصعيد
 * GET /api/support/tickets/:id
 * GET /api/support/tickets/:id/messages?pageSize=20
 * POST /api/support/tickets/:id/reply
 */
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Ticket {
  id: number;
  subject?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  category?: string;
  clientName?: string;
  assigneeName?: string;
  createdAt?: string;
  resolvedAt?: string;
  slaStatus?: string;
  channel?: string;
}

interface Message {
  id: number;
  body?: string;
  content?: string;
  senderName?: string;
  isAgent?: boolean;
  isStaff?: boolean;
  sentAt?: string;
  createdAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#22C55E',
  حرج: '#EF4444', عالية: '#F97316', متوسطة: '#F59E0B', منخفضة: '#22C55E',
};

export default function TicketDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const { data: ticket, isLoading: ticketLoading } = useList<Ticket>(`/api/support/tickets/${id}`);
  const { data: msgsResp, isLoading: msgsLoading, refetch } = useList<{ data?: Message[] }>(
    `/api/support/tickets/${id}/messages`, { pageSize: 20 }
  );

  const sendReply = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch(`/api/support/tickets/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply('');
      await refetch();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  if (ticketLoading) return <GLoadingState text="جارٍ تحميل التذكرة…" />;
  if (!ticket) return <GEmptyState icon="help-buoy-outline" title="تذكرة غير موجودة" description="تعذّر العثور على بيانات التذكرة" />;

  const subject = ticket.subject ?? ticket.title ?? `تذكرة #${ticket.id}`;
  const st = statusBadge(ticket.status ?? '');
  const priColor = PRIORITY_COLOR[ticket.priority ?? ''] ?? c.textMuted;
  const messages = msgsResp?.data ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <Stack.Screen options={{ title: subject }} />

      <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 8 }}>

        {/* رأس التذكرة */}
        <GCard style={{ margin: 12, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'right' }}>{subject}</Text>
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {st && <GStatusBadge status={st.label} size="sm" />}
            {ticket.priority ? <View style={[styles.priorityBadge, { backgroundColor: priColor + '20', borderColor: priColor }]}>
              <Text style={{ fontSize: 11, color: priColor, fontWeight: '600' }}>{ticket.priority}</Text>
            </View> : null}
            {ticket.category ? <Text style={{ fontSize: 12, color: c.textMuted }}>{ticket.category}</Text> : null}
          </View>
          {[
            { label: 'العميل', value: ticket.clientName },
            { label: 'المُسنَد إلى', value: ticket.assigneeName },
            { label: 'القناة', value: ticket.channel },
            { label: 'تاريخ الفتح', value: fmtDate(ticket.createdAt) },
            { label: 'تاريخ الحل', value: ticket.resolvedAt ? fmtDate(ticket.resolvedAt) : undefined },
          ].filter(r => r.value).map(row => (
            <View key={row.label} style={styles.metaRow}>
              <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 80, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
          {ticket.description ? <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>{ticket.description}</Text> : null}
        </GCard>

        {/* رسائل */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textAlign: 'right', paddingHorizontal: 16, marginBottom: 8 }}>
          المحادثة
        </Text>

        {msgsLoading ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: 20 }} />
        ) : messages.length === 0 ? (
          <GEmptyState icon="chatbubbles-outline" title="لا رسائل" description="ابدأ المحادثة بإرسال رد" style={{ marginVertical: 20 }} />
        ) : (
          messages.map(msg => {
            const isStaff = msg.isAgent || msg.isStaff;
            return (
              <View key={msg.id} style={[styles.bubble, isStaff ? styles.bubbleOut : styles.bubbleIn]}>
                <View style={[
                  styles.bubbleContent,
                  { backgroundColor: isStaff ? c.brand : c.surface, borderColor: c.border },
                  isStaff ? {} : { borderWidth: 1 },
                ]}>
                  {msg.senderName ? (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: isStaff ? c.onPrimary + 'CC' : c.textMuted, textAlign: 'right', marginBottom: 2 }}>
                      {msg.senderName}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 14, color: isStaff ? c.onPrimary : c.text, textAlign: 'right', lineHeight: 20 }}>
                    {msg.body ?? msg.content ?? ''}
                  </Text>
                  <Text style={{ fontSize: 10, color: isStaff ? c.onPrimary + '80' : c.textFaint, textAlign: 'left', marginTop: 4 }}>
                    {fmtDate(msg.sentAt ?? msg.createdAt)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* مربع الرد */}
      <View style={[styles.replyBox, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Pressable
          onPress={sendReply}
          disabled={!reply.trim() || sending}
          style={[styles.sendBtn, { backgroundColor: reply.trim() ? c.brand : c.border }]}
        >
          {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={18} color="#FFF" />}
        </Pressable>
        <TextInput
          value={reply}
          onChangeText={setReply}
          placeholder="اكتب ردًا…"
          placeholderTextColor={c.textFaint}
          multiline
          style={[styles.replyInput, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  priorityBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  metaRow: { flexDirection: 'row', gap: 8 },
  bubble: { paddingHorizontal: 12, marginVertical: 4 },
  bubbleIn: { alignItems: 'flex-end' },
  bubbleOut: { alignItems: 'flex-start' },
  bubbleContent: { maxWidth: '85%', borderRadius: 12, padding: 10 },
  replyBox: { flexDirection: 'row-reverse', alignItems: 'flex-end', padding: 10, gap: 8, borderTopWidth: 1 },
  replyInput: { flex: 1, maxHeight: 120, minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, textAlign: 'right' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
