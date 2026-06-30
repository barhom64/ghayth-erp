/**
 * تفاصيل إقامة مجموعة العمرة — كتل الغرف والتخصيصات
 * GET /api/umrah/room-blocks?groupId=:id
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GButton, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface RoomBlock {
  id: number;
  hotelName?: string;
  roomType?: string;
  totalRooms?: number;
  occupiedRooms?: number;
  checkIn?: string;
  checkOut?: string;
  pricePerNight?: number;
  status?: string;
  notes?: string;
}

interface Hotel {
  id: number;
  name?: string;
  city?: string;
  starRating?: number;
  contactPhone?: string;
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

export default function AccommodationDetailScreen() {
  const c = useColors();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();

  const { data: blocks, isLoading, isError } = useList<RoomBlock[]>(
    '/api/umrah/room-blocks',
    groupId ? { groupId } : undefined
  );
  const { data: hotels } = useList<Hotel[]>('/api/umrah/hotels');

  const blockList = Array.isArray(blocks) ? blocks : [];
  const hotelList = Array.isArray(hotels) ? hotels : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإقامة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال وأعد المحاولة" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إقامة المجموعة' }} />

      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>إقامة المجموعة</Text>
        <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right', marginTop: 4 }}>{blockList.length} كتلة غرف</Text>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {/* الفنادق */}
        {hotelList.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>الفنادق المتاحة</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              {hotelList.map((h, i) => (
                <View key={h.id} style={[styles.row, { borderBottomColor: c.border }, i === hotelList.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>{h.city ?? '—'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{h.name ?? '—'}</Text>
                    {h.starRating ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{'★'.repeat(h.starRating)}</Text> : null}
                  </View>
                </View>
              ))}
            </GCard>
          </>
        )}

        {/* كتل الغرف */}
        <GText variant="subheading" style={{ fontWeight: '700' }}>كتل الغرف</GText>
        {blockList.length === 0 ? (
          <GEmptyState icon="grid-outline" title="لا توجد كتل غرف" description="لم تُضف كتل غرف لهذه المجموعة بعد" />
        ) : (
          <GCard style={{ gap: 0, padding: 0 }}>
            {blockList.map((block, i) => {
              const st = statusBadge(block.status ?? '');
              const available = (block.totalRooms ?? 0) - (block.occupiedRooms ?? 0);
              return (
                <View key={block.id} style={[styles.blockRow, { borderBottomColor: c.border }, i === blockList.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{block.hotelName ?? '—'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                      {block.roomType ?? ''} · {block.totalRooms ?? 0} غرفة ({available} متاح)
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                      {fmtDate(block.checkIn)} ← {fmtDate(block.checkOut)}
                    </Text>
                    {block.pricePerNight ? (
                      <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right', marginTop: 2 }}>{fmtMoney(block.pricePerNight)} / ليلة</Text>
                    ) : null}
                  </View>
                  {st ? <GStatusBadge status={st.label} size="sm" /> : null}
                </View>
              );
            })}
          </GCard>
        )}

        <GButton
          title="إضافة كتلة غرف"
          variant="secondary"
          onPress={() => router.push({ pathname: '/umrah/room-block-new' as never, params: { groupId: groupId ?? '' } })}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderBottomWidth: 1 },
  blockRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 8, borderBottomWidth: 1 },
});
