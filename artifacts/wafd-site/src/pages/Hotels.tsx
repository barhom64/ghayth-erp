/**
 * WAFD HOTELS PAGE — متعددة اللغات
 */
import { motion } from "framer-motion";
import { useEffect } from "react";
import { WAFD_PHONE } from "@/lib/wafd-constants";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteData } from "@/contexts/SiteDataContext";

const HOTEL_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hotel-makkah-WYrvVrLjdJdmpSUqPRnpcC.webp";
const MADINAH_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-madinah-mLYiJhvGYuvzquRMzJikST.webp";

type HotelItem = { key: string; name: string; city: string; dist: string; stars: number; img: string };

export default function Hotels() {
  const { t, dir } = useLanguage();
  const { hotels: dbHotels } = useSiteData();

  // القيم الاحتياطية (تظهر فقط عند تعذّر الجلب من غيث).
  const fallbackHotels: HotelItem[] = [
    { key: "luxury_makkah", name: t.hotels.luxuryMakkah, city: t.hotels.filterMakkah, dist: t.hotels.veryClose, stars: 5, img: HOTEL_IMG },
    { key: "standard_makkah", name: t.hotels.standardMakkah, city: t.hotels.filterMakkah, dist: t.hotels.nearGrandMosque, stars: 4, img: HOTEL_IMG },
    { key: "economy_makkah", name: t.hotels.economyMakkah, city: t.hotels.filterMakkah, dist: t.hotels.withinHaramArea, stars: 3, img: HOTEL_IMG },
    { key: "luxury_madinah", name: t.hotels.luxuryMadinah, city: t.hotels.filterMadinah, dist: t.hotels.nearProphetMosque, stars: 5, img: MADINAH_IMG },
    { key: "standard_madinah", name: t.hotels.standardMadinah, city: t.hotels.filterMadinah, dist: t.hotels.nearProphetMosque, stars: 4, img: MADINAH_IMG },
    { key: "economy_madinah", name: t.hotels.economyMadinah, city: t.hotels.filterMadinah, dist: t.hotels.withinNabawi, stars: 3, img: MADINAH_IMG },
  ];

  // المحتوى الحيّ من غيث (يُحرَّر من لوحة التحكم).
  const hotels: HotelItem[] = dbHotels.length
    ? dbHotels.map((h) => ({
        key: h.slug,
        name: h.name,
        city: h.city ?? "",
        dist: h.distanceLabel ?? "",
        stars: h.stars ?? 5,
        img: h.imageUrl ?? HOTEL_IMG,
      }))
    : fallbackHotels;

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
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png"
                alt={dir === "rtl" ? "شعار وفد" : "Wafd Logo"}
                className="h-20 md:h-24 w-auto object-contain"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white mt-3 mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.hotels.heroTitle}
            </h1>
            <p className="text-white/70 max-w-xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.hotels.heroSubtitle}
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
            <div className="text-5xl mb-4">🏨</div>
            <h2 className="text-2xl font-black text-[oklch(0.14_0.005_0)] mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.hotels.comingSoon}
            </h2>
            <p className="text-[oklch(0.45_0.005_0)] max-w-lg mx-auto mb-6 leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {dir === "rtl"
                ? "نعمل على توفير خيارات فنادق متنوعة بالقرب من الحرمين الشريفين — سجّل اهتمامك الآن لتصلك أول العروض عند الإطلاق."
                : "We are working on providing diverse hotel options near the Two Holy Mosques — register your interest now to receive the first offers at launch."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={`https://wa.me/${WAFD_PHONE}?text=${encodeURIComponent(
                  dir === "rtl"
                    ? "السلام عليكم، أود التسجيل المسبق في خدمة حجز الفنادق"
                    : "Hello, I'd like to pre-register for hotel booking service"
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full font-bold text-white text-sm"
                style={{ background: "#25D366", fontFamily: "'Cairo', sans-serif" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {dir === "rtl" ? "سجّل اهتمامك عبر واتساب" : "Register Interest via WhatsApp"}
              </a>
            </div>
          </motion.div>

          {/* Preview cards - greyed out */}
          <div className="mt-10">
            <p className="text-center text-sm text-[oklch(0.62_0.005_0)] mb-6" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {dir === "rtl" ? "نماذج من الفنادق التي ستتوفر قريباً" : "Sample hotels that will be available soon"}
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-50 pointer-events-none select-none">
              {hotels.slice(0, 3).map((hotel) => (
                <div
                  key={hotel.key}
                  className="bg-white rounded-2xl overflow-hidden shadow-md border border-[oklch(0.90_0.006_80)]"
                >
                  <div className="relative h-48 overflow-hidden">
                    <img src={hotel.img} alt={hotel.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0"
                      style={{ background: "linear-gradient(180deg, transparent 50%, oklch(0.14 0.005 0 / 0.6) 100%)" }} />
                    <span className={`absolute top-3 ${dir === "rtl" ? "right-3" : "left-3"} px-3 py-1 rounded-full text-xs font-bold text-white`}
                      style={{ background: "linear-gradient(135deg, oklch(0.72 0.09 75), oklch(0.60 0.08 75))", fontFamily: "'Cairo', sans-serif" }}>
                      {t.hotels.comingSoon}
                    </span>
                    <div className={`absolute bottom-3 ${dir === "rtl" ? "right-3" : "left-3"} flex gap-0.5`}>
                      {[...Array(hotel.stars)].map((_, s) => (
                        <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="oklch(0.72 0.09 75)">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                      ))}
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="font-black text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>{hotel.name}</h3>
                    <div className={`flex items-center gap-1.5 text-xs text-[oklch(0.52_0.12_185)] mb-3 font-medium`} style={{ fontFamily: "'Cairo', sans-serif" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      {hotel.city} — {hotel.dist}
                    </div>
                    <div className="h-8 bg-[oklch(0.94_0.008_185)] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
