/**
 * HajjTips.tsx — صفحة نصائح الحج والعمرة الشاملة
 * متعددة اللغات — مُحسَّنة لـ SEO
 * تشمل: مناسك الحج، العمرة، الإرشادات الصحية، الأدعية، الأماكن المقدسة
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  BookOpen, Heart, Shield, Clock, MapPin, Star,
  ChevronDown, ChevronUp, Phone, ArrowLeft, CheckCircle2,
  AlertCircle, Sparkles, Users, Calendar
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { wafdWhatsAppLink } from "@/lib/wafd-constants";

const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hero-kaaba-HJyJeNN97h7PfMrmAAMs2W.webp";
const MADINAH_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-madinah-mLYiJhvGYuvzquRMzJikST.webp";

function AccordionItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[oklch(0.90_0.006_80)] rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-5 text-right bg-white hover:bg-[oklch(0.98_0.004_185)] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="font-bold text-[oklch(0.14_0.005_0)] text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>
          {question}
        </span>
        {open ? <ChevronUp size={18} className="text-[oklch(0.52_0.12_185)] flex-shrink-0" /> : <ChevronDown size={18} className="text-[oklch(0.62_0.005_0)] flex-shrink-0" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="px-5 pb-5 pt-2 bg-[oklch(0.98_0.004_185)] border-t border-[oklch(0.90_0.006_80)]">
              <p className="text-sm text-[oklch(0.45_0.005_0)] leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                {answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HajjTips() {
  const { t, dir } = useLanguage();
  const ht = t.hajjTips;

  const PILLARS = [
    { icon: <Calendar size={20} />, title: ht.pillar1Title, desc: ht.pillar1Desc, color: "oklch(0.52 0.12 185)" },
    { icon: <MapPin size={20} />, title: ht.pillar2Title, desc: ht.pillar2Desc, color: "oklch(0.60 0.09 75)" },
    { icon: <Users size={20} />, title: ht.pillar3Title, desc: ht.pillar3Desc, color: "oklch(0.55 0.12 30)" },
    { icon: <Star size={20} />, title: ht.pillar4Title, desc: ht.pillar4Desc, color: "oklch(0.50 0.10 280)" },
    { icon: <Heart size={20} />, title: ht.pillar5Title, desc: ht.pillar5Desc, color: "oklch(0.52 0.12 185)" },
  ];

  const UMRAH_STEPS = [
    { num: "١", title: ht.umrahStep1Title, desc: ht.umrahStep1Desc },
    { num: "٢", title: ht.umrahStep2Title, desc: ht.umrahStep2Desc },
    { num: "٣", title: ht.umrahStep3Title, desc: ht.umrahStep3Desc },
    { num: "٤", title: ht.umrahStep4Title, desc: ht.umrahStep4Desc },
    { num: "٥", title: ht.umrahStep5Title, desc: ht.umrahStep5Desc },
  ];

  const HEALTH_TIPS = [
    { icon: "💧", text: ht.health1 },
    { icon: "🌡️", text: ht.health2 },
    { icon: "👟", text: ht.health3 },
    { icon: "🧴", text: ht.health4 },
    { icon: "💊", text: ht.health5 },
    { icon: "🏥", text: ht.health6 },
  ];

  const FAQS = [
    { q: ht.faq1Q, a: ht.faq1A },
    { q: ht.faq2Q, a: ht.faq2A },
    { q: ht.faq3Q, a: ht.faq3A },
    { q: ht.faq4Q, a: ht.faq4A },
    { q: ht.faq5Q, a: ht.faq5A },
  ];

  const HOLY_PLACES = [
    { name: ht.place1Name, desc: ht.place1Desc, img: HERO_IMG },
    { name: ht.place2Name, desc: ht.place2Desc, img: MADINAH_IMG },
  ];

  return (
    <div className="overflow-x-hidden" dir={dir}>
      {/* ===== HERO ===== */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt={ht.heroTitle} className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, oklch(0.14 0.005 0 / 0.7) 0%, oklch(0.14 0.005 0 / 0.85) 100%)" }} />
        </div>
        <div className="relative z-10 text-center text-white px-4 max-w-4xl mx-auto">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-6"
            style={{ background: "oklch(0.52 0.12 185 / 0.3)", border: "1px solid oklch(0.52 0.12 185 / 0.5)" }}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Sparkles size={14} />
            <span style={{ fontFamily: "'Cairo', sans-serif" }}>{ht.heroTag}</span>
          </motion.div>
          <motion.h1
            className="text-4xl md:text-6xl font-black mb-4"
            style={{ fontFamily: "'Cairo', sans-serif" }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            {ht.heroTitle}
          </motion.h1>
          <motion.p
            className="text-lg text-white/80 max-w-2xl mx-auto mb-8"
            style={{ fontFamily: "'Tajawal', sans-serif" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
          >
            {ht.heroSubtitle}
          </motion.p>
          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
          >
            <a
              href={wafdWhatsAppLink("general")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white font-bold"
              style={{ background: "#25D366", fontFamily: "'Cairo', sans-serif", boxShadow: "0 8px 30px #25D36650" }}
            >
              <Phone size={18} />
              {ht.ctaWhatsapp}
            </a>
            <Link href="/packages">
              <span
                className="flex items-center gap-2 px-8 py-4 rounded-full text-white font-semibold border border-white/30 hover:bg-white/10 transition-colors cursor-pointer"
                style={{ fontFamily: "'Cairo', sans-serif" }}
              >
                <ArrowLeft size={16} className={dir === "ltr" ? "rotate-180" : ""} />
                {ht.ctaBrowse}
              </span>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ===== أركان الحج ===== */}
      <section className="py-20 px-4" style={{ background: "oklch(0.975 0.008 80)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-4"
              style={{ background: "oklch(0.94 0.008 185)", color: "oklch(0.38 0.10 185)" }}>
              <BookOpen size={14} />
              <span style={{ fontFamily: "'Cairo', sans-serif" }}>{ht.pillarsTag}</span>
            </div>
            <h2 className="text-3xl font-black text-[oklch(0.14_0.005_0)] mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {ht.pillarsTitle}
            </h2>
            <p className="text-[oklch(0.62_0.005_0)] max-w-xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {ht.pillarsSubtitle}
            </p>
          </div>
          <div className="grid md:grid-cols-5 gap-4">
            {PILLARS.map((p, i) => (
              <motion.div
                key={i}
                className="bg-white rounded-2xl p-6 text-center shadow-sm border border-[oklch(0.92_0.005_80)]"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: `${p.color}20`, color: p.color }}>
                  {p.icon}
                </div>
                <div className="text-2xl font-black mb-2" style={{ color: p.color, fontFamily: "'Cormorant Garamond', serif" }}>
                  {i + 1}
                </div>
                <h3 className="font-bold text-[oklch(0.14_0.005_0)] mb-2 text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {p.title}
                </h3>
                <p className="text-xs text-[oklch(0.62_0.005_0)] leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {p.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== خطوات العمرة ===== */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-[oklch(0.14_0.005_0)] mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {ht.umrahStepsTitle}
            </h2>
            <p className="text-[oklch(0.62_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {ht.umrahStepsSubtitle}
            </p>
          </div>
          <div className="space-y-4">
            {UMRAH_STEPS.map((step, i) => (
              <motion.div
                key={i}
                className="flex gap-5 items-start p-5 rounded-2xl border border-[oklch(0.92_0.005_80)] hover:border-[oklch(0.52_0.12_185)] transition-colors"
                initial={{ opacity: 0, x: dir === "rtl" ? 30 : -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg"
                  style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cormorant Garamond', serif" }}>
                  {step.num}
                </div>
                <div>
                  <h3 className="font-bold text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>
                    {step.title}
                  </h3>
                  <p className="text-sm text-[oklch(0.62_0.005_0)] leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== الأماكن المقدسة ===== */}
      <section className="py-20 px-4" style={{ background: "oklch(0.975 0.008 80)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-[oklch(0.14_0.005_0)] mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {ht.holyPlacesTitle}
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {HOLY_PLACES.map((place, i) => (
              <motion.div
                key={i}
                className="rounded-2xl overflow-hidden shadow-lg"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.2 }}
              >
                <div className="relative h-48">
                  <img src={place.img} alt={place.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, oklch(0.14 0.005 0 / 0.8), transparent)" }} />
                  <div className="absolute bottom-4 right-4 left-4">
                    <h3 className="text-white font-black text-lg" style={{ fontFamily: "'Cairo', sans-serif" }}>
                      {place.name}
                    </h3>
                  </div>
                </div>
                <div className="p-5 bg-white">
                  <p className="text-sm text-[oklch(0.45_0.005_0)] leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                    {place.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== النصائح الصحية ===== */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-4"
              style={{ background: "oklch(0.95 0.010 75)", color: "oklch(0.50 0.09 75)" }}>
              <Shield size={14} />
              <span style={{ fontFamily: "'Cairo', sans-serif" }}>{ht.healthTag}</span>
            </div>
            <h2 className="text-3xl font-black text-[oklch(0.14_0.005_0)] mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {ht.healthTitle}
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {HEALTH_TIPS.map((tip, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-4 p-4 rounded-xl border border-[oklch(0.92_0.005_80)]"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <span className="text-2xl flex-shrink-0">{tip.icon}</span>
                <p className="text-sm text-[oklch(0.35_0.005_0)] leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {tip.text}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== الأسئلة الشائعة ===== */}
      <section className="py-20 px-4" style={{ background: "oklch(0.975 0.008 80)" }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-[oklch(0.14_0.005_0)] mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {ht.faqTitle}
            </h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== الدعاء المأثور ===== */}
      <section
        className="py-16 px-4 text-center"
        style={{ background: "linear-gradient(135deg, oklch(0.14 0.005 0), oklch(0.20 0.008 185))" }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="text-[oklch(0.72_0.09_75)] text-3xl mb-4" style={{ fontFamily: "'Amiri', serif" }}>
            ❝
          </div>
          <p className="text-white text-xl md:text-2xl leading-loose mb-6" style={{ fontFamily: "'Amiri', serif" }}>
            {ht.duaText}
          </p>
          <p className="text-white/60 text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            {ht.duaSource}
          </p>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-6"
            style={{ background: "oklch(0.94 0.008 185)", color: "oklch(0.38 0.10 185)" }}>
            <CheckCircle2 size={14} />
            <span style={{ fontFamily: "'Cairo', sans-serif" }}>{ht.ctaTag}</span>
          </div>
          <h2 className="text-3xl font-black text-[oklch(0.14_0.005_0)] mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {ht.ctaTitle}
          </h2>
          <p className="text-[oklch(0.62_0.005_0)] mb-8 max-w-xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            {ht.ctaDesc}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={wafdWhatsAppLink("general")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white font-bold"
              style={{ background: "#25D366", fontFamily: "'Cairo', sans-serif", boxShadow: "0 8px 30px #25D36650" }}
            >
              <Phone size={18} />
              {ht.ctaWhatsapp}
            </a>
            <Link href="/packages">
              <span
                className="flex items-center gap-2 px-8 py-4 rounded-full font-semibold border cursor-pointer hover:bg-[oklch(0.97_0.004_185)] transition-colors"
                style={{ borderColor: "oklch(0.52 0.12 185)", color: "oklch(0.52 0.12 185)", fontFamily: "'Cairo', sans-serif" }}
              >
                <ArrowLeft size={16} className={dir === "ltr" ? "rotate-180" : ""} />
                {ht.ctaBrowse}
              </span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
