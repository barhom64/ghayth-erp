/**
 * صفحة "من نحن" — وفد
 * تعرف على قصة وفد وقيمها وفريقها
 */
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Heart, Shield, Star, Award, ArrowLeft, Phone, Mail, Globe } from "lucide-react";
import { wafdWhatsAppLink, WAFD_PHONE_DISPLAY, WAFD_EMAIL, WAFD_WEBSITE } from "../lib/wafd-constants";

const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hero-kaaba-HJyJeNN97h7PfMrmAAMs2W.webp";
const GROUP_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-umrah-group-BnpX9ASFQabKmJ7XA7wh9j.webp";
const MADINAH_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-madinah-mLYiJhvGYuvzquRMzJikST.webp";

const VALUES = [
  {
    icon: <Heart size={22} />,
    title: "الضيافة",
    desc: "نستقبل كل معتمر كما يليق بضيف الرحمن — بحفاوة وترحيب صادق من القلب",
  },
  {
    icon: <Shield size={22} />,
    title: "الالتزام",
    desc: "نفي بوعودنا في كل خطوة — ما نقوله نفعله، وما نلتزم به ننجزه",
  },
  {
    icon: <Star size={22} />,
    title: "الشفافية",
    desc: "نتحدث بصدق عن خدماتنا وأسعارنا — لا مفاجآت، لا وعود مبالغ فيها",
  },
  {
    icon: <Award size={22} />,
    title: "الجودة",
    desc: "نسعى لتقديم أفضل تجربة ممكنة في كل خدمة نقدمها، ونتحسن باستمرار",
  },
];

const SERVICES_NOW = [
  { icon: "🕋", title: "تأشيرة عمرة", desc: "نتولى إصدار تأشيرة العمرة وجميع الإجراءات الرسمية" },
  { icon: "🚐", title: "النقل والتنقلات", desc: "نقل من المطار وتنقلات داخل مكة والمدينة بأمان وراحة" },
];

const SERVICES_SOON = [
  { icon: "🏨", title: "فنادق الحرمين", desc: "حجز فنادق قريبة من الحرمين بأسعار تناسب جميع الميزانيات" },
  { icon: "📋", title: "برامج متكاملة", desc: "باقات تجمع التأشيرة والفندق والنقل في باقة واحدة" },
];

