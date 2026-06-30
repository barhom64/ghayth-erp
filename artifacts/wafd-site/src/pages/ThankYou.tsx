/**
 * صفحة الشكر — متعددة اللغات
 * تظهر بعد تعبئة نموذج التسجيل بنجاح
 */
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { CheckCircle, MessageCircle, Home, Phone } from "lucide-react";
import { wafdWhatsAppLink, WAFD_PHONE_DISPLAY } from "../lib/wafd-constants";
import { useLanguage } from "@/contexts/LanguageContext";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white-transparent.png";
const HERO_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hero-kaaba-HJyJeNN97h7PfMrmAAMs2W.webp";

export default function ThankYou() {
  const { t, dir } = useLanguage();

  useEffect(() => {
    document.title = t.thankYou.pageTitle;
    return () => {
      document.title = "وفد — لخدمة ضيوف الرحمن";
    };
  }, [t]);

  const steps = dir === "rtl"
    ? [
        "مراجعة تفاصيل رحلتك وتحديد احتياجاتك",
        "عرض أفضل الخيارات المتاحة لك",
        "تأكيد الحجز وإرسال جميع التفاصيل",
      ]
    : [
        "Reviewing your trip details and identifying your needs",
        "Presenting the best available options for you",
        "Confirming the booking and sending all details",
      ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      dir={dir}
      style={{ background: "oklch(0.975 0.008 80)" }}
    >
      {/* Background Hero Image */}
      <div className="absolute inset-0 z-0">
        <img
          src={HERO_IMG}
          alt="المسجد الحرام"
          className="w-full h-full object-cover"
          style={{ opacity: 0.12 }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, oklch(0.975 0.008 80 / 0.85) 0%, oklch(0.975 0.008 80 / 0.95) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-lg mx-auto px-4 py-12 text-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <Link href="/">
            <img
              src={LOGO_URL}
              alt="شعار وفد"
              className="h-20 w-auto mx-auto object-contain cursor-pointer"
              style={{ filter: "drop-shadow(0 4px 16px oklch(0 0 0 / 0.15))" }}
            />
          </Link>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white rounded-3xl shadow-2xl overflow-hidden"
          style={{ border: "1px solid oklch(0.90 0.006 80)" }}
        >
          {/* Top accent */}
          <div
            className="h-2 w-full"
            style={{
              background:
                "linear-gradient(90deg, oklch(0.52 0.12 185), oklch(0.72 0.09 75), oklch(0.52 0.12 185))",
            }}
          />

          <div className="px-8 py-10">
            {/* Success Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.4 }}
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: "oklch(0.94 0.008 185)" }}
            >
              <CheckCircle size={44} style={{ color: "oklch(0.52 0.12 185)" }} />
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-3xl font-black text-[oklch(0.14_0.005_0)] mb-3"
              style={{ fontFamily: "'Cairo', sans-serif" }}
            >
              {t.thankYou.title}
            </motion.h1>

            {/* Decorative line */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center justify-center gap-3 mb-5"
            >
              <div
                className="h-0.5 w-16"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, oklch(0.72 0.09 75))",
                }}
              />
              <span
                className="text-[oklch(0.72_0.09_75)] text-base"
                style={{ fontFamily: "'Amiri', serif" }}
              >
                ✦
              </span>
              <div
                className="h-0.5 w-16"
                style={{
                  background:
                    "linear-gradient(90deg, oklch(0.72 0.09 75), transparent)",
                }}
              />
            </motion.div>

            {/* Message */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              className="text-[oklch(0.45_0.005_0)] leading-relaxed mb-2 text-base"
              style={{ fontFamily: "'Tajawal', sans-serif" }}
            >
              {dir === "rtl"
                ? <>شكراً لك على ثقتك بـ <strong style={{ color: "oklch(0.52 0.12 185)" }}>وفد</strong>.</>
                : <>Thank you for trusting <strong style={{ color: "oklch(0.52 0.12 185)" }}>Wafd</strong>.</>}
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-[oklch(0.45_0.005_0)] leading-relaxed mb-8 text-base"
              style={{ fontFamily: "'Tajawal', sans-serif" }}
            >
              {t.thankYou.message}
            </motion.p>

            {/* Steps */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
              className="rounded-2xl p-5 mb-8 text-right"
              style={{ background: "oklch(0.97 0.006 185)" }}
            >
              <p
                className="text-sm font-bold text-[oklch(0.52_0.12_185)] mb-3"
                style={{ fontFamily: "'Cairo', sans-serif" }}
              >
                {dir === "rtl" ? "ما يمكنك توقعه:" : "What to expect:"}
              </p>
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                    style={{ background: "oklch(0.52 0.12 185)" }}
                  >
                    {i + 1}
                  </div>
                  <p
                    className="text-sm text-[oklch(0.35_0.005_0)]"
                    style={{ fontFamily: "'Tajawal', sans-serif" }}
                  >
                    {step}
                  </p>
                </div>
              ))}
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85 }}
              className="flex flex-col gap-3"
            >
              {/* WhatsApp */}
              <motion.a
                href={wafdWhatsAppLink("general")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 py-4 rounded-2xl text-white font-bold text-base"
                style={{
                  background: "#25D366",
                  fontFamily: "'Cairo', sans-serif",
                  boxShadow: "0 6px 24px #25D36640",
                }}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
              >
                <MessageCircle size={20} />
                {dir === "rtl" ? "تواصل معنا عبر واتساب" : "Contact us via WhatsApp"}
              </motion.a>

              {/* Phone */}
              <motion.a
                href={`tel:${WAFD_PHONE_DISPLAY}`}
                className="flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-semibold text-sm border-2"
                style={{
                  borderColor: "oklch(0.52 0.12 185)",
                  color: "oklch(0.52 0.12 185)",
                  fontFamily: "'Cairo', sans-serif",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Phone size={16} />
                {WAFD_PHONE_DISPLAY}
              </motion.a>

              {/* Back Home */}
              <Link href="/">
                <motion.span
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium cursor-pointer"
                  style={{
                    color: "oklch(0.62 0.005 0)",
                    fontFamily: "'Cairo', sans-serif",
                  }}
                  whileHover={{ color: "oklch(0.52 0.12 185)" }}
                >
                  <Home size={15} />
                  {t.thankYou.backHome}
                </motion.span>
              </Link>
            </motion.div>
          </div>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-6 text-xs text-[oklch(0.65_0.005_0)]"
          style={{ fontFamily: "'Tajawal', sans-serif" }}
        >
          وفد — WAFD · لخدمة ضيوف الرحمن · umrah@wafd.life
        </motion.p>
      </div>
    </div>
  );
}
