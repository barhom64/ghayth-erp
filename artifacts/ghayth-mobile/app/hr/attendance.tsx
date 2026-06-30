/**
 * تسجيل الحضور الميداني — GPS + كاميرا
 * يُرحّل إلى POST /api/hr/check-in أو /api/hr/check-out
 */
import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GScreen, GCard, GText, GButton, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, useMutation } from '@/hooks/useApi';
import { useCurrentPosition, takePhoto } from '@/hooks/useNative';

interface TodayRecord {
  status: string;
  checkIn?: string;
  checkOut?: string;
  id?: number;
}
interface AttendanceStatus {
  today?: TodayRecord | null;
  attendance?: TodayRecord | null;
}

export default function AttendanceScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<AttendanceStatus>('/api/my-space');
  const { position, loading: gpsLoading, error: gpsError, refresh: fetchGPS } = useCurrentPosition();
  const [photo, setPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkInMutation = useMutation('/api/hr/check-in', 'POST');
  const checkOutMutation = useMutation('/api/hr/check-out', 'POST');

  const today = data?.attendance ?? data?.today;
  const checkedIn = today?.status === 'present' && !today?.checkOut;
  const checkedOut = !!today?.checkOut;

  const handlePhoto = async () => {
    const result = await takePhoto();
    if (result) setPhoto(`data:${result.mimeType};base64,${result.base64}`);
  };

  const handleAction = async () => {
    if (!position) {
      Alert.alert('الموقع مطلوب', 'يرجى تفعيل تحديد الموقع أولًا.');
      await fetchGPS();
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        lat: position.lat,
        lon: position.lng,
        accuracy: position.accuracy,
        photo: photo ?? undefined,
        timestamp: new Date().toISOString(),
      };
      if (checkedIn) {
        await checkOutMutation.mutateAsync(body as never);
        Alert.alert('تم', 'تم تسجيل انصرافك بنجاح');
      } else {
        await checkInMutation.mutateAsync(body as never);
        Alert.alert('تم', 'تم تسجيل حضورك بنجاح');
      }
      await refetch();
      setPhoto(null);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تسجيل الحضور');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <GLoadingState text="جارٍ التحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر تحميل بيانات الحضور" description="تحقق من اتصالك وحاول مجدداً" />;

  return (
    <GScreen scrollable>
      <Stack.Screen options={{ title: 'تسجيل الحضور' }} />

      {/* حالة اليوم */}
      <GCard style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: checkedOut ? c.textMuted : checkedIn ? '#22C55E' : '#F59E0B' }]} />
          <GText variant="subheading">
            {checkedOut ? 'انتهى دوامك اليوم' : checkedIn ? 'أنت في الدوام' : 'لم تسجّل حضورك بعد'}
          </GText>
        </View>
        {today?.checkIn ? <GText variant="caption" color={c.textMuted} style={{ textAlign: 'right', marginTop: 6 }}>وقت الدخول: {today.checkIn}</GText> : null}
        {today?.checkOut ? <GText variant="caption" color={c.textMuted} style={{ textAlign: 'right' }}>وقت الانصراف: {today.checkOut}</GText> : null}
      </GCard>

      {/* الموقع */}
      <GCard style={styles.section}>
        <View style={styles.sectionHeader}>
          <Pressable onPress={fetchGPS} disabled={gpsLoading}>
            <Ionicons name={gpsLoading ? 'hourglass-outline' : 'refresh-outline'} size={20} color={c.brand} />
          </Pressable>
          <GText variant="label">موقعك الحالي</GText>
        </View>
        {gpsError ? (
          <Text style={{ color: c.danger, textAlign: 'right', fontSize: 13 }}>{gpsError}</Text>
        ) : position ? (
          <Text style={{ color: c.textMuted, textAlign: 'right', fontSize: 13, marginTop: 4 }}>
            {position.lat.toFixed(6)}° ، {position.lng.toFixed(6)}°
            {position.accuracy ? `  (±${Math.round(position.accuracy)} م)` : ''}
          </Text>
        ) : (
          <GButton title="تحديد الموقع" icon="location-outline" variant="secondary" onPress={fetchGPS} loading={gpsLoading} style={{ marginTop: 8 }} />
        )}
      </GCard>

      {/* الصورة */}
      <GCard style={styles.section}>
        <GText variant="label" style={{ textAlign: 'right', marginBottom: 10 }}>صورة سيلفي (اختياري)</GText>
        {photo ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
            <Pressable onPress={() => setPhoto(null)} style={styles.removePhoto}>
              <Ionicons name="close-circle" size={24} color="#EF4444" />
            </Pressable>
          </View>
        ) : (
          <GButton title="التقط صورة" icon="camera-outline" variant="secondary" onPress={handlePhoto} />
        )}
      </GCard>

      {/* زر التسجيل */}
      {!checkedOut && (
        <GButton
          title={checkedIn ? 'تسجيل الانصراف' : 'تسجيل الحضور'}
          icon={checkedIn ? 'log-out-outline' : 'finger-print-outline'}
          onPress={handleAction}
          loading={submitting}
          style={checkedIn ? { ...styles.mainBtn, backgroundColor: '#EF4444' } : styles.mainBtn}
        />
      )}
    </GScreen>
  );
}

const styles = StyleSheet.create({
  statusCard: { margin: 16, marginBottom: 0 },
  statusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  section: { margin: 16, marginBottom: 0 },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  photoWrap: { position: 'relative', alignSelf: 'center' },
  photo: { width: 180, height: 180, borderRadius: 12 },
  removePhoto: { position: 'absolute', top: -8, right: -8 },
  mainBtn: { margin: 16, marginTop: 24 },
});
