/**
 * WAFD HOME PAGE — Warm Welcome Sanctuary Design
 * NOTE: This file was preserved from the project's original implementation.
 * Colors: Teal #1B8A8A, Gray #9B9B9B, Dark #1C1C1C, Cream #F9F6F0, Gold #C8A96E
 * Typography: Cairo (headings), Tajawal (body), Amiri (decorative)
 */
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Link } from "wouter";
import { ChevronDown, Star, Shield, Heart, Award, ArrowLeft, Phone, ShoppingBag } from "lucide-react";
import { wafdWhatsAppLink, WAFD_PHONE, WAFD_PHONE_DISPLAY, WAFD_EMAIL, WAFD_WEBSITE } from "../lib/wafd-constants";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteData } from "@/contexts/SiteDataContext";
import DynamicSections from "@/components/DynamicSections";

const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hero-kaaba-HJyJeNN97h7PfMrmAAMs2W.webp";
const MADINAH_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-madinah-mLYiJhvGYuvzquRMzJikST.webp";
const GROUP_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-umrah-group-BnpX9ASFQabKmJ7XA7wh9j.webp";
const HOTEL_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hotel-makkah-WYrvVrLjdJdmpSUqPRnpcC.webp";
const TRANSPORT_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-transport-QQDUMvQJAjEuRcZsn5eb8H.webp";



function useCounter(target: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          const start = Date.now();
          const tick = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration, started]);

  return { count, ref };
}

function StatCard({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { count, ref } = useCounter(value);
  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-bold wafd-shimmer-text" style={{ fontFamily: "'Cairo', sans-serif" }}>
        {count.toLocaleString("ar-SA")}{suffix}
      </div>
      <div className="mt-2 text-sm text-white/70" style={{ fontFamily: "'Tajawal', sans-serif" }}>{label}</div>
    </div>
  );
}

