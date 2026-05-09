import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { RateLimitFallbackBanner } from "./rate-limit-fallback-banner";

const navLinks = [
  { href: "/", label: "الرئيسية", icon: "🏠" },
  { href: "/invoices", label: "الفواتير", icon: "📄" },
  { href: "/tickets", label: "الطلبات", icon: "🎫" },
  { href: "/kb", label: "المساعدة", icon: "📚" },
  { href: "/profile", label: "ملفي", icon: "👤" },
];

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { client, logout } = useAuth();
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-sm">بوابة العملاء</span>
          </div>
          <div className="flex items-center gap-3">
            {client && (
              <span className="text-sm text-gray-600 hidden sm:block">{client.name}</span>
            )}
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded"
            >
              خروج
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {navLinks.map((link) => {
              const isActive = link.href === "/" ? location === "/" : location.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href} className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      isActive
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-600 hover:text-gray-900"
                    }`}>
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <RateLimitFallbackBanner />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
