/**
 * Tips.tsx — صفحة نصائح الحج والعمرة
 * متعددة اللغات: 9 لغات مدعومة
 */
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { wafdWhatsAppLink } from "@/lib/wafd-constants";
import {
  BookOpen,
  Heart,
  Shield,
  Luggage,
  Clock,
  MapPin,
  Phone,
  CheckCircle2,
  AlertCircle,
  Star,
  ArrowLeft,
} from "lucide-react";

const HERO_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hero-kaaba-HJyJeNN97h7PfMrmAAMs2W.webp";

export default function Tips() {
  const { t, dir } = useLanguage();
  const tips = t.tips;

  const categories = [
    {
      icon: <BookOpen size={28} />,
      title: tips.cat1Title,
      desc: tips.cat1Desc,
      color: "oklch(0.52 0.12 185)",
      bg: "oklch(0.94 0.008 185)",
      items: [
        tips.spiritual1,
        tips.spiritual2,
        tips.spiritual3,
        tips.spiritual4,
        tips.spiritual5,
      ],
    },
    {
      icon: <Luggage size={28} />,
      title: tips.cat2Title,
      desc: tips.cat2Desc,
      color: "oklch(0.60 0.09 75)",
      bg: "oklch(0.96 0.006 75)",
      items: [
        tips.packing1,
        tips.packing2,
        tips.packing3,
        tips.packing4,
        tips.packing5,
      ],
    },
    {
      icon: <Heart size={28} />,
      title: tips.cat3Title,
      desc: tips.cat3Desc,
      color: "oklch(0.55 0.15 25)",
      bg: "oklch(0.96 0.008 25)",
      items: [
        tips.health1,
        tips.health2,
        tips.health3,
        tips.health4,
        tips.health5,
      ],
    },
    {
      icon: <Shield size={28} />,
      title: tips.cat4Title,
      desc: tips.cat4Desc,
      color: "oklch(0.52 0.12 145)",
      bg: "oklch(0.95 0.008 145)",
      items: [
        tips.safety1,
        tips.safety2,
        tips.safety3,
        tips.safety4,
        tips.safety5,
      ],
    },
    {
      icon: <Clock size={28} />,
      title: tips.cat5Title,
      desc: tips.cat5Desc,
      color: "oklch(0.50 0.12 280)",
      bg: "oklch(0.95 0.008 280)",
      items: [
        tips.timing1,
        tips.timing2,
        tips.timing3,
        tips.timing4,
        tips.timing5,
      ],
    },
    {
      icon: <MapPin size={28} />,
      title: tips.cat6Title,
      desc: tips.cat6Desc,
      color: "oklch(0.48 0.12 310)",
      bg: "oklch(0.95 0.008 310)",
      items: [
        tips.places1,
        tips.places2,
        tips.places3,
        tips.places4,
        tips.places5,
      ],
    },
  ];

  const importantNotes = [
    { type: "warning", text: tips.note1 },
    { type: "warning", text: tips.note2 },
    { type: "info", text: tips.note3 },
    { type: "info", text: tips.note4 },
  ];

  return (
    <div className="overflow-x-hidden" dir={dir}>
      {/* ─── Hero ─── */}
      <section className="relative h-72 md:h-96 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={HERO_IMG}
            alt={tips.heroTitle}
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, oklch(0.14 0.005 0 / 0.6) 0%, oklch(0.14 0.005 0 / 0.8) 100%)",
            }}
          />
        </div>
        <motion.div
          className="relative z-10 text-center text-white px-4 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div
            className="text-[oklch(0.72_0.09_75)] text-sm tracking-widest mb-3"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            ✦ {tips.heroTag} ✦
          </div>
          <h1
            className="text-3xl md:text-5xl font-bold text-white mb-4"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            {tips.heroTitle}
          </h1>
          <p
            className="text-white/80 text-lg max-w-2xl mx-auto"
            style={{ fontFamily: "'Tajawal', sans-serif" }}
          >
            {tips.heroSubtitle}
          </p>
        </motion.div>
      </section>

      {/* ─── Intro ─── */}
      <section className="py-12 px-4" style={{ background: "oklch(0.98 0.003 80)" }}>
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-3xl p-8 shadow-md border border-[oklch(0.90_0.006_80)]"
          >
            <Star
              size={40}
              className="mx-auto mb-4 text-[oklch(0.60_0.09_75)]"
              fill="oklch(0.60 0.09 75)"
            />
            <h2
              className="text-2xl font-bold text-[oklch(0.14_0.005_0)] mb-3"
              style={{ fontFamily: "'Cairo', sans-serif" }}
            >
              {tips.introTitle}
            </h2>
            <p
              className="text-[oklch(0.45_0.005_0)] leading-relaxed"
              style={{ fontFamily: "'Tajawal', sans-serif" }}
            >
              {tips.introText}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ─── Tips Categories ─── */}
      <section className="py-16 px-4" style={{ background: "oklch(0.975 0.004 80)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-3xl font-bold text-[oklch(0.14_0.005_0)] mb-3"
              style={{ fontFamily: "'Cairo', sans-serif" }}
            >
              {tips.categoriesTitle}
            </h2>
            <p
              className="text-[oklch(0.55_0.005_0)]"
              style={{ fontFamily: "'Tajawal', sans-serif" }}
            >
              {tips.categoriesSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {categories.map((cat, idx) => (
              <motion.div
                key={idx}
                className="bg-white rounded-2xl p-6 shadow-md border border-[oklch(0.90_0.006_80)] hover:shadow-lg transition-shadow"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: cat.bg, color: cat.color }}
                >
                  {cat.icon}
                </div>
                {/* Title */}
                <h3
                  className="text-lg font-bold text-[oklch(0.14_0.005_0)] mb-2"
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                >
                  {cat.title}
                </h3>
                <p
                  className="text-sm text-[oklch(0.55_0.005_0)] mb-4"
                  style={{ fontFamily: "'Tajawal', sans-serif" }}
                >
                  {cat.desc}
                </p>
                {/* Tips list */}
                <ul className="space-y-2">
                  {cat.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-[oklch(0.40_0.005_0)]"
                    >
                      <CheckCircle2
                        size={14}
                        className="flex-shrink-0 mt-0.5"
                        style={{ color: cat.color }}
                      />
                      <span style={{ fontFamily: "'Tajawal', sans-serif" }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Important Notes ─── */}
      <section className="py-16 px-4" style={{ background: "oklch(0.98 0.003 80)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2
              className="text-2xl font-bold text-[oklch(0.14_0.005_0)] mb-2"
              style={{ fontFamily: "'Cairo', sans-serif" }}
            >
              {tips.notesTitle}
            </h2>
          </div>
          <div className="space-y-4">
            {importantNotes.map((note, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl border"
                style={{
                  background:
                    note.type === "warning"
                      ? "oklch(0.98 0.010 75)"
                      : "oklch(0.97 0.008 185)",
                  borderColor:
                    note.type === "warning"
                      ? "oklch(0.85 0.06 75)"
                      : "oklch(0.85 0.06 185)",
                }}
                initial={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <AlertCircle
                  size={20}
                  className="flex-shrink-0 mt-0.5"
                  style={{
                    color:
                      note.type === "warning"
                        ? "oklch(0.60 0.09 75)"
                        : "oklch(0.52 0.12 185)",
                  }}
                />
                <p
                  className="text-sm text-[oklch(0.35_0.005_0)]"
                  style={{ fontFamily: "'Tajawal', sans-serif" }}
                >
                  {note.text}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section
        className="py-16 px-4"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.14 0.005 0), oklch(0.20 0.008 185))",
        }}
      >
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div
              className="text-[oklch(0.72_0.09_75)] text-sm mb-4"
              style={{ fontFamily: "'Amiri', serif" }}
            >
              ✦ {tips.ctaTag} ✦
            </div>
            <h2
              className="text-3xl font-bold text-white mb-4"
              style={{ fontFamily: "'Cairo', sans-serif" }}
            >
              {tips.ctaTitle}
            </h2>
            <p
              className="text-white/70 mb-8 max-w-xl mx-auto"
              style={{ fontFamily: "'Tajawal', sans-serif" }}
            >
              {tips.ctaDesc}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.a
                href={wafdWhatsAppLink("general")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white font-bold"
                style={{
                  background: "#25D366",
                  fontFamily: "'Cairo', sans-serif",
                  boxShadow: "0 8px 30px #25D36650",
                }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                <Phone size={18} />
                {tips.ctaWhatsapp}
              </motion.a>
              <Link href="/packages">
                <motion.span
                  className="flex items-center gap-2 px-8 py-4 rounded-full text-white font-semibold border border-white/30 hover:bg-white/10 transition-colors cursor-pointer"
                  style={{
                    fontFamily: "'Cairo', sans-serif",
                    backdropFilter: "blur(10px)",
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <ArrowLeft size={16} className={dir === "ltr" ? "rotate-180" : ""} />
                  {tips.ctaBrowse}
                </motion.span>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
