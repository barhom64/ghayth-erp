import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { GScreen, GEmptyState, GButton } from '@workspace/ui-native';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <GScreen>
      <Stack.Screen options={{ title: 'غير موجود' }} />
      <GEmptyState
        icon="alert-circle-outline"
        title="الصفحة غير موجودة"
        description="تعذّر العثور على الصفحة المطلوبة."
        actionLabel="العودة للرئيسية"
        onAction={() => router.replace('/(tabs)')}
      />
    </GScreen>
  );
}
