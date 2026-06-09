/**
 * Shared UI primitives for Ghayth ERP mobile. RTL-first, theme-aware via
 * useColors(). Keep components here to minimise file sprawl.
 */
import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type Tone = "default" | "success" | "warning" | "danger" | "info";

export function ScreenTitle({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.screenTitle, { color: c.text }]}>{children}</Text>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: c.textMuted }]}>{title}</Text>
      {action}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const c = useColors();
  const cardStyle = [
    styles.card,
    { backgroundColor: c.surface, borderColor: c.border, borderRadius: c.radius },
    style,
  ];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [cardStyle, pressed ? styles.pressed : undefined]}
    >
      {children}
    </Pressable>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: IoniconName;
  tone?: Tone;
}) {
  const c = useColors();
  const toneColor = toneToColor(c, tone);
  return (
    <Card style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: toneToBg(c, tone) }]}>
        <Ionicons name={icon} size={20} color={toneColor} />
      </View>
      <Text style={[styles.statValue, { color: c.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

export function ListRow({
  title,
  subtitle,
  leftIcon,
  badge,
  onPress,
}: {
  title: string;
  subtitle?: string;
  leftIcon?: IoniconName;
  badge?: ReactNode;
  onPress?: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.listRow,
        { backgroundColor: c.surface, borderColor: c.border, borderRadius: c.radius },
        pressed && onPress ? styles.pressed : undefined,
      ]}
    >
      {leftIcon ? (
        <View style={[styles.rowIcon, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name={leftIcon} size={18} color={c.primary} />
        </View>
      ) : null}
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: c.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge}
      {onPress ? <Ionicons name="chevron-back" size={18} color={c.textFaint} /> : null}
    </Pressable>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.detailRow, { borderColor: c.border }]}>
      <Text style={[styles.detailLabel, { color: c.textMuted }]}>{label}</Text>
      <View style={styles.detailValue}>
        {typeof value === "string" || typeof value === "number" ? (
          <Text style={[styles.detailValueText, { color: c.text }]}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

export function Badge({ label, tone = "default" }: { label: string; tone?: Tone }) {
  const c = useColors();
  return (
    <View style={[styles.badge, { backgroundColor: toneToBg(c, tone) }]}>
      <Text style={[styles.badgeText, { color: toneToColor(c, tone) }]}>{label}</Text>
    </View>
  );
}

export function AppButton({
  title,
  onPress,
  icon,
  variant = "primary",
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  icon?: IoniconName;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary" ? c.primary : variant === "danger" ? c.danger : variant === "secondary" ? c.surfaceAlt : "transparent";
  const fg =
    variant === "primary" || variant === "danger" ? c.onPrimary : variant === "secondary" ? c.text : c.primary;
  const handle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress();
  };
  return (
    <Pressable
      onPress={handle}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderRadius: c.radius,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor: c.border,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  error,
  multiline,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: ComponentProps<typeof TextInput>["keyboardType"];
  autoCapitalize?: ComponentProps<typeof TextInput>["autoCapitalize"];
  error?: string;
  multiline?: boolean;
  editable?: boolean;
}) {
  const c = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        editable={editable}
        style={[
          styles.input,
          {
            backgroundColor: editable ? c.surface : c.surfaceAlt,
            borderColor: error ? c.danger : c.border,
            color: c.text,
            borderRadius: c.radius,
            height: multiline ? 96 : 50,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
      />
      {error ? <Text style={[styles.fieldError, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const c = useColors();
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={c.primary} />
      {label ? <Text style={[styles.stateText, { color: c.textMuted }]}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon = "file-tray-outline",
  title,
  message,
}: {
  icon?: IoniconName;
  title: string;
  message?: string;
}) {
  const c = useColors();
  return (
    <View style={styles.centered}>
      <Ionicons name={icon} size={48} color={c.textFaint} />
      <Text style={[styles.stateTitle, { color: c.text }]}>{title}</Text>
      {message ? <Text style={[styles.stateText, { color: c.textMuted }]}>{message}</Text> : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const c = useColors();
  return (
    <View style={styles.centered}>
      <Ionicons name="cloud-offline-outline" size={48} color={c.danger} />
      <Text style={[styles.stateTitle, { color: c.text }]}>تعذّر تحميل البيانات</Text>
      <Text style={[styles.stateText, { color: c.textMuted }]}>
        {message || "حدث خطأ غير متوقع. تحقّق من اتصالك وحاول مرة أخرى."}
      </Text>
      {onRetry ? (
        <View style={styles.retryBtn}>
          <AppButton title="إعادة المحاولة" icon="refresh-outline" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

function toneToColor(c: ReturnType<typeof useColors>, tone: Tone): string {
  switch (tone) {
    case "success":
      return c.success;
    case "warning":
      return c.warning;
    case "danger":
      return c.danger;
    case "info":
      return c.info;
    default:
      return c.primary;
  }
}

function toneToBg(c: ReturnType<typeof useColors>, tone: Tone): string {
  switch (tone) {
    case "success":
      return c.successBg;
    case "warning":
      return c.warningBg;
    case "danger":
      return c.dangerBg;
    case "info":
      return c.infoBg;
    default:
      return c.surfaceAlt;
  }
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: 26, fontWeight: "700", textAlign: "right" },
  sectionHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: "600", textAlign: "right", letterSpacing: 0.3 },
  card: { padding: 16, borderWidth: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  statCard: { flex: 1, gap: 8, alignItems: "flex-end" },
  statIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  statLabel: { fontSize: 12, fontWeight: "400", textAlign: "right" },
  listRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: "600", textAlign: "right" },
  rowSubtitle: { fontSize: 13, fontWeight: "400", textAlign: "right" },
  detailRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: { fontSize: 13, fontWeight: "400", textAlign: "right" },
  detailValue: { flexShrink: 1, alignItems: "flex-start" },
  detailValueText: { fontSize: 14, fontWeight: "600", textAlign: "left" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  button: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    paddingHorizontal: 18,
  },
  buttonText: { fontSize: 15, fontWeight: "600" },
  field: { gap: 6, marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: "600", textAlign: "right" },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "400",
    textAlign: "right",
  },
  fieldError: { fontSize: 12, fontWeight: "400", textAlign: "right" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, minHeight: 280 },
  stateTitle: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  stateText: { fontSize: 14, fontWeight: "400", textAlign: "center", lineHeight: 21 },
  retryBtn: { marginTop: 8, minWidth: 180 },
});
