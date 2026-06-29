/**
 * محرك نموذج config-driven — إنشاء / تعديل سجل
 * يحوّل حقول FormFieldDef إلى مدخلات عربية مع تحقق خفيف
 * الخادم هو المرجع النهائي — أخطاء 422 تُعرض inline
 */
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GCard, GButton, GInput, GSelect, GLoadingState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/hooks/useApi';
import { takePhoto } from '@/hooks/useNative';
import {
  createEndpointFor,
  detailEndpointFor,
  getSection,
  updateEndpointFor,
  type FormFieldDef,
} from '@/lib/moduleSections';

type Values = Record<string, string>;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asList<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    for (const k of ['data', 'items', 'rows', 'results']) {
      if (Array.isArray(d[k])) return d[k] as T[];
    }
  }
  return [];
}

function unwrapRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
      return obj.data as Record<string, unknown>;
    }
    return obj;
  }
  return {};
}

function apiErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'حدث خطأ غير متوقع';
}

function apiFieldErrors(e: unknown): Record<string, string> {
  if (e && typeof e === 'object') {
    const err = e as { fieldErrors?: Record<string, string>; errors?: Record<string, string> };
    return err.fieldErrors ?? err.errors ?? {};
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
  const setValue = (name: string, v: string) => setValues(prev => ({ ...prev, [name]: v }));

  const recordQuery = useQuery({
    queryKey: ['record', module, section, id],
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
        ? apiFetch(updateEndpointFor(def!, id!), { method: def!.write?.updateMethod ?? 'PATCH', body: JSON.stringify(body) })
        : apiFetch(createEndpointFor(def!), { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['section', module, section] });
      if (isEdit) qc.invalidateQueries({ queryKey: ['record', module, section, id] });
      Alert.alert('تم', isEdit ? 'تم حفظ التعديلات' : 'تم إنشاء السجل بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    },
    onError: (e) => {
      const fieldErrs = apiFieldErrors(e);
      if (Object.keys(fieldErrs).length) setErrors(prev => ({ ...prev, ...fieldErrs }));
      setFormError(apiErrorMessage(e));
    },
  });

  if (!def || !def.write || fields.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: 'نموذج' }} />
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
        <Stack.Screen options={{ title: 'تعديل' }} />
        <GLoadingState text="جارٍ تحميل البيانات…" />
      </View>
    );
  }

  const validate = (): Record<string, unknown> | null => {
    const fieldErrs: Record<string, string> = {};
    const body: Record<string, unknown> = {};

    for (const f of fields) {
      const raw = (values[f.name] ?? '').trim();
      if (!raw) {
        if (f.required) fieldErrs[f.name] = 'هذا الحقل مطلوب';
        continue;
      }
      if (f.type === 'number' || f.type === 'currency') {
        const n = Number(raw);
        if (!Number.isFinite(n)) { fieldErrs[f.name] = 'أدخل رقمًا صالحًا'; continue; }
        body[f.name] = n;
      } else if (f.type === 'date') {
        if (!DATE_RE.test(raw)) { fieldErrs[f.name] = 'صيغة التاريخ يجب أن تكون YYYY-MM-DD'; continue; }
        body[f.name] = raw;
      } else if (f.type === 'reference') {
        if (f.refValueIsString) { body[f.name] = raw; }
        else { const n = Number(raw); body[f.name] = Number.isFinite(n) && String(n) === raw ? n : raw; }
      } else if (f.type === 'file') {
        // raw contains JSON like {"base64":"...","mimeType":"..."} set by FileField
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          Object.assign(body, parsed);
        } catch {
          fieldErrs[f.name] = 'يرجى اختيار ملف أولًا';
          continue;
        }
      } else {
        body[f.name] = raw;
      }
    }

    if (Object.keys(fieldErrs).length) { setErrors(fieldErrs); return null; }
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: isEdit ? `تعديل ${def.label}` : `إضافة ${def.label}` }} />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <GCard>
          {fields.map(f => (
            <FieldInput
              key={f.name}
              field={f}
              value={values[f.name] ?? ''}
              error={errors[f.name]}
              onChange={v => setValue(f.name, v)}
            />
          ))}

          {formError ? (
            <View style={[styles.errorBox, { backgroundColor: c.dangerSurface }]}>
              <Ionicons name="alert-circle-outline" size={18} color={c.danger} />
              <Text style={[styles.errorText, { color: c.danger }]}>{formError}</Text>
            </View>
          ) : null}

          <GButton
            title={isEdit ? 'حفظ التعديلات' : 'حفظ'}
            icon="checkmark-circle-outline"
            onPress={onSubmit}
            loading={submit.isPending}
            style={{ marginTop: 6 }}
          />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── مدخل حقل ─────────────────────────────────────────────────────────────────

