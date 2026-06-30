/**
 * المساعد الذكي — واجهة محادثة مع نظام غيث
 * POST /api/assistant/ask  { question, context? }
 */
import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GScreen, GText, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/hooks/useApi';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

interface AskResp {
  answer?: string;
  response?: string;
  message?: string;
}

const SUGGESTIONS = [
  'كم عدد الموظفين النشطين؟',
  'ما هي الفواتير المتأخرة؟',
  'ملخص حضور اليوم',
  'الطلبات المعلقة للاعتماد',
  'تقرير الرواتب هذا الشهر',
];

export default function AssistantScreen() {
  const c = useColors();
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: 'مرحباً! أنا مساعدك الذكي في نظام غيث. يمكنني الإجابة على أسئلتك حول بيانات المنظومة.', ts: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput('');
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: q, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const resp = await apiFetch('/api/assistant/ask', {
        method: 'POST',
        body: JSON.stringify({ question: q }),
      }) as AskResp;
      const answer = resp?.answer ?? resp?.response ?? resp?.message ?? 'لم أتمكن من الإجابة على هذا السؤال.';
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: answer, ts: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content: 'حدث خطأ أثناء معالجة سؤالك. يرجى المحاولة مجدداً.', ts: Date.now() }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GScreen>
        <Stack.Screen options={{ title: 'المساعد الذكي' }} />

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={
            loading ? (
              <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: c.surfaceAlt }]}>
                <GText variant="body" color="muted">…</GText>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
                {!isUser && (
                  <View style={[styles.avatar, { backgroundColor: c.brand }]}>
                    <Ionicons name="sparkles-outline" size={14} color="#fff" />
                  </View>
                )}
                <View style={[
                  styles.bubble,
                  isUser
                    ? [styles.userBubble, { backgroundColor: c.brand }]
                    : [styles.assistantBubble, { backgroundColor: c.surface, borderColor: c.border }],
                ]}>
                  <GText
                    variant="body"
                    style={{ color: isUser ? '#fff' : c.text, lineHeight: 22 }}
                  >
                    {item.content}
                  </GText>
                </View>
              </View>
            );
          }}
        />

        {messages.length === 1 && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <GText variant="caption" color="muted" style={{ marginBottom: 8 }}>اقتراحات:</GText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {SUGGESTIONS.map(s => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  style={[styles.suggestion, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
                >
                  <GText variant="caption">{s}</GText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <TextInput
            style={[styles.inputField, { color: c.text, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
            value={input}
            onChangeText={setInput}
            placeholder="اسأل سؤالاً..."
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={500}
            textAlign="right"
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
            style={[styles.sendBtn, { backgroundColor: input.trim() ? c.brand : c.surfaceAlt }]}
          >
            <Ionicons name="send-outline" size={18} color={input.trim() ? '#fff' : c.textFaint} />
          </Pressable>
        </View>
      </GScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowUser: { justifyContent: 'flex-start' },
  rowAssistant: { justifyContent: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '82%', padding: 12, borderRadius: 16 },
  userBubble: { borderBottomStartRadius: 4 },
  assistantBubble: { borderBottomEndRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputField: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
    fontFamily: 'IBMPlexSansArabic_400Regular',
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  suggestion: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
});
