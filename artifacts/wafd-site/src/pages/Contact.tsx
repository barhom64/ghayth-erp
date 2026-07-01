/**
 * WAFD CONTACT PAGE — Warm Welcome Sanctuary Design
 * وفد: كيان مؤنث — هي تستقبلك، هي ترافقك
 */
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { wafdWhatsAppLink, WAFD_PHONE, WAFD_PHONE_DISPLAY, WAFD_EMAIL, WAFD_WEBSITE } from "../lib/wafd-constants";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png";

const contactMethods = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
    title: "واتساب",
    value: WAFD_PHONE_DISPLAY,
    desc: "تواصل مع وفد مباشرة عبر واتساب للرد السريع على استفساراتك",
    href: wafdWhatsAppLink("contact"),
    btnLabel: "ابدأ المحادثة",
    color: "#25D366",
    bg: "#25D36615",
    isWA: true,
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 .18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"/>
      </svg>
    ),
    title: "الهاتف",
    value: WAFD_PHONE_DISPLAY,
    desc: "اتصل بوفد مباشرة للحصول على استشارة فورية من فريقها المتخصص",
    href: `tel:+${WAFD_PHONE}`,
    btnLabel: "اتصل الآن",
    color: "oklch(0.52 0.12 185)",
    bg: "oklch(0.94 0.008 185)",
    isWA: false,
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
      </svg>
    ),
    title: "البريد الإلكتروني",
    value: WAFD_EMAIL,
    desc: "راسل وفد بريدياً وستردّ عليك في أقرب وقت ممكن",
    href: `mailto:${WAFD_EMAIL}`,
    btnLabel: "أرسل بريداً",
    color: "oklch(0.52 0.12 185)",
    bg: "oklch(0.94 0.008 185)",
    isWA: false,
  },
];

// رسائل واتساب سريعة مخصصة حسب الطلب
const quickMessages = [
  { label: "استفسار عن تأشيرة عمرة", key: "visa" as const },
  { label: "حجز فندق في مكة", key: "hotel_makkah" as const },
  { label: "حجز فندق في المدينة", key: "hotel_madinah" as const },
  { label: "برنامج عمرة متكامل", key: "program_premium" as const },
  { label: "خدمة نقل وتنقلات", key: "transport" as const },
  { label: "برنامج العشر الأواخر", key: "program_last_ten" as const },
];

