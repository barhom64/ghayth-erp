import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, ListRow } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { NAV_MODULES } from "@/lib/modules";
import { getModuleDef } from "@/lib/moduleSections";

export default function ModuleHubScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();

  const mod = NAV_MODULES.find((m) => m.key === key);
  const def = getModuleDef(key);

  // Module without a native section config → keep the "coming soon" placeholder.
  if (!def) {
    return (
      <View style={[styles.placeholder, { backgroundColor: c.bg, paddingBottom: insets.bottom + 24 }]}>
        <Stack.Screen options={{ title: mod?.label ?? "وحدة" }} />
        <View style={[styles.iconWrap, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name={mod?.icon ?? "cube-outline"} size={44} color={c.primary} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>{mod?.label ?? "هذه الوحدة"}</Text>
        <Text style={[styles.body, { color: c.textMuted }]}>
          هذه الوحدة قيد الإطلاق على تطبيق الجوال وستتوفر هنا قريبًا.
        </Text>
        <View style={{ width: "100%", marginTop: 8 }}>
          <AppButton title="رجوع" icon="arrow-forward-outline" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
    >
      <Stack.Screen options={{ title: def.label }} />
      {def.sections.map((s) => (
        <ListRow
          key={s.key}
          leftIcon={s.icon}
          title={s.label}
          onPress={() => router.push({ pathname: "/m/[module]/[section]", params: { module: def.key, section: s.key } })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, flexGrow: 1 },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  iconWrap: { width: 96, height: 96, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 15, lineHeight: 24, textAlign: "center" },
});
