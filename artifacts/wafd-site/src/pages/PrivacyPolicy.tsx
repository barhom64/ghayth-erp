/**
 * صفحة سياسة الخصوصية — متعددة اللغات
 * تشمل: جمع البيانات، الاستخدام، الحماية، حقوق المستخدم، التواصل
 */
import DOMPurify from "dompurify";
import { Link } from "wouter";
import { Shield, Lock, Eye, UserCheck, Mail, Phone, ChevronLeft, FileText } from "lucide-react";
import { WAFD_EMAIL, WAFD_PHONE_DISPLAY } from "../lib/wafd-constants";
import { useLanguage } from "@/contexts/LanguageContext";

const LOGO_WHITE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png";

export default function PrivacyPolicy() {
  const { t, dir } = useLanguage();

  const LAST_UPDATED = t.privacy.lastUpdated;

  const sections = dir === "rtl" ? [
    {
      id: "intro",
      icon: <FileText size={20} />,
      title: "مقدمة",
      content: `تلتزم شركة وفد لخدمة ضيوف الرحمن بحماية خصوصيتك وصون بياناتك الشخصية. تصف هذه السياسة كيفية جمع معلوماتك واستخدامها وحمايتها عند استخدامك لموقعنا الإلكتروني wafd.life أو التواصل معنا عبر أي قناة من قنواتنا.

بزيارتك لموقعنا أو تقديمك لطلب خدمة، فإنك توافق على الشروط الواردة في هذه السياسة. إذا كنت لا توافق على أي بند من هذه البنود، يُرجى عدم استخدام موقعنا.`,
    },
    {
      id: "collect",
      icon: <Eye size={20} />,
      title: "البيانات التي نجمعها",
      content: `نجمع أنواعاً مختلفة من المعلومات لتقديم خدماتنا بشكل أفضل:

**البيانات التي تقدمها مباشرة:**
• الاسم الكامل ورقم الهاتف وعنوان البريد الإلكتروني عند تعبئة نماذج الاستفسار أو الحجز.
• تفاصيل الخدمة المطلوبة (نوع التأشيرة، الفندق، النقل، البرنامج).
• أي ملاحظات أو متطلبات خاصة تذكرها في نموذج الطلب.

**البيانات التي نجمعها تلقائياً:**
• بيانات الزيارة مثل عنوان IP، نوع المتصفح، الصفحات المزارة، ومدة الجلسة — لأغراض تحليل الأداء وتحسين تجربة المستخدم.
• ملفات تعريف الارتباط (Cookies) الضرورية لتشغيل الموقع بشكل صحيح.`,
    },
    {
      id: "use",
      icon: <UserCheck size={20} />,
      title: "كيف نستخدم بياناتك",
      content: `نستخدم البيانات التي نجمعها للأغراض التالية حصراً:

• **تقديم الخدمة:** التواصل معك للرد على استفساراتك وتنفيذ طلباتك المتعلقة بالتأشيرات والنقل والفنادق وبرامج العمرة.
• **التواصل:** إرسال تأكيدات الحجز والتذكيرات والتحديثات المتعلقة بطلبك عبر البريد الإلكتروني أو الواتساب.
• **تحسين الخدمة:** تحليل أنماط الاستخدام لتطوير موقعنا وخدماتنا بما يناسب احتياجاتك.
• **الامتثال القانوني:** الوفاء بالالتزامات القانونية والتنظيمية المعمول بها في المملكة العربية السعودية.

**لن نستخدم بياناتك في:**
• البيع أو التأجير لأي طرف ثالث.
• إرسال رسائل تسويقية غير مطلوبة دون موافقتك.
• أي غرض لا يتعلق مباشرة بتقديم خدماتنا لك.`,
    },
    {
      id: "protect",
      icon: <Lock size={20} />,
      title: "حماية بياناتك",
      content: `نتخذ تدابير تقنية وتنظيمية مناسبة لحماية بياناتك الشخصية من الوصول غير المصرح به أو الإفصاح أو التعديل أو الإتلاف، وتشمل:

• **التشفير:** نقل البيانات عبر بروتوكول HTTPS المشفر بالكامل.
• **التخزين الآمن:** حفظ البيانات في قواعد بيانات محمية بكلمات مرور قوية وصلاحيات وصول محدودة.
• **التحكم في الوصول:** لا يمكن الاطلاع على بياناتك إلا للموظفين المخولين الذين يحتاجون إليها لأداء مهامهم.
• **المراجعة الدورية:** نراجع ممارسات الأمان بانتظام للتأكد من فعاليتها.

على الرغم من جهودنا، لا يمكن ضمان الأمان الكامل لأي نظام إلكتروني. في حال اكتشاف أي اختراق يؤثر على بياناتك، سنُبلغك فوراً وفق ما تقتضيه الأنظمة المعمول بها.`,
    },
    {
      id: "sharing",
      icon: <Shield size={20} />,
      title: "مشاركة البيانات مع أطراف ثالثة",
      content: `لا نبيع بياناتك الشخصية ولا نؤجرها لأي طرف ثالث. قد نشارك بياناتك في الحالات التالية فقط:

• **مزودو الخدمة:** شركاء موثوقون يساعدوننا في تقديم الخدمة (مثل شركات الفنادق والنقل) وذلك بالقدر الضروري فقط لإتمام طلبك، ويلتزمون بالحفاظ على سرية بياناتك.
• **المتطلبات القانونية:** عند الضرورة القانونية أو بأمر من جهة حكومية مختصة في المملكة العربية السعودية.
• **حماية الحقوق:** إذا كان الإفصاح ضرورياً لحماية حقوق وفد أو سلامة المستخدمين.`,
    },
    {
      id: "cookies",
      icon: <Eye size={20} />,
      title: "ملفات تعريف الارتباط (Cookies)",
      content: `يستخدم موقعنا ملفات تعريف الارتباط لتحسين تجربتك. تنقسم إلى:

• **ملفات ضرورية:** لازمة لتشغيل الموقع بشكل صحيح ولا يمكن تعطيلها.
• **ملفات الأداء:** تساعدنا على فهم كيفية استخدام الزوار للموقع لتحسينه.
• **ملفات التفضيلات:** تتذكر إعداداتك مثل اللغة والمنطقة الزمنية.

يمكنك التحكم في ملفات تعريف الارتباط من خلال إعدادات متصفحك. تعطيل بعض الملفات قد يؤثر على تجربة استخدام الموقع.`,
    },
    {
      id: "rights",
      icon: <UserCheck size={20} />,
      title: "حقوقك",
      content: `وفقاً للأنظمة المعمول بها، يحق لك:

• **الاطلاع:** طلب نسخة من بياناتك الشخصية التي نحتفظ بها.
• **التصحيح:** طلب تصحيح أي بيانات غير دقيقة أو غير مكتملة.
• **الحذف:** طلب حذف بياناتك الشخصية في الحالات التي يسمح بها النظام.
• **الاعتراض:** الاعتراض على معالجة بياناتك لأغراض تسويقية.
• **سحب الموافقة:** سحب موافقتك على معالجة بياناتك في أي وقت دون أن يؤثر ذلك على مشروعية المعالجة السابقة.

لممارسة أي من هذه الحقوق، تواصل معنا عبر القنوات الموضحة أدناه.`,
    },
    {
      id: "retention",
      icon: <FileText size={20} />,
      title: "مدة الاحتفاظ بالبيانات",
      content: `نحتفظ ببياناتك الشخصية للمدة اللازمة لتحقيق الأغراض الواردة في هذه السياسة، أو وفق ما تقتضيه المتطلبات القانونية والتنظيمية. بعد انتهاء الغرض من الاحتفاظ بها، يتم حذفها أو إخفاء هويتها بشكل آمن.

بوجه عام:
• بيانات طلبات الخدمة: تُحفظ لمدة ٣ سنوات من تاريخ إتمام الخدمة.
• بيانات الاستفسارات غير المكتملة: تُحذف بعد ١٢ شهراً من آخر تواصل.
• سجلات الزيارات: تُحذف تلقائياً بعد ٩٠ يوماً.`,
    },
    {
      id: "children",
      icon: <Shield size={20} />,
      title: "خصوصية الأطفال",
      content: `لا يستهدف موقعنا الأطفال دون سن ١٨ عاماً، ولا نجمع بياناتهم الشخصية عن قصد. إذا علمنا أننا جمعنا بيانات طفل دون موافقة ولي أمره، سنعمل على حذفها فوراً. إذا كنت ولياً للأمر وتعتقد أن طفلك قدّم بياناته لنا، يرجى التواصل معنا.`,
    },
    {
      id: "changes",
      icon: <FileText size={20} />,
      title: "التعديلات على هذه السياسة",
      content: `قد نُحدّث هذه السياسة من وقت لآخر لتعكس التغييرات في ممارساتنا أو المتطلبات القانونية. سنُعلمك بأي تغييرات جوهرية عبر نشر السياسة المحدثة على هذه الصفحة مع تحديث تاريخ "آخر تحديث" في الأعلى. نشجعك على مراجعة هذه الصفحة بانتظام للاطلاع على أحدث نسخة من السياسة.`,
    },
  ] : [
    {
      id: "intro",
      icon: <FileText size={20} />,
      title: "Introduction",
      content: `Wafd Company for Serving the Guests of Allah is committed to protecting your privacy and safeguarding your personal data. This policy describes how we collect, use, and protect your information when you use our website wafd.life or contact us through any of our channels.

By visiting our website or submitting a service request, you agree to the terms set forth in this policy. If you do not agree with any provision, please do not use our website.`,
    },
    {
      id: "collect",
      icon: <Eye size={20} />,
      title: "Data We Collect",
      content: `We collect various types of information to provide our services better:

**Data you provide directly:**
• Full name, phone number, and email address when filling out inquiry or booking forms.
• Details of the requested service (visa type, hotel, transportation, program).
• Any notes or special requirements you mention in the request form.

**Data we collect automatically:**
• Visit data such as IP address, browser type, pages visited, and session duration — for performance analysis and improving user experience.
• Cookies necessary for the website to function properly.`,
    },
    {
      id: "use",
      icon: <UserCheck size={20} />,
      title: "How We Use Your Data",
      content: `We use the data we collect exclusively for the following purposes:

• **Service Delivery:** Communicating with you to respond to your inquiries and fulfill your requests related to visas, transportation, hotels, and Umrah programs.
• **Communication:** Sending booking confirmations, reminders, and updates related to your request via email or WhatsApp.
• **Service Improvement:** Analyzing usage patterns to develop our website and services to suit your needs.
• **Legal Compliance:** Fulfilling legal and regulatory obligations applicable in Saudi Arabia.

**We will NOT use your data for:**
• Selling or renting to any third party.
• Sending unsolicited marketing messages without your consent.
• Any purpose not directly related to providing our services to you.`,
    },
    {
      id: "protect",
      icon: <Lock size={20} />,
      title: "Protecting Your Data",
      content: `We take appropriate technical and organizational measures to protect your personal data from unauthorized access, disclosure, modification, or destruction, including:

• **Encryption:** Data transfer via fully encrypted HTTPS protocol.
• **Secure Storage:** Data stored in databases protected with strong passwords and limited access permissions.
• **Access Control:** Your data can only be accessed by authorized employees who need it to perform their duties.
• **Regular Review:** We regularly review security practices to ensure their effectiveness.

Despite our efforts, complete security of any electronic system cannot be guaranteed. If we discover any breach affecting your data, we will notify you immediately in accordance with applicable regulations.`,
    },
    {
      id: "sharing",
      icon: <Shield size={20} />,
      title: "Data Sharing with Third Parties",
      content: `We do not sell or rent your personal data to any third party. We may share your data only in the following cases:

• **Service Providers:** Trusted partners who help us deliver the service (such as hotel and transportation companies), only to the extent necessary to complete your request, and they are committed to maintaining the confidentiality of your data.
• **Legal Requirements:** When legally required or by order of a competent government authority in Saudi Arabia.
• **Rights Protection:** If disclosure is necessary to protect Wafd's rights or user safety.`,
    },
    {
      id: "cookies",
      icon: <Eye size={20} />,
      title: "Cookies",
      content: `Our website uses cookies to improve your experience. They are divided into:

• **Necessary Cookies:** Required for the website to function properly and cannot be disabled.
• **Performance Cookies:** Help us understand how visitors use the website to improve it.
• **Preference Cookies:** Remember your settings such as language and time zone.

You can control cookies through your browser settings. Disabling some cookies may affect your website experience.`,
    },
    {
      id: "rights",
      icon: <UserCheck size={20} />,
      title: "Your Rights",
      content: `In accordance with applicable regulations, you have the right to:

• **Access:** Request a copy of your personal data we hold.
• **Correction:** Request correction of any inaccurate or incomplete data.
• **Deletion:** Request deletion of your personal data in cases permitted by law.
• **Objection:** Object to the processing of your data for marketing purposes.
• **Withdrawal of Consent:** Withdraw your consent to data processing at any time without affecting the lawfulness of prior processing.

To exercise any of these rights, contact us through the channels listed below.`,
    },
    {
      id: "retention",
      icon: <FileText size={20} />,
      title: "Data Retention Period",
      content: `We retain your personal data for the period necessary to achieve the purposes stated in this policy, or as required by legal and regulatory requirements. After the retention purpose expires, data is securely deleted or anonymized.

Generally:
• Service request data: Retained for 3 years from the date of service completion.
• Incomplete inquiry data: Deleted after 12 months from last contact.
• Visit logs: Automatically deleted after 90 days.`,
    },
    {
      id: "children",
      icon: <Shield size={20} />,
      title: "Children's Privacy",
      content: `Our website does not target children under 18 years of age, and we do not intentionally collect their personal data. If we learn that we have collected data from a child without parental consent, we will work to delete it immediately. If you are a parent and believe your child has submitted data to us, please contact us.`,
    },
    {
      id: "changes",
      icon: <FileText size={20} />,
      title: "Changes to This Policy",
      content: `We may update this policy from time to time to reflect changes in our practices or legal requirements. We will notify you of any material changes by posting the updated policy on this page with an updated "Last Updated" date at the top. We encourage you to review this page regularly to stay informed of the latest version of the policy.`,
    },
  ];

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_80)]" dir={dir}>

      {/* ─── Hero Header ─────────────────────────────────────────────────────── */}
      <div
        className="relative py-20 overflow-hidden"
        style={{ background: "linear-gradient(135deg, oklch(0.14 0.005 0) 0%, oklch(0.22 0.012 185) 100%)" }}
      >
        {/* Decorative circles */}
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full opacity-5"
          style={{ background: "oklch(0.52 0.12 185)", transform: "translate(-30%, -30%)" }} />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full opacity-5"
          style={{ background: "oklch(0.72 0.09 75)", transform: "translate(20%, 20%)" }} />

        <div className="container relative z-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-white/50 text-sm mb-8" style={{ fontFamily: "'Cairo', sans-serif" }}>
            <Link href="/">
              <span className="hover:text-white/80 cursor-pointer transition-colors">
                {t.privacy.home}
              </span>
            </Link>
            <ChevronLeft size={14} className={dir === "rtl" ? "rotate-180" : ""} />
            <span className="text-white/80">{t.privacy.title}</span>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "oklch(0.52 0.12 185 / 0.2)", border: "1px solid oklch(0.52 0.12 185 / 0.3)" }}>
              <Shield size={28} className="text-[oklch(0.72_0.12_185)]" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white" style={{ fontFamily: "'Cairo', sans-serif" }}>
                {t.privacy.title}
              </h1>
              <p className="text-white/60 text-sm mt-1" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                {t.privacy.lastUpdated}: {LAST_UPDATED}
              </p>
            </div>
          </div>

          <p className="text-white/70 text-base max-w-2xl leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            {t.privacy.intro}
          </p>
        </div>
      </div>

      {/* ─── Main Content ─────────────────────────────────────────────────────── */}
      <div className="container py-12">
        <div className="max-w-4xl mx-auto">

          {/* Quick Navigation */}
          <div className="bg-white rounded-2xl border border-[oklch(0.90_0.006_80)] shadow-sm p-6 mb-10">
            <h2 className="text-base font-black text-[oklch(0.14_0.005_0)] mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.privacy.tableOfContents}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="flex items-center gap-2 text-sm text-[oklch(0.52_0.12_185)] hover:text-[oklch(0.38_0.10_185)] transition-colors py-1"
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.52_0.12_185)] flex-shrink-0" />
                  {s.title}
                </a>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-8">
            {sections.map((section, idx) => (
              <div
                key={section.id}
                id={section.id}
                className="bg-white rounded-2xl border border-[oklch(0.90_0.006_80)] shadow-sm overflow-hidden"
              >
                {/* Section Header */}
                <div
                  className="flex items-center gap-3 px-6 py-4 border-b border-[oklch(0.93_0.004_80)]"
                  style={{ background: idx % 2 === 0 ? "oklch(0.97 0.004 185)" : "oklch(0.98 0.002 80)" }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "oklch(0.52 0.12 185 / 0.12)", color: "oklch(0.52 0.12 185)" }}
                  >
                    {section.icon}
                  </div>
                  <h2 className="text-base font-black text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
                    {idx + 1}. {section.title}
                  </h2>
                </div>

                {/* Section Body */}
                <div className="px-6 py-5">
                  <div
                    className="text-sm text-[oklch(0.35_0.005_0)] leading-loose whitespace-pre-line"
                    style={{ fontFamily: "'Tajawal', sans-serif" }}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(
                        section.content
                          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-[oklch(0.14_0.005_0)] font-bold">$1</strong>')
                          .replace(/^• /gm, '<span class="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 mr-2 mb-0.5 align-middle"></span>')
                      )
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Contact Card */}
          <div
            className="mt-10 rounded-2xl p-8 text-center"
            style={{ background: "linear-gradient(135deg, oklch(0.14 0.005 0), oklch(0.22 0.012 185))" }}
          >
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "oklch(0.52 0.12 185 / 0.2)" }}>
                <Mail size={28} className="text-[oklch(0.72_0.12_185)]" />
              </div>
            </div>
            <h3 className="text-xl font-black text-white mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.privacy.privacyQuestion}
            </h3>
            <p className="text-white/60 text-sm mb-6 max-w-lg mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.privacy.privacyContact}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={`mailto:${WAFD_EMAIL}`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-bold text-sm transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}
              >
                <Mail size={16} />
                {WAFD_EMAIL}
              </a>
              <a
                href={`tel:${WAFD_PHONE_DISPLAY.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-bold text-sm border border-white/20 hover:bg-white/10 transition-all"
                style={{ fontFamily: "'Cairo', sans-serif" }}
              >
                <Phone size={16} />
                {WAFD_PHONE_DISPLAY}
              </a>
            </div>
          </div>

          {/* Back to Home */}
          <div className="mt-8 text-center">
            <Link href="/">
              <span
                className="inline-flex items-center gap-2 text-sm text-[oklch(0.52_0.12_185)] hover:text-[oklch(0.38_0.10_185)] transition-colors cursor-pointer font-semibold"
                style={{ fontFamily: "'Cairo', sans-serif" }}
              >
                <ChevronLeft size={16} className={dir === "ltr" ? "rotate-180" : ""} />
                {t.privacy.backToHome}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="py-8 bg-[oklch(0.10_0.005_0)] text-white/50 mt-8">
        <div className="container text-center">
          <img
            src={LOGO_WHITE}
            alt={t.privacy.allRightsReserved}
            className="h-8 w-auto object-contain mx-auto mb-3"
            style={{ filter: "brightness(0) invert(1) opacity(0.5)" }}
          />
          <p className="text-xs" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            © {new Date().getFullYear()} {t.privacy.allRightsReserved}
          </p>
        </div>
      </footer>
    </div>
  );
}
