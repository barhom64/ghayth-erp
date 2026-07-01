import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, LayoutDashboard, Phone, UserCircle, LogIn, Globe, ChevronDown } from "lucide-react";
import { WAFD_PHONE, WAFD_PHONE_DISPLAY, toSafeHref } from "@/lib/wafd-constants";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteData } from "@/contexts/SiteDataContext";
import { LANGUAGES } from "@/i18n";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png";

const WHATSAPP_NUMBER = WAFD_PHONE;
const PHONE_NUMBER = WAFD_PHONE_DISPLAY;
const PHONE_DISPLAY = WAFD_PHONE_DISPLAY;

interface NavbarProps {
  onOpenLeadForm?: () => void;
}

function LanguageSwitcher({ scrolled, isHome }: { scrolled: boolean; isHome: boolean }) {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find(l => l.code === lang);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <motion.button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold cursor-pointer transition-all"
        style={{
          background: scrolled || !isHome ? "oklch(0.96 0.004 80)" : "oklch(1 0 0 / 0.15)",
          color: scrolled || !isHome ? "oklch(0.52 0.12 185)" : "white",
          backdropFilter: "blur(8px)",
        }}
        whileHover={{ scale: 1.05 }}
        aria-label="Change Language"
      >
        <Globe size={13} />
        <span>{current?.flag}</span>
        <span className="hidden sm:inline">{current?.name}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-[200] min-w-[160px]"
            style={{ [t.dir === "rtl" ? "right" : "left"]: 0 }}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-start ${
                  lang === l.code
                    ? "bg-[oklch(0.94_0.008_185)] text-[oklch(0.52_0.12_185)] font-bold"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
                dir={l.dir}
              >
                <span className="text-base">{l.flag}</span>
                <span>{l.name}</span>
                {lang === l.code && <span className="ms-auto text-[oklch(0.52_0.12_185)]">✓</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar({ onOpenLeadForm }: NavbarProps = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  // دخول المالك/الأدمن والعملاء انتقل بالكامل إلى داخل غيث (شركة وفد). الموقع
  // العام لا يحمل جلسة — نُبقي بنية الروابط كما هي ونعطّل بوابات الجلسة فقط.
  const user = undefined as { role?: string } | undefined;
  const customer = null as { name?: string } | null;
  const isCustomerAuth = false;
  const navRef = useRef<HTMLDivElement>(null);
  const { t, dir } = useLanguage();
  const { navItems } = useSiteData();

  const WHATSAPP_MSG = encodeURIComponent(t.nav.home === "الرئيسية"
    ? "السلام عليكم، أود الاستفسار عن خدمات وفد للعمرة"
    : "Hello, I would like to inquire about WAFD Umrah services");

  const navLinks: { href: string; label: string; external?: boolean }[] = [
    // وحدات المتجر/الولاء/تتبع الطلب/المدونة تُبنى كوحدات غيث أصلية لاحقاً
    // (T003/T004) — لا نعرض روابطها قبل وجود مساراتها لتفادي صفحات 404.
    { href: "/", label: t.nav.home },
    { href: "/services", label: t.nav.services },
    { href: "/hotels", label: t.nav.hotels },
    { href: "/programs", label: t.nav.umrahProgram },
    { href: "/hajj-tips", label: t.nav.hajjTips },
    { href: "/about", label: t.nav.about },
    { href: "/contact", label: t.nav.contact },
    // روابط إضافية يُحرّرها المسؤول من لوحة تحكم غيث (الموقع الإلكتروني ← القائمة).
    ...navItems.map((n) => ({
      href: n.url,
      label: n.label,
      external: n.openInNewTab || /^https?:\/\//i.test(n.url),
    })),
  ];

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const isHome = location === "/";
  const handleNavLinkClick = () => setMenuOpen(false);

  return (
    <>
      <div
        ref={navRef}
        className={`w-full transition-all duration-500 ${
          scrolled || !isHome
            ? "bg-white/95 backdrop-blur-md shadow-lg border-b border-[oklch(0.90_0.006_80)]"
            : "bg-black/20 backdrop-blur-sm"
        }`}
        dir={dir}
      >
        <div className="container">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <Link href="/" onClick={handleNavLinkClick}>
              <motion.div
                className="flex items-center gap-2 cursor-pointer"
                whileHover={{ scale: 1.02 }}
              >
                <img
                  src={LOGO_URL}
                  alt="شعار وفد"
                  className="h-14 md:h-16 w-auto object-contain"
                />
              </motion.div>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const inner = (
                  <motion.span
                    className={`relative px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                      location === link.href
                        ? "text-[oklch(0.52_0.12_185)]"
                        : scrolled || !isHome
                        ? "text-[oklch(0.14_0.005_0)] hover:text-[oklch(0.52_0.12_185)]"
                        : "text-white hover:text-[oklch(0.72_0.09_75)]"
                    }`}
                    whileHover={{ y: -1 }}
                  >
                    {link.label}
                    {location === link.href && (
                      <motion.div
                        className="absolute bottom-0 right-0 left-0 h-0.5 bg-[oklch(0.52_0.12_185)] rounded-full"
                        layoutId="nav-underline"
                      />
                    )}
                  </motion.span>
                );
                return link.external ? (
                  <a key={link.href} href={toSafeHref(link.href)} target="_blank" rel="noopener noreferrer">
                    {inner}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href}>
                    {inner}
                  </Link>
                );
              })}
            </div>

            {/* CTA Buttons - Desktop only */}
            <div className="hidden md:flex items-center gap-2">
              {/* Language Switcher */}
              <LanguageSwitcher scrolled={scrolled} isHome={isHome} />

              {user?.role === "admin" && (
                <Link href="/admin">
                  <motion.span
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold cursor-pointer transition-all"
                    style={{
                      background: "oklch(0.94 0.008 185)",
                      color: "oklch(0.52 0.12 185)",
                    }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <LayoutDashboard size={14} />
                    {t.nav.adminPanel}
                  </motion.span>
                </Link>
              )}
              {isCustomerAuth ? (
                <Link href="/customer/account">
                  <motion.span
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold cursor-pointer transition-all"
                    style={{
                      background: "oklch(0.94 0.008 185)",
                      color: "oklch(0.52 0.12 185)",
                    }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <UserCircle size={14} />
                    {customer?.name?.split(" ")[0] || t.nav.myAccount}
                  </motion.span>
                </Link>
              ) : (
                <Link href="/customer/login">
                  <motion.span
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold cursor-pointer transition-all"
                    style={{
                      background: scrolled || !isHome ? "oklch(0.96 0.004 80)" : "oklch(1 0 0 / 0.15)",
                      color: scrolled || !isHome ? "oklch(0.52 0.12 185)" : "white",
                      backdropFilter: "blur(8px)",
                    }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <LogIn size={14} />
                    {t.nav.login}
                  </motion.span>
                </Link>
              )}
              {onOpenLeadForm && (
                <motion.button
                  onClick={onOpenLeadForm}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border-2 transition-all"
                  style={{
                    borderColor: "oklch(0.52 0.12 185)",
                    color: "oklch(0.52 0.12 185)",
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {t.nav.registerData}
                </motion.button>
              )}
              <motion.a
                href={`tel:${PHONE_NUMBER}`}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-all"
                style={{
                  background: scrolled || !isHome ? "oklch(0.94 0.008 185)" : "oklch(1 0 0 / 0.15)",
                  color: scrolled || !isHome ? "oklch(0.52 0.12 185)" : "white",
                  backdropFilter: "blur(8px)",
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                title={PHONE_DISPLAY}
              >
                <Phone size={14} />
                <span dir="ltr">{PHONE_DISPLAY}</span>
              </motion.a>
              <motion.a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white wafd-btn-glow transition-all"
                style={{
                  background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {t.nav.bookNow}
              </motion.a>
            </div>

            {/* Mobile: أزرار سريعة + زر القائمة */}
            <div className="flex md:hidden items-center gap-1">
              <LanguageSwitcher scrolled={scrolled} isHome={isHome} />
              <a
                href={`tel:${PHONE_NUMBER}`}
                className="p-2 rounded-full"
                style={{ color: scrolled || !isHome ? "oklch(0.52 0.12 185)" : "white" }}
                aria-label="Call"
              >
                <Phone size={20} />
              </a>
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full"
                style={{ color: scrolled || !isHome ? "oklch(0.52 0.12 185)" : "white" }}
                aria-label="WhatsApp"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
              <button
                className={`p-2 rounded-lg transition-colors ${scrolled || !isHome ? "text-[oklch(0.14_0.005_0)]" : "text-white"}`}
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
              >
                {menuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              className="fixed top-0 bottom-0 z-[70] w-[280px] bg-white shadow-2xl flex flex-col"
              style={{ [dir === "rtl" ? "right" : "left"]: 0 }}
              dir={dir}
              initial={{ x: dir === "rtl" ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: dir === "rtl" ? "100%" : "-100%" }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <div
                className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: "oklch(0.92 0.006 80)" }}
              >
                <img
                  src={LOGO_URL}
                  alt="وفد"
                  className="h-10 w-auto object-contain"
                  style={{ filter: "invert(1) sepia(1) saturate(2) hue-rotate(160deg)" }}
                />
                <button
                  onClick={() => setMenuOpen(false)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1">
                {navLinks.map((link, i) => {
                  const spanCls = `flex items-center px-4 py-3 rounded-xl text-base font-semibold transition-all cursor-pointer ${
                    location === link.href
                      ? "bg-[oklch(0.94_0.008_185)] text-[oklch(0.52_0.12_185)]"
                      : "text-[oklch(0.20_0.005_0)] hover:bg-[oklch(0.96_0.004_80)]"
                  }`;
                  return (
                    <motion.div
                      key={link.href}
                      initial={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      {link.external ? (
                        <a
                          href={toSafeHref(link.href)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={handleNavLinkClick}
                        >
                          <span className={spanCls}>{link.label}</span>
                        </a>
                      ) : (
                        <Link href={link.href} onClick={handleNavLinkClick}>
                          <span className={spanCls}>{link.label}</span>
                        </Link>
                      )}
                    </motion.div>
                  );
                })}

                {user?.role === "admin" && (
                  <motion.div
                    initial={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: navLinks.length * 0.04 }}
                  >
                    <Link href="/admin" onClick={handleNavLinkClick}>
                      <span className="flex items-center gap-2 px-4 py-3 rounded-xl text-base font-semibold text-[oklch(0.52_0.12_185)] bg-[oklch(0.94_0.008_185)] cursor-pointer">
                        <LayoutDashboard size={16} />
                        {t.nav.adminPanel}
                      </span>
                    </Link>
                  </motion.div>
                )}
                <motion.div
                  initial={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (navLinks.length + 1) * 0.04 }}
                >
                  {isCustomerAuth ? (
                    <Link href="/customer/account" onClick={handleNavLinkClick}>
                      <span className="flex items-center gap-2 px-4 py-3 rounded-xl text-base font-semibold text-[oklch(0.52_0.12_185)] bg-[oklch(0.94_0.008_185)] cursor-pointer">
                        <UserCircle size={16} />
                        {customer?.name || t.nav.myAccount}
                      </span>
                    </Link>
                  ) : (
                    <Link href="/customer/login" onClick={handleNavLinkClick}>
                      <span className="flex items-center gap-2 px-4 py-3 rounded-xl text-base font-semibold text-[oklch(0.52_0.12_185)] bg-[oklch(0.94_0.008_185)] cursor-pointer">
                        <LogIn size={16} />
                        {t.nav.login}
                      </span>
                    </Link>
                  )}
                </motion.div>
              </nav>

              <div className="px-4 pb-6 pt-2 flex flex-col gap-3 border-t" style={{ borderColor: "oklch(0.92 0.006 80)" }}>
                {onOpenLeadForm && (
                  <button
                    onClick={() => { onOpenLeadForm(); setMenuOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-base font-bold border-2 transition-all"
                    style={{
                      borderColor: "oklch(0.52 0.12 185)",
                      color: "oklch(0.52 0.12 185)",
                    }}
                  >
                    {t.nav.registerData}
                  </button>
                )}
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-base font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  {t.nav.bookNow}
                </a>
                <a
                  href={`tel:${PHONE_NUMBER}`}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-[oklch(0.52_0.12_185)] bg-[oklch(0.94_0.008_185)]"
                  dir="ltr"
                >
                  <Phone size={16} />
                  {PHONE_DISPLAY}
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