function FileField({ field, value, error, onChange }: {
  field: FormFieldDef; value: string; error?: string; onChange: (v: string) => void;
}) {
  const c = useColors();
  const [picking, setPicking] = useState(false);
  let parsed: { mimeType?: string; base64?: string } | null = null;
  try { parsed = value ? JSON.parse(value) as { mimeType?: string; base64?: string } : null; } catch { /* ignore */ }
  const hasFile = !!parsed?.base64;

  const pick = async () => {
    setPicking(true);
    try {
      const result = await takePhoto();
      if (result) {
        onChange(JSON.stringify({ base64: result.base64, mimeType: result.mimeType }));
      }
    } finally {
      setPicking(false);
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 6, textAlign: 'right' }}>
        {field.required ? `${field.label} *` : field.label}
      </Text>
      {hasFile ? (
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
          <Text style={{ color: c.text, fontSize: 13 }}>تم اختيار الملف</Text>
          <Pressable onPress={() => onChange('')}>
            <Ionicons name="close-circle-outline" size={18} color={c.danger} />
          </Pressable>
        </View>
      ) : (
        <GButton
          title="اختر صورة / ملف"
          icon="camera-outline"
          variant="secondary"
          loading={picking}
          onPress={pick}
        />
      )}
      {error ? <Text style={{ color: c.danger, fontSize: 12, marginTop: 4, textAlign: 'right' }}>{error}</Text> : null}
    </View>
  );
}

function FieldInput({ field, value, error, onChange }: {
  field: FormFieldDef; value: string; error?: string; onChange: (v: string) => void;
}) {
  if (field.type === 'file') {
    return <FileField field={field} value={value} error={error} onChange={onChange} />;
  }
  if (field.type === 'reference') {
    return <ReferenceField field={field} value={value} error={error} onChange={onChange} />;
  }
  if (field.type === 'select' || field.type === 'status') {
    return (
      <GSelect
        label={field.required ? `${field.label} *` : field.label}
        value={value}
        onChange={onChange}
        options={field.options ?? []}
        placeholder="اختر..."
        error={error}
      />
    );
  }
  const keyboardType =
    field.type === 'number' || field.type === 'currency' ? 'decimal-pad' as const
    : field.type === 'date' ? 'numbers-and-punctuation' as const
    : undefined;
  return (
    <GInput
      label={field.required ? `${field.label} *` : field.label}
      value={value}
      onChangeText={onChange}
      placeholder={field.placeholder ?? (field.type === 'date' ? 'YYYY-MM-DD' : undefined)}
      keyboardType={keyboardType}
      autoCapitalize="none"
      multiline={field.type === 'textarea'}
      error={error}
    />
  );
}

function ReferenceField({ field, value, error, onChange }: {
  field: FormFieldDef; value: string; error?: string; onChange: (v: string) => void;
}) {
  const c = useColors();
  const valueField = field.refValueField ?? 'id';
  const labelFields = field.refLabelFields ?? ['name'];

  const q = useQuery({
    queryKey: ['ref-options', field.refEndpoint],
    queryFn: () => apiFetch(field.refEndpoint!, { params: { page: 1, limit: 50 } }),
    enabled: !!field.refEndpoint,
  });

  const rows = asList<Record<string, unknown>>(q.data);
  const options = rows
    .map(r => {
      const v = r[valueField];
      if (v === null || v === undefined) return null;
      const lbl = labelFields.map(lf => r[lf]).find(x => x !== null && x !== undefined && x !== '');
      return { value: String(v), label: String(lbl ?? v) };
    })
    .filter((o): o is { value: string; label: string } => o !== null);

  if (q.isLoading) return <Text style={{ color: c.textFaint, fontSize: 13, marginBottom: 12, textAlign: 'right' }}>جارٍ تحميل الخيارات…</Text>;
  if (q.isError) return <Text style={{ color: c.danger, fontSize: 13, marginBottom: 12, textAlign: 'right' }}>تعذّر تحميل الخيارات</Text>;

  return (
    <GSelect
      label={field.required ? `${field.label} *` : field.label}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="اختر..."
      error={error}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 6 },
  errorText: { flex: 1, fontSize: 13, textAlign: 'right' },
});