export default function Contact() {
  const { t, dir } = useLanguage();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div dir={dir} className="min-h-screen">
      {/* Hero */}
      <section className="pt-32 pb-16 wafd-gradient-dark relative overflow-hidden">
        <div className="absolute inset-0 wafd-pattern-overlay opacity-20" />
        <div className="container relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="flex justify-center mb-4">
              <img
                src={LOGO_URL}
                alt="شعار وفد"
                className="h-20 md:h-24 w-auto object-contain"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white mt-3 mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.contact.heroTitle}
            </h1>
            <p className="text-white/70 max-w-xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.contact.heroSubtitle}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Methods */}
      <section className="py-20 bg-[oklch(0.975_0.008_80)]">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {contactMethods.map((method, i) => (
              <motion.div
                key={method.title}
                className="bg-white rounded-2xl p-8 shadow-md border border-[oklch(0.90_0.006_80)] text-center wafd-card-hover"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: method.bg, color: method.color }}>
                  {method.icon}
                </div>
                <h3 className="text-xl font-black text-[oklch(0.14_0.005_0)] mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {method.title}
                </h3>
                <p className="text-[oklch(0.52_0.12_185)] font-semibold mb-2 text-sm" dir="ltr" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {method.value}
                </p>
                <p className="text-sm text-[oklch(0.62_0.005_0)] mb-6 leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {method.desc}
                </p>
                <a
                  href={method.href}
                  target={method.isWA ? "_blank" : undefined}
                  rel={method.isWA ? "noopener noreferrer" : undefined}
                  className="block w-full py-3 rounded-xl text-sm font-bold text-white text-center transition-all hover:opacity-90"
                  style={{
                    background: method.isWA ? "#25D366" : "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                    fontFamily: "'Cairo', sans-serif",
                  }}
                >
                  {method.btnLabel}
                </a>
              </motion.div>
            ))}
          </div>

          {/* Quick WhatsApp Messages */}
          <motion.div
            className="bg-white rounded-2xl p-8 shadow-md border border-[oklch(0.90_0.006_80)] mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-black text-[oklch(0.14_0.005_0)] mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.contact.quickMessages}
            </h3>
            <p className="text-sm text-[oklch(0.62_0.005_0)] mb-6" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.contact.quickMessagesDesc}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {quickMessages.map((msg) => (
                <a
                  key={msg.key}
                  href={wafdWhatsAppLink(msg.key)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-[oklch(0.90_0.006_80)] hover:border-[oklch(0.52_0.12_185)] hover:bg-[oklch(0.97_0.008_185)] transition-all group"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "#25D36620" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-[oklch(0.14_0.005_0)] group-hover:text-[oklch(0.52_0.12_185)] transition-colors" style={{ fontFamily: "'Cairo', sans-serif" }}>
                    {msg.label}
                  </span>
                </a>
              ))}
            </div>
          </motion.div>

          {/* Big WhatsApp CTA */}
          <motion.div
            className="rounded-3xl p-10 text-center relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, oklch(0.14 0.005 0), oklch(0.20 0.008 185))" }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="absolute inset-0 wafd-pattern-overlay opacity-10" />
            <div className="relative z-10">
              <div className="text-[oklch(0.72_0.09_75)] text-sm mb-3" style={{ fontFamily: "'Amiri', serif" }}>✦ وفد تنتظرك ✦</div>
              <h2 className="text-3xl font-black text-white mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
                {t.contact.ctaTitle}
              </h2>
              <p className="text-white/70 max-w-md mx-auto mb-8" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                {t.contact.ctaDesc}
              </p>
              <motion.a
                href={wafdWhatsAppLink("contact")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-10 py-4 rounded-full font-bold text-white text-lg"
                style={{
                  background: "#25D366",
                  fontFamily: "'Cairo', sans-serif",
                  boxShadow: "0 8px 30px #25D36650",
                }}
                whileHover={{ scale: 1.05, y: -3 }}
                whileTap={{ scale: 0.97 }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {t.nav.bookNow}
              </motion.a>
              <p className="text-white/40 text-sm mt-4" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                أو تواصل عبر البريد: {WAFD_EMAIL} | الموقع: {WAFD_WEBSITE}
              </p>
            </div>
          </motion.div>

          {/* Working Hours */}
          <motion.div
            className="mt-8 bg-white rounded-2xl p-8 shadow-md border border-[oklch(0.90_0.006_80)]"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-black text-[oklch(0.14_0.005_0)] mb-6 text-center" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.contact.workingHours}
            </h3>
            <div className="grid sm:grid-cols-3 gap-4 text-center">
              {[
                { day: "السبت — الأربعاء", time: "8:00 ص — 10:00 م" },
                { day: "الخميس", time: "8:00 ص — 8:00 م" },
                { day: "الجمعة", time: "2:00 م — 10:00 م" },
              ].map((item) => (
                <div key={item.day} className="p-4 rounded-xl" style={{ background: "oklch(0.975 0.008 80)" }}>
                  <div className="font-bold text-[oklch(0.14_0.005_0)] text-sm mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>{item.day}</div>
                  <div className="text-[oklch(0.52_0.12_185)] font-semibold text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>{item.time}</div>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-[oklch(0.62_0.005_0)] mt-4" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              * واتساب متاح على مدار الساعة للاستفسارات العاجلة
            </p>
          </motion.div>
        </div>
      </section>

    </div>
  );
}
