import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  PageShell,
  FormShell,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormCheckboxField,
  FormGrid,
  FormSection,
} from "@workspace/ui-core";
import { LoadingSpinner } from "@/components/shared/loading-error-states";

const schema = z.object({
  enabled: z.boolean().optional(),
  template: z.string().optional(),
  slug: z
    .string()
    .min(1, "المعرّف مطلوب")
    .regex(/^[a-z0-9-]+$/, "أحرف إنجليزية صغيرة وأرقام وشرطات فقط"),
  customDomain: z.string().optional(),
  brandName: z.string().optional(),
  tagline: z.string().optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  twitter: z.string().optional(),
  instagram: z.string().optional(),
  snapchat: z.string().optional(),
  tiktok: z.string().optional(),
  heroTitle: z.string().optional(),
  heroSubtitle: z.string().optional(),
  heroImageUrl: z.string().optional(),
  aboutTitle: z.string().optional(),
  aboutBody: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsiteSettings() {
  const configQ = useApiQuery<any>(["site-config"], "/site/config");
  const save = useApiMutation<any, any>("/site/config", "PUT", [["site-config"]], {
    successMessage: "تم حفظ إعدادات الموقع",
  });

  if (configQ.isLoading) return <LoadingSpinner />;

  const c = configQ.data ?? {};
  const socials = (c.socials ?? {}) as Record<string, string>;
  const defaults: FormValues = {
    enabled: c.enabled ?? true,
    template: c.template ?? "managed",
    slug: c.slug ?? "",
    customDomain: c.customDomain ?? "",
    brandName: c.brandName ?? "",
    tagline: c.tagline ?? "",
    logoUrl: c.logoUrl ?? "",
    primaryColor: c.primaryColor ?? "",
    phone: c.phone ?? "",
    whatsapp: c.whatsapp ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    twitter: socials.twitter ?? "",
    instagram: socials.instagram ?? "",
    snapchat: socials.snapchat ?? "",
    tiktok: socials.tiktok ?? "",
    heroTitle: c.heroTitle ?? "",
    heroSubtitle: c.heroSubtitle ?? "",
    heroImageUrl: c.heroImageUrl ?? "",
    aboutTitle: c.aboutTitle ?? "",
    aboutBody: c.aboutBody ?? "",
    metaTitle: c.metaTitle ?? "",
    metaDescription: c.metaDescription ?? "",
  };

  return (
    <PageShell
      title="إعدادات الموقع"
      subtitle="التحكم في الموقع الإلكتروني للشركة — التفعيل والقالب والهوية والمحتوى الرئيسي وتحسين محركات البحث"
    >
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel="حفظ إعدادات الموقع"
        onSubmit={async (v) => {
          const { twitter, instagram, snapchat, tiktok, ...rest } = v;
          await save.mutateAsync({
            ...rest,
            socials: {
              ...(twitter ? { twitter } : {}),
              ...(instagram ? { instagram } : {}),
              ...(snapchat ? { snapchat } : {}),
              ...(tiktok ? { tiktok } : {}),
            },
          });
        }}
      >
        <FormSection title="التفعيل والربط">
          <FormCheckboxField name="enabled" label="تفعيل الموقع الإلكتروني" />
          <FormGrid>
            <FormSelectField
              name="template"
              label="القالب"
              options={[
                { value: "managed", label: "مُدار (محتوى من غيث)" },
                { value: "standard", label: "قياسي" },
              ]}
            />
            <FormTextField name="slug" label="المعرّف (slug)" required placeholder="wafd" />
            <FormTextField name="customDomain" label="النطاق المخصّص" placeholder="example.com" />
          </FormGrid>
        </FormSection>

        <FormSection title="الهوية">
          <FormGrid>
            <FormTextField name="brandName" label="اسم العلامة" />
            <FormTextField name="tagline" label="الشعار النصّي" />
            <FormTextField name="logoUrl" label="رابط الشعار" />
            <FormTextField name="primaryColor" label="اللون الأساسي" placeholder="#0a7d3c" />
          </FormGrid>
        </FormSection>

        <FormSection title="بيانات التواصل">
          <FormGrid>
            <FormTextField name="phone" label="الهاتف" />
            <FormTextField name="whatsapp" label="واتساب" />
            <FormTextField name="email" label="البريد الإلكتروني" />
            <FormTextField name="address" label="العنوان" />
          </FormGrid>
        </FormSection>

        <FormSection title="حسابات التواصل الاجتماعي">
          <FormGrid>
            <FormTextField name="twitter" label="تويتر / X" />
            <FormTextField name="instagram" label="إنستغرام" />
            <FormTextField name="snapchat" label="سناب شات" />
            <FormTextField name="tiktok" label="تيك توك" />
          </FormGrid>
        </FormSection>

        <FormSection title="القسم الرئيسي (Hero)">
          <FormTextField name="heroTitle" label="العنوان الرئيسي" />
          <FormTextField name="heroSubtitle" label="العنوان الفرعي" />
          <FormTextField name="heroImageUrl" label="رابط صورة الخلفية" />
        </FormSection>

        <FormSection title="من نحن">
          <FormTextField name="aboutTitle" label="العنوان" />
          <FormTextareaField name="aboutBody" label="النص" rows={4} />
        </FormSection>

        <FormSection title="تحسين محركات البحث (SEO)">
          <FormTextField name="metaTitle" label="عنوان الصفحة (Meta Title)" />
          <FormTextareaField name="metaDescription" label="وصف الصفحة (Meta Description)" rows={2} />
        </FormSection>
      </FormShell>
    </PageShell>
  );
}
