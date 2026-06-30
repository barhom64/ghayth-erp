import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { canApprove } from '@/lib/modules';
import { useList } from '@/hooks/useApi';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface TabDef {
  name: string;
  title: string;
  icon: IoniconName;
  iconFocused: IoniconName;
  requiresApproval?: boolean;
}

interface NotifResponse { data?: { isRead: boolean }[]; total?: number }
interface MySpaceData { pendingApprovals?: { length?: number } | number | null }

const TABS: TabDef[] = [
  { name: 'index',         title: 'لوحة القيادة', icon: 'grid-outline',                  iconFocused: 'grid' },
  { name: 'me',            title: 'مساحتي',        icon: 'person-circle-outline',         iconFocused: 'person-circle' },
  { name: 'approvals',     title: 'الاعتماد',       icon: 'checkmark-done-circle-outline', iconFocused: 'checkmark-done-circle', requiresApproval: true },
  { name: 'notifications', title: 'الإشعارات',     icon: 'notifications-outline',         iconFocused: 'notifications' },
  { name: 'modules',       title: 'الوحدات',        icon: 'apps-outline',                  iconFocused: 'apps' },
];

export default function TabsLayout() {
  const c = useColors();
  const { user } = useAuth();
  const hasApproval = canApprove(user?.userRoles);
  const { data: notifData } = useList<NotifResponse>('/api/notifications', { pageSize: 50 });
  const unreadCount = (notifData?.data ?? []).filter(n => !n.isRead).length;
  const { data: mySpace } = useList<MySpaceData>('/api/my-space', undefined, { enabled: hasApproval });
  const pendingCount = (() => {
    const pa = mySpace?.pendingApprovals;
    if (typeof pa === 'number') return pa;
    if (Array.isArray(pa)) return pa.length;
    return 0;
  })();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            href: tab.requiresApproval && !hasApproval ? null : undefined,
            tabBarBadge: tab.name === 'notifications' && unreadCount > 0
              ? unreadCount
              : tab.name === 'approvals' && pendingCount > 0
              ? pendingCount
              : undefined,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? tab.iconFocused : tab.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
