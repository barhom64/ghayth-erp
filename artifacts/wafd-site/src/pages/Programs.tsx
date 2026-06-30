/**
 * WAFD PROGRAMS PAGE — متعددة اللغات
 */
import { motion } from "framer-motion";
import { useEffect } from "react";
import { WAFD_PHONE } from "@/lib/wafd-constants";
import { useLanguage } from "@/contexts/LanguageContext";

const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hero-kaaba-HJyJeNN97h7PfMrmAAMs2W.webp";
const HOTEL_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hotel-makkah-WYrvVrLjdJdmpSUqPRnpcC.webp";
const MADINAH_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-madinah-mLYiJhvGYuvzquRMzJikST.webp";
const GROUP_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-umrah-group-BnpX9ASFQabKmJ7XA7wh9j.webp";

export default function Programs() {
  const { t, dir } = useLanguage();

  const programs = [
    {
      title: t.programs.economyTitle,
      subtitle: t.programs.economySub,
      duration: t.programs.days7,
      img: HOTEL_IMG,
      badge: t.programs.mostPopular,
      badgeColor: "oklch(0.52 0.12 185)",
      features: [
        t.programs.econFeat1,
        t.programs.econFeat2,
        t.programs.econFeat3,
        t.programs.econFeat4,
        t.programs.econFeat5,
        t.programs.econFeat6,
      ],
      desc: t.programs.econDesc,
    },
    {
      title: t.programs.premiumTitle,
      subtitle: t.programs.premiumSub,
      duration: t.programs.days10,
      img: MADINAH_IMG,
      badge: t.programs.premiumBadge,
      badgeColor: "oklch(0.72 0.09 75)",
      features: [
        t.programs.premFeat1,
        t.programs.premFeat2,
        t.programs.premFeat3,
        t.programs.premFeat4,
        t.programs.premFeat5,
        t.programs.premFeat6,
        t.programs.premFeat7,
      ],
      desc: t.programs.premDesc,
    },
    {
      title: t.programs.lastTenTitle,
      subtitle: t.programs.lastTenSub,
      duration: t.programs.days12,
      img: HERO_IMG,
      badge: t.programs.exclusiveBadge,
      badgeColor: "oklch(0.52 0.12 185)",
      features: [
        t.programs.lastFeat1,
        t.programs.lastFeat2,
        t.programs.lastFeat3,
        t.programs.lastFeat4,
        t.programs.lastFeat5,
        t.programs.lastFeat6,
        t.programs.lastFeat7,
        t.programs.lastFeat8,
      ],
      desc: t.programs.lastDesc,
    },
    {
      title: t.programs.familyTitle,
      subtitle: t.programs.familySub,
      duration: t.programs.days8,
      img: GROUP_IMG,
      badge: t.programs.familyBadge,
      badgeColor: "oklch(0.52 0.12 185)",
      features: [
        t.programs.famFeat1,
        t.programs.famFeat2,
        t.programs.famFeat3,
        t.programs.econFeat3,
        t.programs.famFeat4,
        t.programs.famFeat5,
        t.programs.famFeat6,
      ],
      desc: t.programs.famDesc,
    },
  ];

  const tips = [
    { title: t.programs.tip1Title, desc: t.programs.tip1Desc },
    { title: t.programs.tip2Title, desc: t.programs.tip2Desc },
    { title: t.programs.tip3Title, desc: t.programs.tip3Desc },
    { title: t.programs.tip4Title, desc: t.programs.tip4Desc },
  ];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const whatsappLink = (msg: string) => `https://wa.me/${WAFD_PHONE}?text=${encodeURIComponent(msg)}`;

  return (
    <div dir={dir} className="min-h-screen">
      {/* Hero */}
      <section className="pt-32 pb-16 wafd-gradient-dark relative overflow-hidden">
        <div className="absolute inset-0 wafd-pattern-overlay opacity-20" />
        <div className="container relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="flex justify-center mb-4">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png"
                alt={t.programs.wafdLogo}
                className="h-20 md:h-24 w-auto object-contain"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white mt-3 mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.programs.heroTitle}
            </h1>
            <p className="text-white/70 max-w-xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.programs.heroSubtitle}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Coming Soon Banner */}
      <section className="py-10 bg-white">
        <div className="container">
          <motion.div
            className="rounded-2xl p-8 text-center"
            style={{ background: "linear-gradient(135deg, oklch(0.97 0.012 75), oklch(0.94 0.018 75))" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-5xl mb-4">📋</div>
            <h2 className="text-2xl font-black text-[oklch(0.14_0.005_0)] mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.programs.comingSoonTitle}
            </h2>
            <p className="text-[oklch(0.45_0.005_0)] max-w-lg mx-auto mb-6 leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.programs.comingSoonDesc}
            </p>
            <a
              href={whatsappLink(t.programs.registerInterestMsg)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full font-bold text-white text-sm"
              style={{ background: "#25D366", fontFamily: "'Cairo', sans-serif" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {t.programs.registerInterest}
            </a>
          </motion.div>

          {/* Price disclaimer */}
          <div className="mt-8 mb-2 text-center">
            <p className="text-xs text-[oklch(0.55_0.005_0)] italic" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.programs.priceDisclaimer}
            </p>
          </div>

          {/* Preview programs - greyed out */}
          <div className="mt-6">
            <p className="text-center text-sm text-[oklch(0.62_0.005_0)] mb-6" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.programs.samplePrograms}
            </p>
            <div className="grid md:grid-cols-2 gap-8 opacity-50 pointer-events-none select-none">
              {programs.slice(0, 2).map((prog) => (
                <div
                  key={prog.title}
                  className="bg-white rounded-2xl overflow-hidden shadow-md border border-[oklch(0.90_0.006_80)]"
                >
                  <div className="relative h-52 overflow-hidden">
                    <img src={prog.img} alt={prog.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0"
                      style={{ background: "linear-gradient(180deg, transparent 40%, oklch(0.14 0.005 0 / 0.7) 100%)" }} />
                    <span className={`absolute top-3 ${dir === "rtl" ? "right-3" : "left-3"} px-3 py-1.5 rounded-full text-xs font-bold text-white`}
                      style={{ background: "linear-gradient(135deg, oklch(0.72 0.09 75), oklch(0.60 0.08 75))", fontFamily: "'Cairo', sans-serif" }}>
                      {t.common.comingSoon}
                    </span>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-black text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>{prog.title}</h3>
                    <p className="text-xs text-[oklch(0.52_0.12_185)] font-semibold mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>{prog.subtitle}</p>
                    <div className="h-8 bg-[oklch(0.94_0.008_185)] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tips Section */}
      <section className="py-16 bg-white">
        <div className="container">
          <div className="text-center mb-12">
            <span className="text-[oklch(0.52_0.12_185)] text-sm font-semibold tracking-wider" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.programs.tipsForPilgrims}
            </span>
            <h2 className="text-3xl font-black text-[oklch(0.14_0.005_0)] mt-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.programs.tipsSubtitle}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {tips.map((tip, i) => (
              <motion.div
                key={tip.title}
                className="p-5 rounded-2xl border border-[oklch(0.90_0.006_80)] hover:border-[oklch(0.52_0.12_185)] transition-colors"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-lg"
                  style={{ background: "oklch(0.94 0.008 185)" }}>
                  {["🌙", "🧳", "🚇", "📿"][i]}
                </div>
                <h4 className="font-bold text-[oklch(0.14_0.005_0)] mb-2 text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>{tip.title}</h4>
                <p className="text-xs text-[oklch(0.62_0.005_0)] leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>{tip.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
