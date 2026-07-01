/**
 * صفحة الباقات — وفد | WAFD
 * باقات العمرة المتكاملة بتصميم احترافي — متعددة اللغات
 */
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Check, Star, Phone, ArrowLeft, Shield, Clock, MapPin, Plane, Hotel, Bus, FileText } from "lucide-react";
import { wafdWhatsAppLink, WAFD_PHONE_DISPLAY, WAFD_PHONE } from "../lib/wafd-constants";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteData } from "@/contexts/SiteDataContext";

type PkgItem = {
  id: string;
  name: string;
  subtitle: string;
  duration: string;
  badge: string | null;
  color: string;
  features: { icon: typeof Check; text: string }[];
  notIncluded: string[];
  whatsappMsg: string;
};

const PKG_COLORS = ["from-slate-600 to-slate-800", "from-teal-600 to-teal-800", "from-amber-600 to-amber-800"];

export default function Packages() {
  const { t, dir } = useLanguage();
  const { packages: dbPackages } = useSiteData();

  // القيم الاحتياطية (تظهر فقط عند تعذّر الجلب من غيث) — تحافظ على عمل الصفحة.
  const fallbackPackages: PkgItem[] = [
    {
      id: "economy",
      name: t.packages.filterEconomy,
      subtitle: t.packages.economySubtitle,
      duration: t.packages.days7,
      badge: null,
      color: "from-slate-600 to-slate-800",
      features: [
        { icon: FileText, text: t.packages.umrahVisa },
        { icon: Plane, text: t.packages.roundTrip },
        { icon: Hotel, text: t.packages.hotel4star },
        { icon: Bus, text: t.packages.airportTransfers },
        { icon: MapPin, text: t.packages.visitMosques },
      ],
      notIncluded: [t.packages.privateGuide, t.packages.mealsSimple],
      whatsappMsg: dir === "rtl"
        ? "السلام عليكم، أود الاستفسار عن الباقة الاقتصادية للعمرة (٧ أيام)"
        : "Hello, I'd like to inquire about the Economy Umrah Package (7 days)",
    },
    {
      id: "standard",
      name: t.packages.filterStandard,
      subtitle: t.packages.familySubtitle,
      duration: t.packages.days10,
      badge: t.packages.mostPopular,
      color: "from-teal-600 to-teal-800",
      features: [
        { icon: FileText, text: t.packages.umrahVisa },
        { icon: Plane, text: t.packages.roundTrip },
        { icon: Hotel, text: t.packages.hotel5star },
        { icon: Bus, text: t.packages.acTransfers },
        { icon: MapPin, text: t.packages.visitMosques },
        { icon: Shield, text: t.packages.insurance },
      ],
      notIncluded: [t.packages.mealsSimple],
      whatsappMsg: dir === "rtl"
        ? "السلام عليكم، أود الاستفسار عن الباقة الأساسية للعمرة (١٠ أيام)"
        : "Hello, I'd like to inquire about the Standard Umrah Package (10 days)",
    },
    {
      id: "premium",
      name: t.packages.filterVIP,
      subtitle: t.packages.premiumSubtitle,
      duration: t.packages.days14,
      badge: "VIP",
      color: "from-amber-600 to-amber-800",
      features: [
        { icon: FileText, text: t.packages.expressVisa },
        { icon: Plane, text: t.packages.businessFlight },
        { icon: Hotel, text: t.packages.hotel5starHaram },
        { icon: Bus, text: t.packages.privateTransport247 },
        { icon: MapPin, text: t.packages.privateGuideTours },
        { icon: Shield, text: t.packages.insurance },
        { icon: Clock, text: t.packages.support247 },
        { icon: Star, text: t.packages.meals },
      ],
      notIncluded: [],
      whatsappMsg: dir === "rtl"
        ? "السلام عليكم، أود الاستفسار عن الباقة المميزة VIP للعمرة (١٤ يوم)"
        : "Hello, I'd like to inquire about the VIP Premium Umrah Package (14 days)",
    },
  ];

  // المحتوى الحيّ من غيث (يُحرَّر من لوحة التحكم) — يحلّ محل القيم الاحتياطية فور توفّره.
  const packages: PkgItem[] = dbPackages.length
    ? dbPackages.map((p, i) => ({
        id: p.slug,
        name: p.name,
        subtitle: p.subtitle ?? "",
        duration: p.durationLabel ?? "",
        badge: p.badge && p.badge.trim() ? p.badge : null,
        color: PKG_COLORS[i % PKG_COLORS.length],
        features: (p.features ?? []).map((text) => ({ icon: Check, text })),
        notIncluded: p.notIncluded ?? [],
        whatsappMsg: `السلام عليكم، أود الاستفسار عن ${p.name}${p.durationLabel ? ` (${p.durationLabel})` : ""}`,
      }))
    : fallbackPackages;

  const faqs = [
    {
      q: t.packages.faq1Q,
      a: dir === "rtl"
        ? t.packages.customizable
        : t.packages.customizable,
    },
    {
      q: t.packages.faq2Q,
      a: dir === "rtl"
        ? t.packages.visaDuration
        : t.packages.visaDuration,
    },
    {
      q: t.packages.faq3Q,
      a: dir === "rtl"
        ? t.packages.vatIncluded
        : t.packages.vatIncluded,
    },
    {
      q: t.packages.faq4Q,
      a: dir === "rtl"
        ? t.packages.paymentMethods
        : t.packages.paymentMethods,
    },
  ];

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_80)]" dir={dir}>
      {/* Hero */}
      <section className="relative py-24 overflow-hidden" style={{ background: "linear-gradient(135deg, oklch(0.14 0.005 0) 0%, oklch(0.22 0.008 185) 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-10 w-64 h-64 rounded-full" style={{ background: "oklch(0.52 0.12 185)" }} />
          <div className="absolute bottom-10 left-10 w-48 h-48 rounded-full" style={{ background: "oklch(0.72 0.09 75)" }} />
        </div>
        <div className="container max-w-5xl mx-auto px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="text-[oklch(0.72_0.09_75)] text-sm tracking-widest font-medium" style={{ fontFamily: "'Cairo', sans-serif" }}>
              ✦ {t.packages.heroTitle} ✦
            </span>
          </motion.div>
          <motion.h1
            className="text-4xl md:text-5xl font-bold text-white mt-4 mb-4"
            style={{ fontFamily: "'Cairo', sans-serif" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {t.packages.heroSubtitle}
          </motion.h1>
          <motion.p
            className="text-white/70 text-lg max-w-2xl mx-auto"
            style={{ fontFamily: "'Tajawal', sans-serif" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            {dir === "rtl"
              ? t.packages.comprehensivePackages
              : t.packages.comprehensivePackages}
          </motion.p>
        </div>
      </section>

      {/* Packages Grid */}
      <section className="py-16 px-4">
        <div className="container max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 items-start">
            {packages.map((pkg, i) => {
              const isVIP = /vip/i.test(pkg.badge ?? "");
              const isPopular = !!pkg.badge && !isVIP;
              return (
                <motion.div
                  key={pkg.id}
                  className={`relative rounded-3xl overflow-hidden shadow-xl ${isPopular ? "ring-2 ring-[oklch(0.52_0.12_185)] scale-105" : ""}`}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                >
                  {/* Header */}
                  <div className={`bg-gradient-to-br ${pkg.color} p-6 text-white text-center relative`}>
                    {pkg.badge && (
                      <div
                        className={`absolute top-4 ${dir === "rtl" ? "left-4" : "right-4"} px-3 py-1 rounded-full text-xs font-bold ${
                          isVIP
                            ? "bg-[oklch(0.72_0.09_75)] text-[oklch(0.14_0.005_0)]"
                            : "bg-white text-[oklch(0.52_0.12_185)]"
                        }`}
                        style={{ fontFamily: "'Cairo', sans-serif" }}
                      >
                        {pkg.badge}
                      </div>
                    )}
                    <h3 className="text-xl font-bold mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>
                      {pkg.name}
                    </h3>
                    <p className="text-white/70 text-sm mb-4" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                      {pkg.subtitle}
                    </p>
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-xs text-white/60" style={{ fontFamily: "'Tajawal', sans-serif" }}>{pkg.duration}</div>
                      <span
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold"
                        style={{ background: "rgba(255,255,255,0.15)", color: "white", fontFamily: "'Cairo', sans-serif", backdropFilter: "blur(8px)" }}
                      >
                        🔒 {t.store.loginToSeePrice}
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="bg-white p-6" dir={dir}>
                    <div className="space-y-3 mb-6">
                      {pkg.features.map((feature, fi) => (
                        <div key={fi} className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: "oklch(0.94 0.008 185)" }}
                          >
                            <feature.icon size={14} style={{ color: "oklch(0.52 0.12 185)" }} />
                          </div>
                          <span className="text-sm text-[oklch(0.30_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                            {feature.text}
                          </span>
                        </div>
                      ))}
                    </div>

                    {pkg.notIncluded.length > 0 && (
                      <div className="mb-6 pt-4 border-t border-gray-100">
                        <p className="text-xs text-[oklch(0.70_0.005_0)] mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
                          {t.storeProduct.notIncluded}:
                        </p>
                        {pkg.notIncluded.map((item, ni) => (
                          <div key={ni} className="flex items-center gap-2 text-xs text-[oklch(0.70_0.005_0)]">
                            <span>✗</span>
                            <span style={{ fontFamily: "'Tajawal', sans-serif" }}>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <a
                      href={`https://wa.me/${WAFD_PHONE}?text=${encodeURIComponent(pkg.whatsappMsg)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 hover:shadow-lg"
                      style={{
                        background: isVIP
                          ? "linear-gradient(135deg, oklch(0.72 0.09 75), oklch(0.60 0.08 75))"
                          : "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                        fontFamily: "'Cairo', sans-serif",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      {t.packages.bookNow}
                    </a>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Custom Package CTA */}
          <motion.div
            className="mt-12 text-center p-8 rounded-3xl"
            style={{ background: "linear-gradient(135deg, oklch(0.94 0.008 185), oklch(0.96 0.004 80))" }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-bold text-[oklch(0.14_0.005_0)] mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.packages.cantFind}
            </h3>
            <p className="text-[oklch(0.50_0.005_0)] mb-6" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {dir === "rtl"
                ? t.packages.customPackage
                : t.packages.customPackage}
            </p>
            <a
              href={wafdWhatsAppLink("general")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-white font-bold"
              style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}
            >
              <Phone size={16} />
              {t.packages.requestCustom}
            </a>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 bg-white">
        <div className="container max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.packages.faq}
            </h2>
            <p className="text-[oklch(0.50_0.005_0)] mt-2" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.packages.faqSubtitle}
            </p>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <motion.details
                key={i}
                className="group rounded-2xl border border-[oklch(0.90_0.006_80)] overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <summary
                  className="flex items-center justify-between p-5 cursor-pointer font-bold text-[oklch(0.14_0.005_0)] hover:bg-[oklch(0.97_0.003_80)] transition-colors"
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                >
                  {faq.q}
                  <span className="text-[oklch(0.52_0.12_185)] text-xl font-light group-open:rotate-45 transition-transform">+</span>
                </summary>
                <div className="px-5 pb-5 text-[oklch(0.45_0.005_0)] leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {faq.a}
                </div>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* Back to Home */}
      <div className="py-8 text-center">
        <Link href="/">
          <span className="inline-flex items-center gap-2 text-[oklch(0.52_0.12_185)] font-semibold hover:gap-3 transition-all cursor-pointer" style={{ fontFamily: "'Cairo', sans-serif" }}>
            <ArrowLeft size={16} />
            {t.storeProduct.backToHome}
          </span>
        </Link>
      </div>
    </div>
  );
}