export default function About() {
  const { t, dir } = useLanguage();
  return (
    <div className="overflow-x-hidden" dir={dir}>

      {/* ===== HERO ===== */}
      <section className="relative h-72 md:h-96 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="الحرم المكي" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, oklch(0.14 0.005 0 / 0.65) 0%, oklch(0.14 0.005 0 / 0.80) 100%)" }} />
        </div>
        <motion.div
          className="relative z-10 text-center text-white px-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="text-[oklch(0.72_0.09_75)] text-sm tracking-widest mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
            ✦ {t.about.heroTitle} ✦
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {t.about.heroTitle}
          </h1>
          <p className="text-white/80 text-base md:text-lg max-w-xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            {t.about.heroSubtitle}
          </p>
        </motion.div>
      </section>

      {/* ===== BREADCRUMB ===== */}
      <div className="bg-white border-b border-[oklch(0.92_0.006_80)]">
        <div className="container py-3 flex items-center gap-2 text-sm text-[oklch(0.62_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>
          <Link href="/"><span className="hover:text-[oklch(0.52_0.12_185)] cursor-pointer transition-colors">{t.nav.home}</span></Link>
          <span className="text-[oklch(0.80_0.005_0)]">/</span>
          <span className="text-[oklch(0.14_0.005_0)] font-semibold">{t.about.heroTitle}</span>
        </div>
      </div>

      {/* ===== STORY SECTION ===== */}
      <section className="py-20 bg-white">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                <img src={GROUP_IMG} alt="ضيوف الرحمن" className="w-full h-80 md:h-96 object-cover" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 60%, oklch(0.14 0.005 0 / 0.5) 100%)" }} />
              </div>
              <div className="absolute -bottom-4 -left-4 bg-white rounded-xl p-4 shadow-xl border border-[oklch(0.90_0.006_80)] hidden md:block">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "oklch(0.94 0.008 185)" }}>
                    <Shield size={18} className="text-[oklch(0.52_0.12_185)]" />
                  </div>
                  <div>
                    <div className="font-bold text-[oklch(0.14_0.005_0)] text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>شركة ناشئة</div>
                    <div className="text-xs text-[oklch(0.62_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>نبني ثقتنا خطوة بخطوة</div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
                قصتنا
              </span>
              <h2 className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)] mt-2 mb-5" style={{ fontFamily: "'Cairo', sans-serif" }}>
                لماذا وُلدت وفد؟
              </h2>
              <div className="space-y-4 text-[oklch(0.55_0.005_0)] leading-relaxed text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                <p>
                  وُلدت وفد من إيمان عميق بأن كل معتمر يستحق رحلة مريحة ومنظمة إلى بيت الله الحرام. رأينا كثيراً من الحجاج والمعتمرين يعانون من تعقيدات التأشيرة، وصعوبة الحجوزات، وغياب الدعم الميداني — فقررنا أن نكون الحل.
                </p>
                <p>
                  اسم "وفد" ليس مجرد اسم — هو وعد. الوفد هو الضيف الكريم، والوفادة هي الاستقبال الحار. نحن هنا لنكون رفيقك الموثوق في كل خطوة من رحلتك المباركة، من لحظة التأشيرة حتى العودة.
                </p>
                <p>
                  نحن شركة ناشئة سعودية نبني ثقتنا يوماً بيوم، خطوة بخطوة. لا ندّعي ما لا نملك، ولا نعد بما لا نستطيع. نؤمن أن الصدق هو أساس أي علاقة ناجحة مع عملائنا.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== VALUES SECTION ===== */}
      <section className="py-20" style={{ background: "oklch(0.975 0.008 80)" }}>
        <div className="container">
          <div className="text-center mb-14">
            <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.about.valuesTitle}
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)] mt-2 mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.about.valuesTitle}
            </h2>
            <div className="flex items-center justify-center gap-3">
              <div className="h-px w-16" style={{ background: "linear-gradient(90deg, transparent, oklch(0.72 0.09 75))" }} />
              <span className="text-[oklch(0.72_0.09_75)] text-lg" style={{ fontFamily: "'Amiri', serif" }}>التي تحكم كل قرار نتخذه</span>
              <div className="h-px w-16" style={{ background: "linear-gradient(90deg, oklch(0.72 0.09 75), transparent)" }} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map((v, i) => (
              <motion.div
                key={v.title}
                className="bg-white rounded-2xl p-6 shadow-sm border border-[oklch(0.92_0.006_80)]"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 text-[oklch(0.52_0.12_185)]"
                  style={{ background: "oklch(0.94 0.008 185)" }}>
                  {v.icon}
                </div>
                <h3 className="font-black text-[oklch(0.14_0.005_0)] mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>{v.title}</h3>
                <p className="text-sm text-[oklch(0.62_0.005_0)] leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SERVICES STATUS ===== */}
      <section className="py-20 bg-white">
        <div className="container">
          <div className="text-center mb-14">
            <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
              خدماتنا
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)] mt-2 mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              ما نقدمه الآن وما يأتي قريباً
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* متوفر الآن */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <h3 className="font-black text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>متوفر الآن</h3>
              </div>
              <div className="space-y-4">
                {SERVICES_NOW.map((s) => (
                  <motion.div
                    key={s.title}
                    className="flex gap-4 items-start p-4 rounded-xl border border-emerald-100 bg-emerald-50"
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="text-3xl">{s.icon}</div>
                    <div>
                      <h4 className="font-bold text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>{s.title}</h4>
                      <p className="text-sm text-[oklch(0.55_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>{s.desc}</p>
                    </div>
                    <span className="mr-auto text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full whitespace-nowrap" style={{ fontFamily: "'Cairo', sans-serif" }}>
                      متوفر ✓
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* قريباً */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <h3 className="font-black text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>قريباً</h3>
              </div>
              <div className="space-y-4">
                {SERVICES_SOON.map((s) => (
                  <motion.div
                    key={s.title}
                    className="flex gap-4 items-start p-4 rounded-xl border border-amber-100 bg-amber-50 opacity-80"
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="text-3xl">{s.icon}</div>
                    <div>
                      <h4 className="font-bold text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>{s.title}</h4>
                      <p className="text-sm text-[oklch(0.55_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>{s.desc}</p>
                    </div>
                    <span className="mr-auto text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full whitespace-nowrap" style={{ fontFamily: "'Cairo', sans-serif" }}>
                      قريباً
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== VISION SECTION ===== */}
      <section className="py-20 relative overflow-hidden" style={{ background: "linear-gradient(135deg, oklch(0.14 0.005 0), oklch(0.20 0.008 185))" }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, oklch(0.52 0.12 185) 0%, transparent 50%)" }} />
        <div className="container relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <span className="text-[oklch(0.72_0.09_75)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
                {t.about.visionTitle}
              </span>
              <h2 className="text-3xl md:text-4xl font-black text-white mt-2 mb-5" style={{ fontFamily: "'Cairo', sans-serif" }}>
                {t.about.visionTitle}
              </h2>
              <div className="space-y-4 text-white/75 leading-relaxed text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                <p>
                  نطمح أن تكون وفد المرجع الأول لكل من يريد أداء العمرة أو زيارة الحرمين الشريفين — منصة متكاملة تجمع التأشيرة والإقامة والنقل والإرشاد في مكان واحد.
                </p>
                <p>
                  نؤمن أن التكنولوجيا يمكن أن تجعل رحلة العمرة أسهل وأكثر تنظيماً، مع الحفاظ على الطابع الروحاني والإنساني لهذه الرحلة المباركة.
                </p>
              </div>
            </motion.div>

            <motion.div
              className="relative rounded-2xl overflow-hidden shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <img src={MADINAH_IMG} alt="المسجد النبوي" className="w-full h-72 object-cover" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 50%, oklch(0.14 0.005 0 / 0.6) 100%)" }} />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== CONTACT SECTION ===== */}
      <section className="py-20 bg-white">
        <div className="container">
          <div className="text-center mb-12">
            <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.about.contactUs}
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)] mt-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.about.heroSubtitle}
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
                label: "واتساب",
                value: WAFD_PHONE_DISPLAY,
                href: wafdWhatsAppLink("contact"),
                color: "#25D366",
              },
              {
                icon: <Mail size={24} />,
                label: "البريد الإلكتروني",
                value: WAFD_EMAIL,
                href: `mailto:${WAFD_EMAIL}`,
                color: "oklch(0.52 0.12 185)",
              },
              {
                icon: <Globe size={24} />,
                label: "الموقع الإلكتروني",
                value: WAFD_WEBSITE,
                href: `https://${WAFD_WEBSITE}`,
                color: "oklch(0.52 0.12 185)",
              },
            ].map((item, i) => (
              <motion.a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-[oklch(0.92_0.006_80)] hover:shadow-md transition-shadow text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                whileHover={{ y: -4 }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                  style={{ background: item.color }}>
                  {item.icon}
                </div>
                <div>
                  <div className="text-xs text-[oklch(0.62_0.005_0)] mb-0.5" style={{ fontFamily: "'Tajawal', sans-serif" }}>{item.label}</div>
                  <div className="font-bold text-[oklch(0.14_0.005_0)] text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>{item.value}</div>
                </div>
              </motion.a>
            ))}
          </div>

          <div className="text-center mt-10">
            <a
              href={wafdWhatsAppLink("general")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-white font-bold"
              style={{
                background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                fontFamily: "'Cairo', sans-serif",
                boxShadow: "0 8px 30px oklch(0.52 0.12 185 / 0.3)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {t.about.contactUs}
              <ArrowLeft size={16} className="rotate-180" />
            </a>
          </div>
        </div>
      </section>

    </div>
  );
}
