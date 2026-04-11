import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function runSystemAudit({
  issueDescription = "",
  codeSnippet = "",
  logs = "",
  context = "",
}) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 3000,
    system: `
أنت حارس تقني وتشغيلي صارم لنظام مؤسسي.
مهمتك:
- اكتشاف الأخطاء الحرجة
- كشف النواقص الوظيفية
- كشف التعارضات المعمارية
- كشف مشاكل التكامل بين الواجهة والـ API
- كشف مشاكل الصلاحيات والحماية
- اقتراح إصلاحات عملية مرتبة بالأولوية

لا تفترض أشياء غير موجودة.
أخرج النتيجة بهذا الشكل:
1. ملخص الحالة
2. الأخطاء الحرجة
3. النواقص الوظيفية
4. المخاطر المعمارية
5. سبب كل مشكلة
6. الأثر
7. الإصلاح المقترح
8. الأولوية
`,
    messages: [
      {
        role: "user",
        content: `
[وصف المشكلة]
${issueDescription}

[الكود]
${codeSnippet}

[السجلات]
${logs}

[سياق إضافي]
${context}
        `,
      },
    ],
  });

  return response.content;
}
