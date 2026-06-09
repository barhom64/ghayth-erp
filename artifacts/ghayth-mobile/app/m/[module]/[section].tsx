import { useQuery } from "@tanstack/react-query";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, EmptyState, ErrorState, ListRow, LoadingState } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/api";
import { useColors } from "@/hooks/useColors";
import { formatCurrency, formatDateAr } from "@/lib/format";
import { asList } from "@/lib/list";
import { getSection, pickField, statusBadge } from "@/lib/moduleSections";
import { setRecord } from "@/lib/recordStore";

type Row = Record<string, unknown>;

export default function SectionListScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { module, section } = useLocalSearchParams<{ module: string; section: string }>();

  const def = getSection(module, section);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["section", module, section],
    queryFn: () => apiFetch(def!.endpoint, { query: { page: 1, limit: 20 } }),
    enabled: !!def,
  });

  useFocusEffect(useCallback(() => { if (def) refetch(); }, [def, refetch]));

  if (!def) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: "قسم غير معروف" }} />
        <EmptyState icon="help-circle-outline" title="قسم غير معروف" message="تعذّر العثور على هذا القسم." />
      </View>
    );
  }

  const rows = asList<Row>(data);

  const buildSubtitle = (item: Row): string | undefined => {
    const parts: string[] = [];
    const amount = pickField(item, def.amountFields);
    if (amount !== null) parts.push(formatCurrency(amount));
    for (const f of def.subtitleFields ?? []) {
      const v = item[f];
      if (v !== null && v !== undefined && v !== "") parts.push(String(v));
    }
    const date = pickField(item, def.dateFields);
    if (date !== null) parts.push(formatDateAr(date));
    return parts.length ? parts.join(" · ") : undefined;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: def.label }} />
      {isLoading ? (
        <LoadingState label="جارٍ التحميل…" />
      ) : isError ? (
        <ErrorState message={error instanceof ApiError ? error.message : undefined} onRetry={refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.id ?? i)}
          contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
          refreshing={isFetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <EmptyState icon={def.icon} title="لا توجد بيانات" message={`لا توجد سجلات في ${def.label} بعد.`} />
          }
          renderItem={({ item }) => {
            const title = pickField(item, def.titleFields) ?? `#${item.id ?? ""}`;
            const st = def.statusField ? statusBadge(pickField(item, [def.statusField])) : null;
            return (
              <ListRow
                leftIcon={def.icon}
                title={title}
                subtitle={buildSubtitle(item)}
                badge={st ? <Badge label={st.label} tone={st.tone} /> : undefined}
                onPress={() => {
                  setRecord({ title, row: item });
                  router.push("/record");
                }}
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, flexGrow: 1 },
});
