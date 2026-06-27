import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useColors } from '@/hooks/useColors';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface TabDef {
  name: string;
  title: string;
  icon: IoniconName;
  iconFocused: IoniconName;
}

const TABS: TabDef[] = [
  { name: 'index',        title: 'لوحة القيادة',  icon: 'grid-outline',                     iconFocused: 'grid' },
  { name: 'me',           title: 'مساحتي',         icon: 'person-circle-outline',             iconFocused: 'person-circle' },
  { name: 'approvals',    title: 'الاعتماد',        icon: 'checkmark-done-circle-outline',     iconFocused: 'checkmark-done-circle' },
  { name: 'notifications',title: 'الإشعارات',      icon: 'notifications-outline',             iconFocused: 'notifications' },
  { name: 'modules',      title: 'الوحدات',         icon: 'apps-outline',                     iconFocused: 'apps' },
];

export default function TabsLayout() {
  const c = useColors();

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
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? tab.iconFocused : tab.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
