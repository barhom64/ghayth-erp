/**
 * عرض المحادثة — رسائل thread متسلسلة
 * يُستخدم من: moduleSections comms→conversations → record → زر "فتح المحادثة"
 * أو مباشرة عبر: router.push({ pathname: '/comms/conversation', params: { id } })
 * GET /api/inbox/conversations/:id/messages
 */
import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GScreen, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { apiFetch, useList } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

interface Message {
  id: number | string;
  body: string;
  direction: 'inbound' | 'outbound';
  channel?: string;
  authorName?: string;
  createdAt: string;
  attachmentsCount?: number;
}

interface MessagesResp {
  data?: Message[];
  messages?: Message[];
}

function formatTime(val: string): string {
  try {
    return new Date(val).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(val: string): string {
  try {
    return new Date(val).toLocaleDateString('ar-SA', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ConversationScreen() {
  const c = useColors();
  const { id, subject } = useLocalSearchParams<{ id: string; subject?: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const endpoint = `/api/inbox/conversations/${id}/messages`;
  const { data, isLoading } = useList<MessagesResp>(endpoint);
  const messages: Message[] = data?.data ?? data?.messages ?? [];

  // Group messages by date for separators
  const grouped: Array<{ type: 'date'; date: string } | { type: 'msg'; msg: Message }> = [];
  let lastDate = '';
  for (const m of messages) {
    const d = (m.createdAt ?? '').slice(0, 10);
    if (d !== lastDate) {
      grouped.push({ type: 'date', date: m.createdAt });
      lastDate = d;
    }
    grouped.push({ type: 'msg', msg: m });
  }

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    const body = text.trim();
    setText('');
    setSending(true);
    try {
      await apiFetch(`/api/inbox/conversations/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body, direction: 'outbound' }),
      });
      await qc.invalidateQueries({ queryKey: [endpoint] });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <GScreen>
      <Stack.Screen options={{ title: subject ?? 'المحادثة' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {isLoading && <GLoadingState text="جارٍ تحميل الرسائل…" />}

        {!isLoading && messages.length === 0 && (
          <GEmptyState icon="chatbubbles-outline" title="لا توجد رسائل" description="ابدأ المحادثة بإرسال رسالة أدناه" />
        )}

        <FlatList
          ref={listRef}
          data={grouped}
          keyExtractor={(item, i) => String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 4 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            if (item.type === 'date') {
              return (
                <View style={styles.dateSep}>
                  <Text style={[styles.dateText, { color: c.textFaint, backgroundColor: c.surfaceAlt }]}>
                    {formatDate(item.date)}
                  </Text>
                </View>
              );
            }
            const msg = item.msg;
            const isOut = msg.direction === 'outbound';
            return (
              <View style={[styles.bubbleRow, isOut ? styles.bubbleRowOut : styles.bubbleRowIn]}>
                <View style={[
                  styles.bubble,
                  isOut
                    ? [styles.bubbleOut, { backgroundColor: c.primary }]
                    : [styles.bubbleIn, { backgroundColor: c.surface, borderColor: c.border }],
                ]}>
                  {!isOut && msg.authorName ? (
                    <Text style={[styles.author, { color: c.brand }]}>{msg.authorName}</Text>
                  ) : null}
                  <Text style={[styles.msgText, { color: isOut ? c.onPrimary : c.text }]}>
                    {msg.body}
                  </Text>
                  <View style={styles.metaRow}>
                    {msg.attachmentsCount ? (
                      <Ionicons name="attach-outline" size={12} color={isOut ? c.onPrimary + 'AA' : c.textFaint} />
                    ) : null}
                    <Text style={[styles.timeText, { color: isOut ? c.onPrimary + 'AA' : c.textFaint }]}>
                      {formatTime(msg.createdAt)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
        />

        {/* شريط الرسالة */}
        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={[styles.sendBtn, { backgroundColor: text.trim() && !sending ? c.brand : c.surfaceAlt }]}
          >
            <Ionicons name="send-outline" size={18} color={text.trim() && !sending ? '#FFF' : c.textFaint} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="اكتب رسالة…"
            placeholderTextColor={c.textFaint}
            style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
            multiline
            textAlign="right"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
        </View>
      </KeyboardAvoidingView>
    </GScreen>
  );
}

const styles = StyleSheet.create({
  dateSep: { alignItems: 'center', marginVertical: 8 },
  dateText: { fontSize: 11, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  bubbleRow: { flexDirection: 'row', marginBottom: 6 },
  bubbleRowIn: { justifyContent: 'flex-end' },
  bubbleRowOut: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 16, padding: 10, paddingHorizontal: 14, gap: 2 },
  bubbleIn: { borderWidth: 1, borderBottomRightRadius: 4 },
  bubbleOut: { borderBottomLeftRadius: 4 },
  author: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  msgText: { fontSize: 14, lineHeight: 20, textAlign: 'right' },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 4, marginTop: 2 },
  timeText: { fontSize: 10 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    borderWidth: 1,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
});
