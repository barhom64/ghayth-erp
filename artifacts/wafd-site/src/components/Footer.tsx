import { Link } from "wouter";
import { wafdWhatsAppLink, WAFD_PHONE, WAFD_PHONE_DISPLAY, WAFD_EMAIL, WAFD_WEBSITE } from "../lib/wafd-constants";
import { Phone } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png";

export default function Footer() {
  const { t, dir } = useLanguage();

  const quickLinks = [
    { href: "/", label: t.nav.home },
    { href: "/services", label: t.nav.services },
    { href: "/hotels", label: t.nav.hotels },
    { href: "/programs", label: t.nav.umrahProgram },
    { href: "/hajj-tips", label: t.nav.hajjTips },
    { href: "/contact", label: t.nav.contact },
  ];

  return (
    <footer className="py-12 bg-[oklch(0.10_0.005_0)] text-white/60" dir={dir}>
      <div className="container">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="mb-3">
              <img
                src={LOGO_URL}
                alt={dir === "rtl" ? "شعار وفد" : "Wafd Logo"}
                className="h-14 w-auto object-contain"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <p className="text-sm text-white/50 leading-relaxed mb-4" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {t.footer.tagline}
            </p>
            <div className="flex flex-wrap gap-3">
              {/* زر الاتصال المباشر */}
              <a
                href={`tel:+${WAFD_PHONE}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white"
                style={{ background: "oklch(0.52 0.12 185)", fontFamily: "'Cairo', sans-serif" }}
              >
                <Phone size={14} />
                <span dir="ltr">{WAFD_PHONE_DISPLAY}</span>
              </a>
              {/* زر واتساب */}
              <a
                href={wafdWhatsAppLink("general")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white"
                style={{ background: "#25D366", fontFamily: "'Cairo', sans-serif" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {dir === "rtl" ? "تحدث معنا" : "Chat with us"}
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white font-bold mb-4 text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>{t.footer.quickLinks}</h4>
            <ul className="space-y-2 text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              {quickLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>
                    <span className="hover:text-[oklch(0.52_0.12_185)] transition-colors cursor-pointer">{l.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-bold mb-4 text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>{t.footer.contactUs}</h4>
            <ul className="space-y-3 text-sm" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              <li>
                <a href={`tel:${WAFD_PHONE_DISPLAY}`} className="flex items-center gap-2 hover:text-white transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.52 0.12 185)" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 .18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"/>
                  </svg>
                  <span dir="ltr">{WAFD_PHONE_DISPLAY}</span>
                </a>
              </li>
              <li>
                <a href={`mailto:${WAFD_EMAIL}`} className="flex items-center gap-2 hover:text-white transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.52 0.12 185)" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <span dir="ltr">{WAFD_EMAIL}</span>
                </a>
              </li>
              <li>
                <a href={`https://${WAFD_WEBSITE}`} className="flex items-center gap-2 hover:text-white transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.52 0.12 185)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                  </svg>
                  <span dir="ltr">{WAFD_WEBSITE}</span>
                </a>
              </li>
              <li className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.52 0.12 185)" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span>{dir === "rtl" ? "مكة المكرمة، المملكة العربية السعودية" : "Makkah, Saudi Arabia"}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/30" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            © {new Date().getFullYear()} {dir === "rtl" ? "وفد" : "Wafd"} — {t.footer.rights}
          </p>
          <p className="text-xs text-white/30" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            {dir === "rtl" ? "مرخصة من وزارة الحج والعمرة" : "Licensed by the Ministry of Hajj and Umrah"}
          </p>
        </div>
      </div>
    </footer>
  );
}
