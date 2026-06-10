/**
 * Config-driven create/edit form engine. Renders inputs from a section's
 * `createFields` / `editFields` config (text / textarea / number / currency /
 * date / select / status / reference), runs light Arabic client-side validation,
 * and POSTs (create) or PATCHes (edit) via the shared Bearer apiFetch. The
 * server remains the source of truth — 422 field errors are mapped back inline.
 */
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Card, FormField, LoadingState } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { apiErrorMessage, apiFetch, apiFieldErrors } from "@/lib/api";
import { asList } from "@/lib/list";
import {
  createEndpointFor,
  detailEndpointFor,
  getSection,
  updateEndpointFor,
  type FormFieldDef,
  type ModuleSection,
} from "@/lib/moduleSections";

type Values = Record<string, string>;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function unwrapRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
      return obj.data as Record<string, unknown>;
    }
    return obj;
  }
  return {};
}

export default function RecordFormScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { module, section, id } = useLocalSearchParams<{ module: string; section: string; id?: string }>();

  const def = getSection(module, section);
  const isEdit = !!id;
  const fields = useMemo<FormFieldDef[]>(
    () => (isEdit ? def?.write?.editFields : def?.write?.createFields) ?? [],
    [def, isEdit],
  );

  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const setValue = (name: string, v: string) => setValues((prev) => ({ ...prev, [name]: v }));

  // Edit mode: load the existing record to prefill the inputs.
  const recordQuery = useQuery({
    queryKey: ["record", module, section, id],
    queryFn: () => apiFetch(detailEndpointFor(def!, id!)),
    enabled: !!def && isEdit,
  });

  useEffect(() => {
    if (!isEdit || !recordQuery.data) return;
    const row = unwrapRecord(recordQuery.data);
    const next: Values = {};
    for (const f of fields) {
      const raw = row[f.name];
      if (raw !== null && raw !== undefined) next[f.name] = String(raw);
    }
    setValues(next);
  }, [isEdit, recordQuery.data, fields]);

  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? apiFetch(updateEndpointFor(def!, id!), { method: def!.write?.updateMethod ?? "PATCH", body })
        : apiFetch(createEndpointFor(def!), { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["section", module, section] });
      if (isEdit) qc.invalidateQueries({ queryKey: ["record", module, section, id] });
      Alert.alert("تم", isEdit ? "تم حفظ التعديلات" : "تم إنشاء السجل بنجاح", [
        { text: "حسنًا", onPress: () => router.back() },
      ]);
    },
    onError: (e) => {
      const fieldErrs = apiFieldErrors(e);
      if (Object.keys(fieldErrs).length) setErrors((prev) => ({ ...prev, ...fieldErrs }));
      setFormError(apiErrorMessage(e));
    },
  });

  if (!def || !def.write || fields.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: "نموذج" }} />
        <View style={styles.center}>
          <Ionicons name="construct-outline" size={42} color={c.textFaint} />
          <Text style={{ color: c.textMuted, marginTop: 10 }}>هذا القسم لا يدعم هذا الإجراء.</Text>
        </View>
      </View>
    );
  }

  if (isEdit && recordQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: "تعديل" }} />
        <LoadingState label="جارٍ تحميل البيانات…" />
      </View>
    );
  }

  const validate = (): Record<string, unknown> | null => {
    const fieldErrs: Record<string, string> = {};
    const body: Record<string, unknown> = {};

    for (const f of fields) {
      const raw = (values[f.name] ?? "").trim();
      if (!raw) {
        if (f.required) fieldErrs[f.name] = "هذا الحقل مطلوب";
        continue;
      }
      if (f.type === "number" || f.type === "currency") {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          fieldErrs[f.name] = "أدخل رقمًا صالحًا";
          continue;
        }
        body[f.name] = n;
      } else if (f.type === "date") {
        if (!DATE_RE.test(raw)) {
          fieldErrs[f.name] = "صيغة التاريخ يجب أن تكون YYYY-MM-DD";
          continue;
        }
        body[f.name] = raw;
      } else if (f.type === "reference") {
        if (f.refValueIsString) {
          // Code-based reference (e.g. account `code`): the server schema
          // expects a string, so never coerce to Number.
          body[f.name] = raw;
        } else {
          const n = Number(raw);
          body[f.name] = Number.isFinite(n) && String(n) === raw ? n : raw;
        }
      } else if (f.type === "file") {
        // The file field stores the uploaded object's metadata as a JSON blob.
        // Spread it into the body so `fileName` / `fileSize` / `mimeType` /
        // `storageKey` reach the `/api/documents/upload` contract directly.
        try {
          const meta = JSON.parse(raw) as Record<string, unknown>;
          Object.assign(body, meta);
        } catch {
          fieldErrs[f.name] = "تعذّر رفع الملف، حاول مرة أخرى";
          continue;
        }
      } else {
        body[f.name] = raw;
      }
    }

    if (Object.keys(fieldErrs).length) {
      setErrors(fieldErrs);
      return null;
    }
    return body;
  };

  const onSubmit = () => {
    setFormError(null);
    setErrors({});
    const body = validate();
    if (!body) return;
    submit.mutate(body);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: isEdit ? `تعديل ${def.label}` : `إضافة ${def.label}` }} />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          {fields.map((f) => (
            <FieldInput
              key={f.name}
              field={f}
              value={values[f.name] ?? ""}
              error={errors[f.name]}
              onChange={(v) => setValue(f.name, v)}
            />
          ))}

          {formError ? (
            <View style={[styles.errorBox, { backgroundColor: c.dangerBg }]}>
              <Ionicons name="alert-circle-outline" size={18} color={c.danger} />
              <Text style={[styles.errorText, { color: c.danger }]}>{formError}</Text>
            </View>
          ) : null}

          <View style={{ marginTop: 6 }}>
            <AppButton
              title={isEdit ? "حفظ التعديلات" : "حفظ"}
              icon="checkmark-circle-outline"
              onPress={onSubmit}
              loading={submit.isPending}
            />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Per-field input ─────────────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: FormFieldDef;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "reference") {
    return <ReferenceField field={field} value={value} error={error} onChange={onChange} />;
  }
  if (field.type === "select" || field.type === "status") {
    return <ChoiceField label={field.label} options={field.options ?? []} value={value} error={error} onChange={onChange} required={field.required} />;
  }
  if (field.type === "file") {
    return <FileField field={field} value={value} error={error} onChange={onChange} />;
  }
  const keyboardType =
    field.type === "number" || field.type === "currency"
      ? ("decimal-pad" as const)
      : field.type === "date"
        ? ("numbers-and-punctuation" as const)
        : undefined;
  return (
    <FormField
      label={field.required ? `${field.label} *` : field.label}
      value={value}
      onChangeText={onChange}
      placeholder={field.placeholder ?? (field.type === "date" ? "YYYY-MM-DD" : undefined)}
      keyboardType={keyboardType}
      autoCapitalize={field.type === "date" ? "none" : undefined}
      multiline={field.type === "textarea"}
      error={error}
    />
  );
}

