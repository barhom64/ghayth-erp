/**
 * WAFD LANDING PAGE — صفحة هبوط حملة وفد
 * Design: Warm Welcome Sanctuary — تأنيث وفد كاملاً
 * وفد هي ترافقك، هي تستقبلك، هي تخطط لك
 */
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { CheckCircle, Phone, Mail, ArrowLeft } from "lucide-react";
import { wafdWhatsAppLink, WAFD_PHONE, WAFD_PHONE_DISPLAY, WAFD_EMAIL } from "../lib/wafd-constants";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png";
const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hero-kaaba-HJyJeNN97h7PfMrmAAMs2W.webp";
const GROUP_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-umrah-group-BnpX9ASFQabKmJ7XA7wh9j.webp";

const benefits = [
  "تأشيرة عمرة — نتولى كل الإجراءات",
  "فنادق مختارة بالقرب من الحرمين الشريفين",
  "نقل من المطار وتنقلات داخلية",
  "برامج متكاملة تناسب جميع الميزانيات",
  "تواصل مباشر وسريع عبر واتساب",
  "أسعار واضحة بدون تكاليف خفية",
];

const whyWafd = [
  { icon: "🤝", title: "تواصل مباشر", desc: "نتواصل معك عبر واتساب ونرد على استفساراتك بسرعة" },
  { icon: "💰", title: "أسعار واضحة", desc: "نقدم لك عروضاً واضحة بدون تكاليف خفية" },
  { icon: "📍", title: "خدمات متكاملة", desc: "تأشيرة + فندق + نقل في باقة واحدة" },
  { icon: "❤️", title: "اهتمام حقيقي", desc: "نسعى لأن تكون رحلتك مريحة وخالية من القلق" },
];

