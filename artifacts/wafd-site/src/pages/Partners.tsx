/**
 * صفحة /partners — الشراكة مع وفد
 * تستهدف وكلاء السياحة والسفر الراغبين في التعاون
 * ثنائية اللغة: عربي + إنجليزي
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  Globe, Users, Award, TrendingUp, CheckCircle,
  Phone, Mail, MapPin, ArrowLeft, Star, Shield,
  Handshake, Building2, Plane, Hotel, Bus, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { wafdWhatsAppLink, WAFD_PHONE_DISPLAY, WAFD_EMAIL } from "@/lib/wafd-constants";

// ============================
// Constants
// ============================
const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hero-kaaba-HJyJeNN97h7PfMrmAAMs2W.webp";
const WAFD_LOGO = "https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310419663030823861/QJRCyEFfVVWDfuYb.png?Expires=1804240941&Signature=cWo~HkpDScRzU7CNi1OCurTdKoilVUQnxoaeukJPEXeXuBE4O1RtB4CMRZf9Bk~g7eIYuKTIG9g-4R9T7WFVnzQZ7zPalOimJB3zd4jDF2jC09gOxAFtK2A~jg47FraJ27qWRgjSxVsbQFzHLzwLyES8cxYYAcvttBuwJGN0k6NPU5jotGsmjMyyNuLcKfLwLJ9gX9C3Pr7Bll29IH03DZ9fzgMSm5S1iufY1NhhWQbr4DnCV~qkmOb8UyPCi9TfS4ijKQQzyZ59WpBbDJVuZEFF-qy3cVvraRvQ46I8HcdxceTfDwrfW68KgmgIDodFdjEXe5JWnL6x1lV6a~F9mA__&Key-Pair-Id=K2HSFNDJXOU9YS";

type Lang = "ar" | "en";

const T = {
  ar: {
    heroTag: "شراكة استراتيجية",
    heroTitle: "كن شريكاً في خدمة ضيوف الرحمن",
    heroSub: "انضم إلى شبكة وكلاء وفد وقدّم لعملائك أفضل تجربة عمرة وزيارة",
    heroBtn: "ابدأ الشراكة الآن",
    heroBtn2: "اطلع على التفاصيل",
    langToggle: "English",

    whyTitle: "لماذا الشراكة مع وفد؟",
    whySub: "نقدم لك البنية التحتية الكاملة لتنمية أعمالك في قطاع العمرة",

    benefitsTitle: "مزايا شركاء وفد",
    benefits: [
      { icon: "commission", title: "عمولة تنافسية", desc: "احصل على عمولة مجزية على كل حجز تُحيله إلينا، مع نظام تتبع شفاف ومدفوعات منتظمة" },
      { icon: "support", title: "دعم متخصص 24/7", desc: "فريق دعم مخصص لشركاء وفد يرد على استفساراتك ويحل مشكلات عملائك على مدار الساعة" },
      { icon: "tech", title: "أدوات تقنية متقدمة", desc: "لوحة تحكم خاصة لمتابعة حجوزاتك وعمولاتك وأداء حملاتك التسويقية في الوقت الفعلي" },
      { icon: "coverage", title: "تغطية شاملة", desc: "نغطي مكة المكرمة والمدينة المنورة بالكامل: تأشيرات، فنادق، نقل، برامج متكاملة" },
      { icon: "brand", title: "دعم تسويقي", desc: "مواد تسويقية جاهزة، صور احترافية، ومحتوى رقمي يساعدك على الترويج لخدماتنا بسهولة" },
      { icon: "priority", title: "أولوية في الخدمة", desc: "عملاؤك يحصلون على أولوية في الحجز والتخصيص، مع ضمان جودة الخدمة في كل رحلة" },
    ],

    servicesTitle: "الخدمات التي تقدمها وفد لعملاء شركائك",
    services: [
      { icon: "visa", title: "تأشيرات العمرة", desc: "معالجة سريعة للتأشيرات لجميع الجنسيات مع ضمان القبول" },
      { icon: "hotel", title: "فنادق الحرمين", desc: "خيارات متنوعة من الفنادق القريبة من المسجد الحرام والمسجد النبوي" },
      { icon: "transport", title: "خدمات النقل", desc: "نقل مريح وآمن بين المطار والفنادق والمشاعر المقدسة" },
      { icon: "program", title: "برامج متكاملة", desc: "باقات عمرة شاملة مصممة لتلبية احتياجات مختلف الميزانيات" },
    ],

    coverageTitle: "تغطيتنا الجغرافية",
    coverageDesc: "نخدم المعتمرين القادمين من أكثر من 50 دولة حول العالم",
    regions: [
      { name: "شمال أفريقيا", countries: "المغرب، الجزائر، تونس، ليبيا، مصر" },
      { name: "غرب أفريقيا", countries: "السنغال، مالي، غينيا، نيجيريا، غانا" },
      { name: "آسيا الوسطى", countries: "تركيا، أذربيجان، كازاخستان، أوزبكستان" },
      { name: "جنوب آسيا", countries: "باكستان، بنغلاديش، الهند، إندونيسيا" },
      { name: "الشرق الأوسط", countries: "الأردن، لبنان، فلسطين، العراق، سوريا" },
      { name: "أوروبا", countries: "فرنسا، بلجيكا، هولندا، ألمانيا، إسبانيا" },
    ],

    stepsTitle: "كيف تبدأ الشراكة؟",
    steps: [
      { num: "١", title: "تواصل معنا", desc: "أرسل لنا رسالة عبر واتساب أو البريد الإلكتروني مع معلومات شركتك" },
      { num: "٢", title: "مراجعة الطلب", desc: "يراجع فريقنا طلبك ويتواصل معك خلال 24 ساعة لمناقشة التفاصيل" },
      { num: "٣", title: "توقيع الاتفاقية", desc: "نوقّع اتفاقية شراكة واضحة تحدد الحقوق والالتزامات والعمولات" },
      { num: "٤", title: "ابدأ الإحالة", desc: "احصل على رابط إحالة خاص بك وابدأ في إرسال العملاء والحصول على عمولتك" },
    ],

    testimonialTitle: "ماذا يقول شركاؤنا؟",
    testimonials: [
      { name: "أحمد بن علي", company: "وكالة النور للسفر، المغرب", text: "منذ شراكتنا مع وفد، ارتفعت مبيعاتنا بنسبة 40%. الدعم ممتاز والعمولات تُدفع في موعدها دائماً." },
      { name: "Mamadou Diallo", company: "Agence Dakar Hajj, Sénégal", text: "Wafd is the most reliable partner for Umrah services. Our clients are always satisfied with the quality." },
      { name: "محمد يلماظ", company: "Türkiye Umre Acentesi", text: "وفد يقدم خدمة احترافية بأسعار تنافسية. نوصي بها لجميع وكلاء السياحة الدينية." },
    ],

    forumTitle: "منتدى العمرة والزيارة 2026",
    forumDesc: "انضم إلينا في منتدى العمرة والزيارة المرتقب في المدينة المنورة 30 مارس — 1 أبريل 2026 لمناقشة فرص الشراكة وجهاً لوجه",
    forumBtn: "احجز مقعدك في المنتدى",

    ctaTitle: "هل أنت مستعد لبدء الشراكة؟",
    ctaSub: "تواصل معنا اليوم ونبدأ معاً في خدمة ضيوف الرحمن",
    ctaWhatsApp: "تواصل عبر واتساب",
    ctaEmail: "راسلنا بالبريد",

    contactTitle: "معلومات التواصل",
    phone: WAFD_PHONE_DISPLAY,
    email: WAFD_EMAIL,
    location: "مركز الملك سلمان الدولي للمعارض، المدينة المنورة",
  },
  en: {
    heroTag: "Strategic Partnership",
    heroTitle: "Partner with Wafd to Serve Pilgrims",
    heroSub: "Join Wafd's agent network and offer your clients the best Umrah & Ziyara experience",
    heroBtn: "Start Partnership Now",
    heroBtn2: "View Details",
    langToggle: "عربي",

    whyTitle: "Why Partner with Wafd?",
    whySub: "We provide the complete infrastructure to grow your business in the Umrah sector",

    benefitsTitle: "Wafd Partner Benefits",
    benefits: [
      { icon: "commission", title: "Competitive Commission", desc: "Earn generous commissions on every referral with transparent tracking and regular payments" },
      { icon: "support", title: "24/7 Dedicated Support", desc: "A dedicated support team for Wafd partners, available around the clock to resolve client issues" },
      { icon: "tech", title: "Advanced Tech Tools", desc: "A private dashboard to track bookings, commissions, and marketing campaign performance in real time" },
      { icon: "coverage", title: "Full Coverage", desc: "We cover Makkah and Madinah completely: visas, hotels, transport, and integrated programs" },
      { icon: "brand", title: "Marketing Support", desc: "Ready-made marketing materials, professional photos, and digital content to promote our services easily" },
      { icon: "priority", title: "Priority Service", desc: "Your clients get booking priority and quality guarantees on every trip" },
    ],

    servicesTitle: "Services Wafd Provides to Your Clients",
    services: [
      { icon: "visa", title: "Umrah Visas", desc: "Fast visa processing for all nationalities with approval guarantee" },
      { icon: "hotel", title: "Haramain Hotels", desc: "Various hotel options near Masjid Al-Haram and Masjid An-Nabawi" },
      { icon: "transport", title: "Transport Services", desc: "Comfortable and safe transport between airports, hotels, and holy sites" },
      { icon: "program", title: "Integrated Programs", desc: "Comprehensive Umrah packages designed for different budgets" },
    ],

    coverageTitle: "Our Geographic Coverage",
    coverageDesc: "We serve pilgrims from more than 50 countries worldwide",
    regions: [
      { name: "North Africa", countries: "Morocco, Algeria, Tunisia, Libya, Egypt" },
      { name: "West Africa", countries: "Senegal, Mali, Guinea, Nigeria, Ghana" },
      { name: "Central Asia", countries: "Turkey, Azerbaijan, Kazakhstan, Uzbekistan" },
      { name: "South Asia", countries: "Pakistan, Bangladesh, India, Indonesia" },
      { name: "Middle East", countries: "Jordan, Lebanon, Palestine, Iraq, Syria" },
      { name: "Europe", countries: "France, Belgium, Netherlands, Germany, Spain" },
    ],

    stepsTitle: "How to Start the Partnership?",
    steps: [
      { num: "1", title: "Contact Us", desc: "Send us a message via WhatsApp or email with your company information" },
      { num: "2", title: "Request Review", desc: "Our team reviews your request and contacts you within 24 hours to discuss details" },
      { num: "3", title: "Sign Agreement", desc: "We sign a clear partnership agreement defining rights, obligations, and commissions" },
      { num: "4", title: "Start Referring", desc: "Get your unique referral link and start sending clients to earn your commission" },
    ],

    testimonialTitle: "What Our Partners Say",
    testimonials: [
      { name: "Ahmed Ben Ali", company: "Al-Nour Travel Agency, Morocco", text: "Since partnering with Wafd, our sales increased by 40%. The support is excellent and commissions are always paid on time." },
      { name: "Mamadou Diallo", company: "Agence Dakar Hajj, Sénégal", text: "Wafd is the most reliable partner for Umrah services. Our clients are always satisfied with the quality." },
      { name: "Mehmet Yilmaz", company: "Turkey Umrah Agency", text: "Wafd provides professional service at competitive prices. We recommend it to all religious tourism agents." },
    ],

    forumTitle: "Umrah & Ziyara Forum 2026",
    forumDesc: "Join us at the upcoming Umrah & Ziyara Forum in Madinah, March 30 – April 1, 2026, to discuss partnership opportunities face-to-face",
    forumBtn: "Reserve Your Forum Seat",

    ctaTitle: "Ready to Start the Partnership?",
    ctaSub: "Contact us today and let's serve the guests of the Most Merciful together",
    ctaWhatsApp: "Contact via WhatsApp",
    ctaEmail: "Email Us",

    contactTitle: "Contact Information",
    phone: WAFD_PHONE_DISPLAY,
    email: WAFD_EMAIL,
    location: "King Salman International Exhibition Center, Madinah, Saudi Arabia",
  },
};

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  visa: <FileText size={24} />,
  hotel: <Hotel size={24} />,
  transport: <Bus size={24} />,
  program: <Plane size={24} />,
};

const BENEFIT_ICONS: Record<string, React.ReactNode> = {
  commission: <TrendingUp size={22} />,
  support: <Users size={22} />,
  tech: <Shield size={22} />,
  coverage: <Globe size={22} />,
  brand: <Award size={22} />,
  priority: <Star size={22} />,
};

export default function Partners() {
  const [lang, setLang] = useState<Lang>("ar");
  const t = T[lang];
  const isRtl = lang === "ar";

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.004_80)]" dir={isRtl ? "rtl" : "ltr"}>

      {/* ===== HERO ===== */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={HERO_BG} alt="الحرم المكي" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, oklch(0.14 0.005 0 / 0.7) 0%, oklch(0.14 0.005 0 / 0.85) 100%)" }} />
        </div>

        {/* Language Toggle */}
        <button
          onClick={() => setLang(l => l === "ar" ? "en" : "ar")}
          className="absolute top-6 left-6 z-20 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/30 transition-colors border border-white/30"
        >
          <Globe size={14} className="inline mr-1" />
          {t.langToggle}
        </button>

        <div className="relative z-10 text-center text-white px-4 max-w-4xl mx-auto">
          <div className="mb-4">
            <img src={WAFD_LOGO} alt="وفد" className="h-24 w-auto mx-auto object-contain drop-shadow-2xl" />
          </div>
          <Badge className="mb-4 bg-[oklch(0.72_0.09_75)] text-white border-0 text-sm px-4 py-1">
            <Handshake size={14} className="inline mr-1" />
            {t.heroTag}
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {t.heroTitle}
          </h1>
          <p className="text-lg md:text-xl text-white/80 mb-8 max-w-2xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            {t.heroSub}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={wafdWhatsAppLink("partnership")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-white font-bold text-base"
              style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}
            >
              <Handshake size={18} />
              {t.heroBtn}
            </a>
            <a
              href="#benefits"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-white font-semibold text-base border border-white/30 hover:bg-white/10 transition-colors"
              style={{ fontFamily: "'Cairo', sans-serif" }}
            >
              {t.heroBtn2}
              <ArrowLeft size={16} className={isRtl ? "rotate-180" : ""} />
            </a>
          </div>
        </div>
      </section>

      {/* ===== WHY WAFD ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-[oklch(0.14_0.005_0)] mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {t.whyTitle}
          </h2>
          <p className="text-gray-500 mb-12 max-w-2xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            {t.whySub}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            {[
              { value: "50+", label: lang === "ar" ? "دولة نخدمها" : "Countries Served" },
              { value: "1000+", label: lang === "ar" ? "وكيل شريك" : "Partner Agents" },
              { value: "98%", label: lang === "ar" ? "رضا العملاء" : "Client Satisfaction" },
              { value: "24/7", label: lang === "ar" ? "دعم متواصل" : "Continuous Support" },
            ].map((stat, i) => (
              <div key={i} className="p-6 rounded-2xl bg-[oklch(0.97_0.004_185)] text-center">
                <div className="text-3xl font-bold text-[oklch(0.52_0.12_185)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BENEFITS ===== */}
      <section id="benefits" className="py-16 bg-[oklch(0.98_0.004_80)]">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-[oklch(0.14_0.005_0)] mb-3 text-center" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {t.benefitsTitle}
          </h2>
          <div className="w-16 h-1 bg-[oklch(0.72_0.09_75)] mx-auto mb-12 rounded-full" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {t.benefits.map((benefit, i) => (
              <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow bg-white">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-[oklch(0.94_0.008_185)] flex items-center justify-center mb-4 text-[oklch(0.52_0.12_185)]">
                    {BENEFIT_ICONS[benefit.icon]}
                  </div>
                  <h3 className="font-bold text-[oklch(0.14_0.005_0)] mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
                    {benefit.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                    {benefit.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SERVICES ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-[oklch(0.14_0.005_0)] mb-3 text-center" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {t.servicesTitle}
          </h2>
          <div className="w-16 h-1 bg-[oklch(0.72_0.09_75)] mx-auto mb-12 rounded-full" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {t.services.map((service, i) => (
              <div key={i} className="text-center p-6 rounded-2xl bg-[oklch(0.97_0.004_185)] hover:bg-[oklch(0.94_0.008_185)] transition-colors">
                <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mx-auto mb-4 shadow-sm text-[oklch(0.52_0.12_185)]">
                  {SERVICE_ICONS[service.icon]}
                </div>
                <h3 className="font-bold text-[oklch(0.14_0.005_0)] mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {service.title}
                </h3>
                <p className="text-sm text-gray-500" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {service.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== COVERAGE MAP ===== */}
      <section className="py-16 bg-[oklch(0.14_0.005_0)] text-white">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-3 text-center" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {t.coverageTitle}
          </h2>
          <p className="text-white/70 text-center mb-12" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            {t.coverageDesc}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.regions.map((region, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin size={16} className="text-[oklch(0.72_0.09_75)]" />
                  <span className="font-bold text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>
                    {region.name}
                  </span>
                </div>
                <p className="text-xs text-white/60" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {region.countries}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW TO START ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-[oklch(0.14_0.005_0)] mb-3 text-center" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {t.stepsTitle}
          </h2>
          <div className="w-16 h-1 bg-[oklch(0.72_0.09_75)] mx-auto mb-12 rounded-full" />

          <div className="space-y-6">
            {t.steps.map((step, i) => (
              <div key={i} className="flex gap-5 items-start">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}
                >
                  {step.num}
                </div>
                <div className="flex-1 pt-2">
                  <h3 className="font-bold text-[oklch(0.14_0.005_0)] mb-1" style={{ fontFamily: "'Cairo', sans-serif" }}>
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-500" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                    {step.desc}
                  </p>
                </div>
                {i < t.steps.length - 1 && (
                  <div className="absolute" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-16 bg-[oklch(0.97_0.004_185)]">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-[oklch(0.14_0.005_0)] mb-3 text-center" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {t.testimonialTitle}
          </h2>
          <div className="w-16 h-1 bg-[oklch(0.72_0.09_75)] mx-auto mb-12 rounded-full" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {t.testimonials.map((testimonial, i) => (
              <Card key={i} className="border-0 shadow-sm bg-white">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} size={14} className="text-[oklch(0.72_0.09_75)] fill-[oklch(0.72_0.09_75)]" />
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 mb-4 leading-relaxed italic" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                    "{testimonial.text}"
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[oklch(0.94_0.008_185)] flex items-center justify-center">
                      <span className="text-sm font-bold text-[oklch(0.52_0.12_185)]">
                        {testimonial.name[0]}
                      </span>
                    </div>
                    <div>
                      <div className="font-bold text-sm text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
                        {testimonial.name}
                      </div>
                      <div className="text-xs text-gray-400" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                        {testimonial.company}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FORUM BANNER ===== */}
      <section className="py-12 bg-gradient-to-r from-[oklch(0.52_0.12_185)] to-[oklch(0.38_0.10_185)] text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Building2 size={40} className="mx-auto mb-4 opacity-80" />
          <h2 className="text-2xl font-bold mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {t.forumTitle}
          </h2>
          <p className="text-white/80 mb-6 max-w-2xl mx-auto" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            {t.forumDesc}
          </p>
          <a
            href={wafdWhatsAppLink("forum")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-[oklch(0.52_0.12_185)] font-bold hover:bg-white/90 transition-colors"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            <CheckCircle size={18} />
            {t.forumBtn}
          </a>
        </div>
      </section>

      {/* ===== CTA + CONTACT ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[oklch(0.14_0.005_0)] mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {t.ctaTitle}
            </h2>
            <p className="text-gray-500 mb-8" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.ctaSub}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={wafdWhatsAppLink("partnership")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-white font-bold"
                style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {t.ctaWhatsApp}
              </a>
              <a
                href={`mailto:${WAFD_EMAIL}?subject=${encodeURIComponent(lang === "ar" ? "طلب شراكة - وفد" : "Partnership Request - Wafd")}`}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-bold border-2 border-[oklch(0.52_0.12_185)] text-[oklch(0.52_0.12_185)] hover:bg-[oklch(0.97_0.004_185)] transition-colors"
                style={{ fontFamily: "'Cairo', sans-serif" }}
              >
                <Mail size={18} />
                {t.ctaEmail}
              </a>
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[oklch(0.97_0.004_185)]">
              <Phone size={20} className="text-[oklch(0.52_0.12_185)] flex-shrink-0" />
              <div>
                <div className="text-xs text-gray-400 mb-0.5" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {lang === "ar" ? "الهاتف" : "Phone"}
                </div>
                <div className="text-sm font-medium text-[oklch(0.14_0.005_0)]" dir="ltr">
                  {t.phone}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[oklch(0.97_0.004_185)]">
              <Mail size={20} className="text-[oklch(0.52_0.12_185)] flex-shrink-0" />
              <div>
                <div className="text-xs text-gray-400 mb-0.5" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {lang === "ar" ? "البريد الإلكتروني" : "Email"}
                </div>
                <div className="text-sm font-medium text-[oklch(0.14_0.005_0)]">
                  {t.email}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[oklch(0.97_0.004_185)]">
              <MapPin size={20} className="text-[oklch(0.52_0.12_185)] flex-shrink-0" />
              <div>
                <div className="text-xs text-gray-400 mb-0.5" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {lang === "ar" ? "الموقع" : "Location"}
                </div>
                <div className="text-sm font-medium text-[oklch(0.14_0.005_0)]">
                  {t.location}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <div className="py-6 bg-[oklch(0.14_0.005_0)] text-center text-white/50 text-xs" style={{ fontFamily: "'Tajawal', sans-serif" }}>
        {lang === "ar"
          ? "© 2026 وفد للاستثمار — جميع الحقوق محفوظة"
          : "© 2026 Wafd Investment — All Rights Reserved"}
      </div>
    </div>
  );
}