function ServiceCard({ icon, title, desc, href, comingSoon = false }: { icon: React.ReactNode; title: string; desc: string; href: string; comingSoon?: boolean }) {
  return (
    <motion.div
      className={`group bg-white rounded-2xl p-6 shadow-md border wafd-card-hover relative overflow-hidden ${
        comingSoon ? "border-[oklch(0.90_0.006_80)] opacity-80" : "border-[oklch(0.90_0.006_80)] cursor-pointer"
      }`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
    >
      {comingSoon && (
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold text-white"
          style={{ background: "linear-gradient(135deg, oklch(0.72 0.09 75), oklch(0.60 0.08 75))", fontFamily: "'Cairo', sans-serif" }}>
          قريباً
        </div>
      )}
      <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-colors"
        style={{ background: comingSoon ? "oklch(0.96 0.004 80)" : "oklch(0.94 0.008 185)" }}>
        <div className={comingSoon ? "text-[oklch(0.70_0.005_0)]" : "text-[oklch(0.52_0.12_185)]"}>{icon}</div>
      </div>
      <h3 className="text-lg font-bold text-[oklch(0.14_0.005_0)] mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
        {title}
      </h3>
      <p className="text-sm text-[oklch(0.62_0.005_0)] leading-relaxed mb-4" style={{ fontFamily: "'Tajawal', sans-serif" }}>
        {desc}
      </p>
      {comingSoon ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[oklch(0.72_0.09_75)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
          سيتوفر قريباً
        </span>
      ) : (
        <a
          href={`https://wa.me/${WAFD_PHONE}?text=${encodeURIComponent(`السلام عليكم، أود الاستفسار عن خدمة: ${title}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[oklch(0.52_0.12_185)] group-hover:gap-3 transition-all"
          style={{ fontFamily: "'Cairo', sans-serif" }}
        >
          اطلب الخدمة
          <ArrowLeft size={14} className="rotate-180" />
        </a>
      )}
    </motion.div>
  );
}

function FeaturedPackages() {
  // المتجر يُبنى كوحدة غيث أصلية لاحقاً (T004). حتى ذلك الحين لا تُعرض باقات
  // وهمية — يبقى القسم مخفياً (لا بيانات مزيّفة).
  const data = null as { products: Array<{ id: number; name: string; durationDays: number; images: unknown }> } | null;
  if (!data?.products?.length) return null;
  return (
    <section className="py-20 bg-white" dir="rtl">
      <div className="container">
        <div className="text-center mb-12 wafd-reveal">
          <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
            باقاتنا المتاحة الآن
          </span>
          <h2 className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)] mt-2 mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
            احجز رحلتك مباشرة
          </h2>
          <p className="text-[oklch(0.62_0.005_0)] text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            باقات عمرة متكاملة — سجّل حسابك للاطلاع على الأسعار والحجز مباشرة
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {data.products.map((pkg, i) => (
            <motion.div
              key={pkg.id}
              className="bg-white rounded-2xl overflow-hidden shadow-md border border-[oklch(0.90_0.006_80)] hover:shadow-xl transition-shadow"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              {(pkg.images as string[])?.[0] ? (
                <div className="relative h-44 overflow-hidden">
                  <img src={(pkg.images as string[])[0]} alt={pkg.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 40%, oklch(0.14 0.005 0 / 0.5) 100%)" }} />
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center" style={{ background: "oklch(0.94 0.008 185)" }}>
                  <ShoppingBag size={48} className="text-[oklch(0.52_0.12_185)] opacity-40" />
                </div>
              )}
              <div className="p-5">
                <h3 className="font-black text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>{pkg.name}</h3>
                <p className="text-xs text-[oklch(0.52_0.12_185)] mb-3 font-medium" style={{ fontFamily: "'Tajawal', sans-serif" }}>{pkg.durationDays} أيام</p>
                <div className="mb-4">
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ background: "oklch(0.96 0.008 75)", color: "oklch(0.52 0.09 75)", fontFamily: "'Cairo', sans-serif" }}
                  >
                    🔒 سجّل للحصول على السعر
                  </span>
                </div>
                <Link href={`/packages/${pkg.id}`}>
                  <button
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                    style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}
                  >
                    استكشف الباقة
                    <ArrowLeft size={14} className="rotate-180" />
                  </button>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/packages">
            <button
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold border-2 transition-all"
              style={{ borderColor: "oklch(0.52 0.12 185)", color: "oklch(0.52 0.12 185)", fontFamily: "'Cairo', sans-serif" }}
            >
              عرض جميع الباقات
              <ArrowLeft size={14} className="rotate-180" />
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function StepCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <motion.div
      className="flex gap-4 items-start"
      initial={{ opacity: 0, x: 30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
        style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}>
        {num}
      </div>
      <div>
        <h4 className="font-bold text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>{title}</h4>
        <p className="text-sm text-[oklch(0.62_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>{desc}</p>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const { t, dir } = useLanguage();
  const h = t.home;
  const { faqs: dynamicFaqs } = useSiteData();
  const faqItems =
    dynamicFaqs.length > 0
      ? dynamicFaqs.map((f) => ({ q: f.question, a: f.answer }))
      : [
          { q: h.faqQ1, a: h.faqA1 },
          { q: h.faqQ2, a: h.faqA2 },
          { q: h.faqQ3, a: h.faqA3 },
          { q: h.faqQ4, a: h.faqA4 },
          { q: h.faqQ5, a: h.faqA5 },
          { q: h.faqQ6, a: h.faqA6 },
        ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    document.querySelectorAll(".wafd-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="overflow-x-hidden relative" dir={dir}>

      {/* ===== HERO SECTION ===== */}
      <section ref={heroRef} className="relative h-screen min-h-[600px] flex items-center justify-center overflow-hidden">
        {/* Background Image with Parallax */}
        <motion.div
          className="absolute inset-0 z-0"
          style={{ y: heroY }}
        >
          <img
            src={HERO_IMG}
            alt="المسجد الحرام"
            className="w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, oklch(0.14 0.005 0 / 0.55) 0%, oklch(0.14 0.005 0 / 0.75) 100%)" }} />
        </motion.div>

        {/* Floating Particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${8 + i * 4}px`,
              height: `${8 + i * 4}px`,
              background: `oklch(0.52 0.12 185 / ${0.2 + i * 0.05})`,
              right: `${10 + i * 15}%`,
              top: `${20 + i * 10}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.3, 0.7, 0.3],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 4 + i,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.5,
            }}
          />
        ))}

        {/* Hero Content */}
        <motion.div
          className="relative z-10 text-center text-white px-4 max-w-4xl mx-auto"
          style={{ opacity: heroOpacity }}
        >
          {/* Decorative Arabic word */}
          <motion.div
            className="text-[oklch(0.72_0.09_75)] text-sm tracking-widest mb-4 font-medium"
            style={{ fontFamily: "'Cairo', sans-serif" }}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {h.heroWelcome}
          </motion.div>

          <motion.div
            className="flex justify-center mb-4"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png"
              alt="شعار وفد"
              className="h-36 md:h-48 w-auto object-contain drop-shadow-2xl"
              style={{ filter: "drop-shadow(0 8px 24px oklch(0 0 0 / 0.4)) brightness(1.1)" }}
            />
          </motion.div>

          {/* H1 وصفي لـ SEO - يحتوي على الكلمات المفتاحية الرئيسية */}
          <motion.h1
            className="text-5xl md:text-7xl font-thin tracking-[0.25em] text-white mb-1"
            style={{ fontFamily: "'Cairo', sans-serif", letterSpacing: "0.3em" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55 }}
          >
            {h.heroTitle}
          </motion.h1>

          <motion.p
            className="text-xl md:text-2xl font-light mb-2 text-white/80"
            style={{ fontFamily: "'Tajawal', sans-serif", letterSpacing: "0.05em" }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.65 }}
          >
            {h.heroSubtitle}
          </motion.p>

          <motion.div
            className="w-16 h-0.5 mx-auto mb-6"
            style={{ background: "linear-gradient(90deg, oklch(0.72 0.09 75), oklch(0.85 0.07 75))" }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          />

          <motion.p
            className="text-base md:text-lg text-white/80 max-w-2xl mx-auto leading-relaxed mb-10"
            style={{ fontFamily: "'Tajawal', sans-serif" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.0 }}
          >
            {h.heroDesc}
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            <motion.a
          href={wafdWhatsAppLink("general")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-white font-bold text-base wafd-btn-glow"            style={{
                background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                fontFamily: "'Cairo', sans-serif",
                boxShadow: "0 8px 30px oklch(0.52 0.12 185 / 0.4)",
              }}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {h.bookWhatsApp}
            </motion.a>
            <Link href="/book">
              <motion.span
                className="flex items-center gap-2 px-8 py-4 rounded-full text-white font-semibold text-base cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, oklch(0.72 0.09 75), oklch(0.60 0.08 75))",
                  fontFamily: "'Cairo', sans-serif",
                  boxShadow: "0 8px 30px oklch(0.72 0.09 75 / 0.35)",
                }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {h.bookAppointment}
              </motion.span>
            </Link>
            <Link href="/services">
              <motion.span
                className="flex items-center gap-2 px-8 py-4 rounded-full text-white font-semibold text-base border border-white/30 hover:bg-white/10 transition-colors cursor-pointer"
                style={{ fontFamily: "'Cairo', sans-serif", backdropFilter: "blur(10px)" }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                {h.discoverServices}
              </motion.span>
            </Link>
          </motion.div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-white/60 flex flex-col items-center gap-1"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="text-xs" style={{ fontFamily: "'Cairo', sans-serif" }}>{h.scrollDown}</span>
          <ChevronDown size={20} />
        </motion.div>
      </section>

      {/* ===== VALUES SECTION ===== */}
      <section className="py-16 wafd-gradient-dark relative overflow-hidden">
        <div className="absolute inset-0 wafd-pattern-overlay opacity-30" />
        <div className="container relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { icon: "🗋", label: h.visaService, sub: h.availableNow, available: true },
              { icon: "🚐", label: h.transportService, sub: h.availableNow, available: true },
              { icon: "🏨", label: h.hotelsService, sub: h.availableNow, available: true },
              { icon: "📋", label: h.programsService, sub: h.availableNow, available: true },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-4xl mb-2">{item.icon}</div>
                <div className="text-white font-bold text-sm mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>{item.label}</div>
                <div className={`text-xs font-semibold ${item.available ? "text-[oklch(0.72_0.09_75)]" : "text-white/50"}`} style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {item.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SERVICES SECTION ===== */}
      <section className="py-20 bg-[oklch(0.975_0.008_80)]">
        <div className="container">
          <div className="text-center mb-14 wafd-reveal">
            <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {h.servicesTitle}
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)] mt-2 mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {h.servicesHeading}
            </h2>
            <div className="flex items-center justify-center gap-3">
              <div className="wafd-gold-line" />
              <span className="text-[oklch(0.72_0.09_75)] text-lg" style={{ fontFamily: "'Amiri', serif" }}>{h.servicesSubheading}</span>
              <div className="wafd-gold-line" />
            </div>
            <p className="mt-4 text-[oklch(0.62_0.005_0)] max-w-xl mx-auto text-sm leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {h.servicesDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <ServiceCard
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>}
              title={h.visaService}
              desc={h.visaServiceDesc}
              href="/services"
            />
            <ServiceCard
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m-4 10h6a2 2 0 002-2v-5a2 2 0 00-2-2h-6a2 2 0 00-2 2v5a2 2 0 002 2zm1-4a1 1 0 100-2 1 1 0 000 2z"/></svg>}
              title={h.transportService}
              desc={h.transportServiceDesc}
              href="/services"
            />
            <ServiceCard
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
              title={h.hotelsService}
              desc={h.hotelsServiceDesc}
              href="/hotels"
            />
            <ServiceCard
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>}
              title={h.programsService}
              desc={h.programsServiceDesc}
              href="/packages"
            />
          </div>

          <div className="text-center mt-10">
            <Link href="/services">
              <motion.span
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-semibold text-white cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                  fontFamily: "'Cairo', sans-serif",
                }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                {h.viewAllServices}
                <ArrowLeft size={16} className="rotate-180" />
              </motion.span>
            </Link>
          </div>
        </div>
      </section>

      {/* ===== WHY WAFD SECTION ===== */}
      <section className="py-20 bg-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-5"
          style={{ background: "oklch(0.52 0.12 185)", transform: "translate(30%, -30%)" }} />
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Image */}
            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                <img src={GROUP_IMG} alt="ضيوف الرحمن" className="w-full h-80 md:h-96 object-cover" />
                <div className="absolute inset-0"
                  style={{ background: "linear-gradient(180deg, transparent 60%, oklch(0.14 0.005 0 / 0.5) 100%)" }} />
              </div>
              {/* Floating badge */}
              <motion.div
                className="absolute -bottom-4 -left-4 bg-white rounded-xl p-4 shadow-xl border border-[oklch(0.90_0.006_80)]"
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4, type: "spring" }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: "oklch(0.94 0.008 185)" }}>
                    <Shield size={18} className="text-[oklch(0.52_0.12_185)]" />
                  </div>
                  <div>
                    <div className="font-bold text-[oklch(0.14_0.005_0)] text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>{h.startupBadge}</div>
                    <div className="text-xs text-[oklch(0.62_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>{h.startupBadgeDesc}</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
                {h.whyWafd}
              </span>
              <h2 className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)] mt-2 mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
                {h.whyHeading}
                <br />
                <span className="wafd-text-gradient">{h.whySubheading}</span>
              </h2>
              <p className="text-[oklch(0.62_0.005_0)] leading-relaxed mb-6 text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                {h.whyDesc}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  { icon: <Heart size={18} />, label: h.hospitality, desc: h.hospitalityDesc },
                  { icon: <Shield size={18} />, label: h.commitment, desc: h.commitmentDesc },
                  { icon: <Star size={18} />, label: h.transparency, desc: h.transparencyDesc },
                  { icon: <Award size={18} />, label: h.excellence, desc: h.excellenceDesc },
                ].map((item) => (
                  <div key={item.label} className="flex gap-3 items-start p-3 rounded-xl hover:bg-[oklch(0.94_0.008_185)] transition-colors">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[oklch(0.52_0.12_185)]"
                      style={{ background: "oklch(0.94 0.008 185)" }}>
                      {item.icon}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>{item.label}</div>
                      <div className="text-xs text-[oklch(0.62_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <a
                href={wafdWhatsAppLink("general")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-sm"
                style={{
                  background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                  fontFamily: "'Cairo', sans-serif",
                  boxShadow: "0 4px 20px oklch(0.52 0.12 185 / 0.3)",
                }}
              >
                {h.contactNow}
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== PROGRAMS PREVIEW ===== */}
      <section className="py-20" style={{ background: "oklch(0.975 0.008 80)" }}>
        <div className="container">
          <div className="text-center mb-14 wafd-reveal">
            <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {h.programsTitle}
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)] mt-2 mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {h.programsHeading}
            </h2>
            <div className="flex items-center justify-center gap-3">
              <div className="wafd-gold-line" />
              <span className="text-[oklch(0.72_0.09_75)] text-lg" style={{ fontFamily: "'Amiri', serif" }}>{h.programsSubheading}</span>
              <div className="wafd-gold-line" />
            </div>
            <p className="mt-3 text-[oklch(0.62_0.005_0)] text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {h.programsDesc}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: h.programEconomic,
                subtitle: h.programEconomicSub,
                features: [h.visaService, h.transportService, h.hotelsService, h.programsService],
                img: HOTEL_IMG,
              },
              {
                title: h.programPremium,
                subtitle: h.programPremiumSub,
                features: [h.visaService, h.transportService, h.hotelsService, h.programsService],
                img: MADINAH_IMG,
              },
              {
                title: h.programLastTen,
                subtitle: h.programLastTenSub,
                features: [h.visaService, h.transportService, h.hotelsService, h.programsService],
                img: TRANSPORT_IMG,
              },
            ].map((prog, i) => (
              <motion.div
                key={prog.title}
                className="bg-white rounded-2xl overflow-hidden shadow-md border border-[oklch(0.90_0.006_80)] relative opacity-85"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="relative h-44 overflow-hidden">
                  <img src={prog.img} alt={prog.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0"
                    style={{ background: "linear-gradient(180deg, transparent 40%, oklch(0.14 0.005 0 / 0.6) 100%)" }} />
                  <span className="absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold text-white"
                    style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}>
                    {h.availableNow}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="font-black text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>{prog.title}</h3>
                  <p className="text-xs text-[oklch(0.52_0.12_185)] mb-3 font-medium" style={{ fontFamily: "'Tajawal', sans-serif" }}>{prog.subtitle}</p>
                  <ul className="space-y-1.5 mb-4">
                    {prog.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[oklch(0.62_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                        <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: "oklch(0.96 0.004 80)" }}>
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 4l2 2 4-4" stroke="oklch(0.70 0.005 0)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/packages">
                    <button
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                      style={{
                        background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                        fontFamily: "'Cairo', sans-serif",
                      }}
                    >
                      احجز الآن
                      <ArrowLeft size={14} className="rotate-180" />
                    </button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link href="/packages">
              <button
                className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold border-2 transition-all"
                style={{ borderColor: "oklch(0.52 0.12 185)", color: "oklch(0.52 0.12 185)", fontFamily: "'Cairo', sans-serif" }}
              >
                عرض جميع البرامج
                <ArrowLeft size={14} className="rotate-180" />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ===== FEATURED PACKAGES FROM STORE ===== */}
      <FeaturedPackages />

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-20 bg-white">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
                {h.howItWorksTitle}
              </span>
              <h2 className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)] mt-2 mb-8" style={{ fontFamily: "'Cairo', sans-serif" }}>
                {h.howItWorksHeading}
                <br />
                <span className="wafd-text-gradient">{h.howItWorksSubheading}</span>
              </h2>
              <div className="space-y-6">
                <StepCard num="١" title={h.step1Title} desc={h.step1Desc} />
                <StepCard num="٢" title={h.step2Title} desc={h.step2Desc} />
                <StepCard num="٣" title={h.step3Title} desc={h.step3Desc} />
                <StepCard num="٤" title={h.step4Title} desc={h.step4Desc} />
              </div>
            </div>

            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <div className="rounded-2xl overflow-hidden shadow-2xl">
                <img src={MADINAH_IMG} alt="المسجد النبوي" className="w-full h-96 object-cover" />
              </div>
              <div className="absolute -bottom-6 -right-6 w-32 h-32 rounded-2xl overflow-hidden shadow-xl border-4 border-white">
                <img src={TRANSPORT_IMG} alt="النقل" className="w-full h-full object-cover" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== FAQ SECTION ===== */}
      <section className="py-20 bg-[oklch(0.98_0.002_80)]" dir="rtl">
        <div className="container max-w-3xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="text-[oklch(0.72_0.09_75)] text-sm tracking-widest mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>✦ {h.faqTitle} ✦</div>
            <h2 className="text-3xl md:text-4xl font-bold text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>{h.faqHeading}</h2>
            <p className="text-[oklch(0.50_0.005_0)] mt-2" style={{ fontFamily: "'Tajawal', sans-serif" }}>{h.faqSubheading}</p>
          </motion.div>
          <div className="space-y-3">
            {faqItems.map((faq, i) => (
              <motion.details
                key={i}
                className="group rounded-2xl border border-[oklch(0.90_0.006_80)] bg-white overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <summary
                  className="flex items-center justify-between p-5 cursor-pointer font-bold text-[oklch(0.14_0.005_0)] hover:bg-[oklch(0.97_0.003_80)] transition-colors list-none"
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                >
                  <span>{faq.q}</span>
                  <span className="text-[oklch(0.52_0.12_185)] text-xl font-light flex-shrink-0 mr-3 group-open:rotate-45 transition-transform inline-block">+</span>
                </summary>
                <div className="px-5 pb-5 text-[oklch(0.45_0.005_0)] leading-relaxed border-t border-[oklch(0.94_0.004_80)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  <p className="pt-4">{faq.a}</p>
                </div>
              </motion.details>
            ))}
          </div>
          <motion.div
            className="text-center mt-10"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >            <p className="text-[oklch(0.50_0.005_0)] mb-4" style={{ fontFamily: "'Tajawal', sans-serif" }}>{h.faqNoAnswer}</p>
            <a
              href={wafdWhatsAppLink("general")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-bold text-sm"
              style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}
            >
              {h.askWhatsApp}
            </a>
          </motion.div>
        </div>
      </section>

      {/* ===== أقسام مُدارة من لوحة تحكم غيث: آراء العملاء + الفريق + المعرض ===== */}
      <DynamicSections />

      {/* ===== CTA SECTION ===== */}
      <section className="py-20 wafd-gradient-dark relative overflow-hidden">
        <div className="absolute inset-0 wafd-pattern-overlay opacity-20" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10"
          style={{ background: "oklch(0.52 0.12 185)", filter: "blur(60px)" }} />
        <div className="container relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="text-[oklch(0.72_0.09_75)] text-lg mb-3" style={{ fontFamily: "'Amiri', serif" }}>
              ✦ {h.ctaTitle} ✦
            </div>
            <div className="flex justify-center mb-4">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png"
                alt="شعار وفد"
                className="h-24 md:h-28 w-auto object-contain"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {h.ctaHeading}
              <br />
              <span style={{ color: "oklch(0.72 0.09 75)" }}>{h.ctaSubheading}</span>
            </h2>
            <p className="text-white/70 max-w-xl mx-auto mb-8 leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {h.ctaDesc}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.a
                href={wafdWhatsAppLink("general")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 px-8 py-4 rounded-full font-bold text-white"
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
                {h.contactWhatsApp}
              </motion.a>
              <Link href="/contact">
                <motion.span
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-semibold text-white border border-white/30 hover:bg-white/10 transition-colors cursor-pointer"
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                  whileHover={{ scale: 1.03 }}
                >
                  <Phone size={18} />
                  {h.contactDetails}
                </motion.span>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="py-10 bg-[oklch(0.10_0.005_0)] text-white/60">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png"
                alt="شعار وفد"
                className="h-10 w-auto object-contain"
                style={{ filter: "brightness(0) invert(1)" }}
              />
              <span className="text-white/30">|</span>
              <span className="text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>لخدمة ضيوف الرحمن</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm justify-center" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {[
                { href: "/", label: "الرئيسية" },
                { href: "/services", label: "الخدمات" },
                { href: "/hotels", label: "الفنادق" },
                { href: "/programs", label: "البرامج" },
                { href: "/contact", label: "تواصل" },
                { href: "/privacy-policy", label: "سياسة الخصوصية" },
              ].map((l) => (
                <Link key={l.href} href={l.href}>
                  <span className="hover:text-[oklch(0.52_0.12_185)] transition-colors cursor-pointer">{l.label}</span>
                </Link>
              ))}
            </div>
            <div className="text-xs text-white/40" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              © {new Date().getFullYear()} وفد — جميع الحقوق محفوظة
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