export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "25%"]);
  const [formData, setFormData] = useState({ name: "", phone: "", service: "general" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = `السلام عليكم، اسمي ${formData.name}، رقمي ${formData.phone}، أود الاستفسار عن: ${
      formData.service === "general" ? "خدمات وفد للعمرة" :
      formData.service === "visa" ? "تأشيرة العمرة" :
      formData.service === "hotel" ? "حجز فندق" :
      formData.service === "program" ? "برنامج عمرة متكامل" :
      "النقل والتنقلات"
    }`;
    window.open(`https://wa.me/${WAFD_PHONE}?text=${encodeURIComponent(msg)}`, "_blank");
    setSubmitted(true);
  };

  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden">
      {/* Minimal Header */}
      <header className="fixed top-0 right-0 left-0 z-50 bg-white/95 backdrop-blur-md shadow-sm border-b border-[oklch(0.90_0.006_80)]">
        <div className="container flex items-center justify-between h-16">
          <Link href="/">
            <img src={LOGO_URL} alt="وفد" className="h-12 w-auto object-contain cursor-pointer" />
          </Link>
          <a
            href={`tel:${WAFD_PHONE_DISPLAY}`}
            className="flex items-center gap-2 text-sm font-semibold text-[oklch(0.52_0.12_185)]"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            <Phone size={16} />
            {WAFD_PHONE_DISPLAY}
          </a>
        </div>
      </header>

      {/* Hero */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden pt-16">
        <motion.div className="absolute inset-0 z-0" style={{ y: heroY }}>
          <img src={HERO_IMG} alt="المسجد الحرام" className="w-full h-full object-cover scale-110" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, oklch(0.14 0.005 0 / 0.85) 0%, oklch(0.22 0.010 185 / 0.75) 100%)" }} />
        </motion.div>

        <div className="container relative z-10 py-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Content */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="text-[oklch(0.72_0.09_75)] text-sm font-semibold mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
                ✦ عرض خاص من وفد ✦
              </div>
              <img src={LOGO_URL} alt="وفد" className="h-20 w-auto object-contain mb-4" style={{ filter: "brightness(0) invert(1)" }} />
              <h1 className="text-3xl md:text-5xl font-black text-white leading-tight mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
                رحلتك المباركة
                <br />
                <span style={{ color: "oklch(0.72 0.09 75)" }}>تبدأ هنا</span>
              </h1>
              <p className="text-white/80 text-lg mb-8 leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                وفد تتولى كل شيء — من التأشيرة حتى الاستقبال في المطار، لتتفرغ أنت للعبادة والخشوع
              </p>

              {/* Benefits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {benefits.map((b, i) => (
                  <motion.div
                    key={i}
                    className="flex items-center gap-2 text-white/90 text-sm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    style={{ fontFamily: "'Tajawal', sans-serif" }}
                  >
                    <CheckCircle size={16} className="text-[oklch(0.72_0.09_75)] flex-shrink-0" />
                    {b}
                  </motion.div>
                ))}
              </div>

              <motion.a
                href={wafdWhatsAppLink("landing")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-white font-bold text-base"
                style={{
                  background: "#25D366",
                  fontFamily: "'Cairo', sans-serif",
                  boxShadow: "0 8px 30px #25D36640",
                }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                تواصل مع وفد الآن
              </motion.a>
            </motion.div>

            {/* Right: Form */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <div className="bg-white rounded-2xl p-8 shadow-2xl">
                {submitted ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                      style={{ background: "oklch(0.94 0.008 185)" }}>
                      <CheckCircle size={32} className="text-[oklch(0.52_0.12_185)]" />
                    </div>
                    <h3 className="text-xl font-black text-[oklch(0.14_0.005_0)] mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
                      تم إرسال طلبك!
                    </h3>
                    <p className="text-[oklch(0.62_0.005_0)] mb-6" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                      سيفتح واتساب تلقائياً. إن لم يفتح، تواصل مباشرة على {WAFD_PHONE_DISPLAY}
                    </p>
                    <button
                      onClick={() => setSubmitted(false)}
                      className="text-[oklch(0.52_0.12_185)] text-sm font-semibold"
                      style={{ fontFamily: "'Cairo', sans-serif" }}
                    >
                      إرسال طلب آخر
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-black text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
                        احجز استشارتك المجانية
                      </h2>
                      <p className="text-sm text-[oklch(0.62_0.005_0)] mt-1" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                        وفد تتواصل معك خلال دقائق
                      </p>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-[oklch(0.35_0.005_0)] mb-1.5" style={{ fontFamily: "'Cairo', sans-serif" }}>
                          الاسم الكريم
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="أدخل اسمك"
                          className="w-full px-4 py-3 rounded-xl border border-[oklch(0.90_0.006_80)] text-[oklch(0.14_0.005_0)] placeholder-[oklch(0.75_0.005_0)] focus:outline-none focus:border-[oklch(0.52_0.12_185)] transition-colors"
                          style={{ fontFamily: "'Tajawal', sans-serif" }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[oklch(0.35_0.005_0)] mb-1.5" style={{ fontFamily: "'Cairo', sans-serif" }}>
                          رقم الجوال
                        </label>
                        <input
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="05xxxxxxxx"
                          className="w-full px-4 py-3 rounded-xl border border-[oklch(0.90_0.006_80)] text-[oklch(0.14_0.005_0)] placeholder-[oklch(0.75_0.005_0)] focus:outline-none focus:border-[oklch(0.52_0.12_185)] transition-colors"
                          style={{ fontFamily: "'Tajawal', sans-serif" }}
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[oklch(0.35_0.005_0)] mb-1.5" style={{ fontFamily: "'Cairo', sans-serif" }}>
                          ما الذي تحتاجه؟
                        </label>
                        <select
                          value={formData.service}
                          onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-[oklch(0.90_0.006_80)] text-[oklch(0.14_0.005_0)] focus:outline-none focus:border-[oklch(0.52_0.12_185)] transition-colors bg-white"
                          style={{ fontFamily: "'Cairo', sans-serif" }}
                        >
                          <option value="general">استفسار عام</option>
                          <option value="visa">تأشيرة عمرة</option>
                          <option value="hotel">حجز فندق</option>
                          <option value="program">برنامج عمرة متكامل</option>
                          <option value="transport">نقل وتنقلات</option>
                        </select>
                      </div>
                      <motion.button
                        type="submit"
                        className="w-full py-4 rounded-xl font-bold text-white text-base"
                        style={{
                          background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                          fontFamily: "'Cairo', sans-serif",
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        أرسل طلبي عبر واتساب
                      </motion.button>
                    </form>
                    <p className="text-center text-xs text-[oklch(0.62_0.005_0)] mt-4" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                      بالضغط على الزر ستنتقل إلى واتساب مباشرة
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why Wafd */}
      <section className="py-16 bg-[oklch(0.975_0.008_80)]">
        <div className="container">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-black text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
              لماذا تختار وفد؟
            </h2>
            <p className="text-[oklch(0.62_0.005_0)] mt-2 text-sm max-w-md mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              شركة ناشئة تبني ثقتها على الشفافية والالتزام
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyWafd.map((item, i) => (
              <motion.div
                key={i}
                className="bg-white rounded-2xl p-6 shadow-md border border-[oklch(0.90_0.006_80)] text-center"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="font-black text-[oklch(0.14_0.005_0)] mb-2 text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>{item.title}</h3>
                <p className="text-xs text-[oklch(0.62_0.005_0)] leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Group Photo + CTA */}
      <section className="py-16 bg-white">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <motion.div
              className="rounded-2xl overflow-hidden shadow-xl"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
            >
              <img src={GROUP_IMG} alt="معتمرون مع وفد" className="w-full h-72 object-cover" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-2xl md:text-3xl font-black text-[oklch(0.14_0.005_0)] mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
                وفد تستقبلك
                <br />
                <span className="wafd-text-gradient">كما يليق بضيف الرحمن</span>
              </h2>
              <p className="text-[oklch(0.62_0.005_0)] leading-relaxed mb-6" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                منذ لحظة وصولك حتى مغادرتك، وفد تكون بجانبك. فريقها المتخصص يعرف كيف يجعل رحلتك المباركة تجربة لا تُنسى.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={wafdWhatsAppLink("landing")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-bold text-white text-sm"
                  style={{ background: "#25D366", fontFamily: "'Cairo', sans-serif" }}
                >
                  ابدأ الآن عبر واتساب
                </a>
                <a
                  href={`tel:${WAFD_PHONE_DISPLAY}`}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-semibold text-sm border-2 border-[oklch(0.52_0.12_185)] text-[oklch(0.52_0.12_185)] hover:bg-[oklch(0.94_0.008_185)] transition-colors"
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                >
                  <Phone size={16} />
                  {WAFD_PHONE_DISPLAY}
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer minimal */}
      <footer className="py-8 bg-[oklch(0.10_0.005_0)] text-white/60">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={LOGO_URL} alt="وفد" className="h-10 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
          <div className="flex items-center gap-4 text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            <a href={`mailto:${WAFD_EMAIL}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Mail size={14} /> {WAFD_EMAIL}
            </a>
            <a href={`tel:${WAFD_PHONE_DISPLAY}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Phone size={14} /> {WAFD_PHONE_DISPLAY}
            </a>
          </div>
          <Link href="/">
            <span className="text-xs text-white/40 hover:text-white/70 cursor-pointer transition-colors" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              wafd.life
            </span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