function ChoiceField({
  label,
  options,
  value,
  error,
  onChange,
  required,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  error?: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 14, gap: 6 }}>
      <Text style={[styles.label, { color: c.textMuted }]}>{required ? `${label} *` : label}</Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(active ? "" : o.value)}
              style={[styles.chip, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.surface }]}
            >
              <Text style={{ color: active ? c.onPrimary : c.text, fontWeight: "600" }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={[styles.errorInline, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

function ReferenceField({
  field,
  value,
  error,
  onChange,
}: {
  field: FormFieldDef;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const c = useColors();
  const valueField = field.refValueField ?? "id";
  const labelFields = field.refLabelFields ?? ["name"];

  const q = useQuery({
    queryKey: ["ref-options", field.refEndpoint],
    queryFn: () => apiFetch(field.refEndpoint!, { query: { page: 1, limit: 50 } }),
    enabled: !!field.refEndpoint,
  });

  const rows = asList<Record<string, unknown>>(q.data);
  const options = rows
    .map((r) => {
      const v = r[valueField];
      if (v === null || v === undefined) return null;
      const lbl = labelFields.map((lf) => r[lf]).find((x) => x !== null && x !== undefined && x !== "");
      return { value: String(v), label: String(lbl ?? v) };
    })
    .filter((o): o is { value: string; label: string } => o !== null);

  return (
    <View style={{ marginBottom: 14, gap: 6 }}>
      <Text style={[styles.label, { color: c.textMuted }]}>{field.required ? `${field.label} *` : field.label}</Text>
      {q.isLoading ? (
        <Text style={{ color: c.textFaint, fontSize: 13 }}>جارٍ تحميل الخيارات…</Text>
      ) : q.isError ? (
        <Text style={{ color: c.danger, fontSize: 13 }}>تعذّر تحميل الخيارات</Text>
      ) : options.length === 0 ? (
        <Text style={{ color: c.textFaint, fontSize: 13 }}>لا توجد خيارات متاحة</Text>
      ) : (
        <View style={styles.chips}>
          {options.map((o) => {
            const active = value === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => onChange(active ? "" : o.value)}
                style={[styles.chip, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.surface }]}
              >
                <Text style={{ color: active ? c.onPrimary : c.text, fontWeight: "600" }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {error ? <Text style={[styles.errorInline, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

/** Allowed upload content types (mirror of the server's ALLOWED_CONTENT_TYPES). */
const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
];

/**
 * File picker → object-storage upload field. Picks a document, requests a
 * presigned upload URL, PUTs the bytes, then stashes the resulting object
 * metadata as a JSON value. `validate()` spreads that into the create body so
 * the server's `/api/documents/upload` contract (storageKey/fileName/…) is met.
 */
function FileField({
  field,
  value,
  error,
  onChange,
}: {
  field: FormFieldDef;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  let pickedName: string | null = null;
  if (value) {
    try {
      pickedName = String((JSON.parse(value) as { fileName?: unknown }).fileName ?? "ملف مرفوع");
    } catch {
      pickedName = null;
    }
  }

  const pick = async () => {
    setLocalError(null);
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_UPLOAD_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const contentType = asset.mimeType ?? "application/octet-stream";
      if (!ALLOWED_UPLOAD_TYPES.includes(contentType)) {
        setLocalError("نوع الملف غير مسموح به (PDF، Word، Excel، صور، نصوص)");
        return;
      }
      setBusy(true);
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        { method: "POST", body: { name: asset.name, size: asset.size ?? 0, contentType } },
      );
      const fileResp = await fetch(asset.uri);
      const blob = await fileResp.blob();
      const put = await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": contentType } });
      if (!put.ok) {
        setLocalError("تعذّر رفع الملف إلى الخادم");
        return;
      }
      onChange(
        JSON.stringify({
          fileName: asset.name,
          fileSize: asset.size ?? 0,
          mimeType: contentType,
          storageKey: objectPath,
        }),
      );
    } catch (e) {
      setLocalError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = error ?? localError ?? undefined;
  return (
    <View style={{ marginBottom: 14, gap: 6 }}>
      <Text style={[styles.label, { color: c.textMuted }]}>{field.required ? `${field.label} *` : field.label}</Text>
      <Pressable
        onPress={pick}
        disabled={busy}
        style={[styles.fileBtn, { borderColor: c.border, backgroundColor: c.surface, opacity: busy ? 0.6 : 1 }]}
      >
        <Ionicons name={pickedName ? "document-attach-outline" : "cloud-upload-outline"} size={20} color={c.primary} />
        <Text style={{ color: pickedName ? c.text : c.textFaint, flex: 1, textAlign: "right" }} numberOfLines={1}>
          {busy ? "جارٍ الرفع…" : (pickedName ?? "اختر ملفًا للرفع")}
        </Text>
      </Pressable>
      {shown ? <Text style={[styles.errorInline, { color: c.danger }]}>{shown}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  label: { fontSize: 13, fontWeight: "600", textAlign: "right" },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  errorBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, marginBottom: 6 },
  errorText: { flex: 1, fontSize: 13, textAlign: "right" },
  errorInline: { fontSize: 12, textAlign: "right" },
  fileBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, borderWidth: 1 },
});
