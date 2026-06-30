/**
 * WAFD SERVICES PAGE — Warm Welcome Sanctuary Design
 * إصلاح: الفنادق وبرامج العمرة متاحة فعلاً — تم إزالة "قريباً" وإضافة روابط
 */
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Link } from "wouter";
import { WAFD_PHONE } from "@/lib/wafd-constants";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteData } from "@/contexts/SiteDataContext";

const WHATSAPP_NUMBER = WAFD_PHONE;

type SvcItem = {
  icon: string;
  title: string;
  subtitle: string;
  desc: string;
  features: string[];
  color: string;
  available: boolean;
  link: string | null;
  whatsappMsg: string;
};

export default function Services() {
  const { t, dir } = useLanguage();
  const { services: dbServices } = useSiteData();
  const s = t.services;

  // القيم الاحتياطية (تظهر فقط عند تعذّر الجلب من غيث).
  const fallbackServices: SvcItem[] = [
    {
      icon: "🛂",
      title: s.visaTitle,
      subtitle: s.available,
      desc: s.visaDesc,
      features: [s.visaFeature1, s.visaFeature2, s.visaFeature3, s.visaFeature4],
      color: "oklch(0.52 0.12 185)",
      available: true,
      link: null,
      whatsappMsg: `${s.requestNow}: ${s.visaTitle}`,
    },
    {
      icon: "🚐",
      title: s.transportTitle,
      subtitle: s.available,
      desc: s.transportDesc,
      features: [s.transportFeature1, s.transportFeature2, s.transportFeature3, s.transportFeature4],
      color: "oklch(0.52 0.12 185)",
      available: true,
      link: null,
      whatsappMsg: `${s.requestNow}: ${s.transportTitle}`,
    },
    {
      icon: "🏨",
      title: s.hotelsTitle,
      subtitle: s.available,
      desc: s.hotelsDesc,
      features: [s.hotelsFeature1, s.hotelsFeature2, s.hotelsFeature3, s.hotelsFeature4],
      color: "oklch(0.52 0.12 185)",
      available: true,
      link: "/hotels",
      whatsappMsg: `${s.requestNow}: ${s.hotelsTitle}`,
    },
    {
      icon: "📋",
      title: s.programsTitle,
      subtitle: s.available,
      desc: s.programsDesc,
      features: [s.programsFeature1, s.programsFeature2, s.programsFeature3, s.programsFeature4],
      color: "oklch(0.52 0.12 185)",
      available: true,
      link: "/packages",
      whatsappMsg: `${s.requestNow}: ${s.programsTitle}`,
    },
  ];

  // المحتوى الحيّ من غيث (يُحرَّر من لوحة التحكم).
  const services: SvcItem[] = dbServices.length
    ? dbServices.map((svc) => ({
        icon: svc.icon ?? "🕋",
        title: svc.title,
        subtitle: svc.subtitle ?? s.available,
        desc: svc.description ?? "",
        features: svc.features ?? [],
        color: "oklch(0.52 0.12 185)",
        available: svc.isActive,
        link: svc.link,
        whatsappMsg: `${s.requestNow}: ${svc.title}`,
      }))
    : fallbackServices;

  useEffect(() => {
    window.scrollTo(0, 0);
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".wafd-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div dir={dir} className="min-h-screen">
      {/* Hero */}
      <section className="pt-32 pb-16 wafd-gradient-dark relative overflow-hidden">
        <div className="absolute inset-0 wafd-pattern-overlay opacity-20" />
        <div className="container relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="flex justify-center mb-4">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png"
                alt="Wafd Logo"
                className="h-20 md:h-24 w-auto object-contain"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white mt-3 mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {s.pageTitle}
            </h1>
            <p className="text-white/70 max-w-xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {s.pageDesc}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-20 bg-[oklch(0.975_0.008_80)]">
        <div className="container">
          <h2 className="text-3xl md:text-4xl font-black text-center mb-10" style={{ fontFamily: "'Cairo', sans-serif", color: "oklch(0.14 0.005 0)" }}>
            {s.pageSubtitle}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {services.map((svc, i) => (
              <motion.div
                key={svc.title}
                className="bg-white rounded-2xl p-6 shadow-md border border-[oklch(0.90_0.006_80)] relative overflow-hidden wafd-card-hover"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                {/* شارة "متاحة" */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}>
                  {s.available}
                </div>
                <div className="text-4xl mb-4 mt-2">{svc.icon}</div>
                <h3 className="text-xl font-black text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {svc.title}
                </h3>
                <p className="text-xs font-semibold mb-3 text-[oklch(0.52_0.12_185)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {svc.subtitle}
                </p>
                <p className="text-sm text-[oklch(0.62_0.005_0)] leading-relaxed mb-4" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {svc.desc}
                </p>
                <ul className="space-y-1.5 mb-5">
                  {svc.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-[oklch(0.62_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "oklch(0.94 0.008 185)" }}>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4l2 2 4-4" stroke="oklch(0.52 0.12 185)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                {/* زر الإجراء: رابط داخلي إن وجد، وإلا واتساب */}
                {svc.link ? (
                  <div className="flex gap-2">
                    <Link href={svc.link} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                      style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}>
                      {s.viewPackages ?? "عرض الباقات"}
                    </Link>
                    <a
                      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(svc.whatsappMsg)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-xl text-sm font-bold transition-all border-2 flex items-center justify-center"
                      style={{ borderColor: "oklch(0.52 0.12 185)", color: "oklch(0.52 0.12 185)", fontFamily: "'Cairo', sans-serif" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </a>
                  </div>
                ) : (
                  <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(svc.whatsappMsg)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                      fontFamily: "'Cairo', sans-serif",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    {s.requestNow}
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
