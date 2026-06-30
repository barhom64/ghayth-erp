/**
 * WAFD PUBLIC SITE — داخل غيث ERP (شركة وفد الحديثة للاستثمار، id=4)
 * نُقل من منصة وفد الخارجية AS-IS. أُزيل tRPC/react-query وبوابة الأدمن وبوابة
 * العملاء — التحكم انتقل بالكامل إلى داخل غيث. الموقع العام بلا جلسة؛ نموذج
 * التواصل يكتب في نواة غيث عبر POST /api/public/leads (لا backend مكرر).
 */
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { HeaderHeightProvider } from "./contexts/HeaderHeightContext";
import { SiteDataProvider } from "./contexts/SiteDataContext";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import WhatsAppFloat from "./components/WhatsAppFloat";
import ScrollProgress from "./components/ScrollProgress";
import AnnouncementBar from "./components/AnnouncementBar";
import CookieConsent from "./components/CookieConsent";
import LeadForm from "./components/LeadForm";
import NotFound from "@/pages/NotFound";

// تحميل الصفحات عند الطلب (Lazy) — يقلّل حجم الـ bundle الأولي
const Home = lazy(() => import("./pages/Home"));
const Services = lazy(() => import("./pages/Services"));
const Hotels = lazy(() => import("./pages/Hotels"));
const Programs = lazy(() => import("./pages/Programs"));
const Contact = lazy(() => import("./pages/Contact"));
const Landing = lazy(() => import("./pages/Landing"));
const About = lazy(() => import("./pages/About"));
const Packages = lazy(() => import("./pages/Packages"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const ThankYou = lazy(() => import("./pages/ThankYou"));
const Partners = lazy(() => import("./pages/Partners"));
const Tips = lazy(() => import("./pages/Tips"));
const HajjTips = lazy(() => import("./pages/HajjTips"));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground" style={{ fontFamily: "'Tajawal', sans-serif" }}>
          جاري التحميل...
        </p>
      </div>
    </div>
  );
}

const PAGE_TITLES: Record<string, string> = {
  "/": "وفد - تأشيرة عمرة ونقل معتمرين في السعودية",
  "/services": "خدمات وفد - تأشيرة عمرة ونقل معتمرين",
  "/hotels": "فنادق وفد - إقامة بالقرب من الحرمين الشريفين",
  "/programs": "برامج وفد - باقات عمرة متكاملة بأسعار مناسبة",
  "/packages": "باقات العمرة - وفد لخدمة ضيوف الرحمن",
  "/contact": "تواصل مع وفد - خدمة العملاء وزوار الحرمين",
  "/about": "من نحن - وفد لخدمة ضيوف الرحمن",
  "/partners": "شركاء وفد لخدمة ضيوف الرحمن",
  "/privacy-policy": "سياسة الخصوصية - وفد لخدمة ضيوف الرحمن",
};

function TitleManager() {
  const [location] = useLocation();
  useEffect(() => {
    document.title = PAGE_TITLES[location] || "وفد - تأشيرة عمرة ونقل معتمرين في السعودية";
  }, [location]);
  return null;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/services" component={Services} />
        <Route path="/hotels" component={Hotels} />
        <Route path="/programs" component={Programs} />
        <Route path="/packages" component={Packages} />
        <Route path="/contact" component={Contact} />
        <Route path="/about" component={About} />
        <Route path="/partners" component={Partners} />
        <Route path="/landing" component={Landing} />
        <Route path="/tips" component={Tips} />
        <Route path="/hajj-tips" component={HajjTips} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/thank-you" component={ThankYou} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppContent() {
  const [leadFormOpen, setLeadFormOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col">
      <TitleManager />
      <AnnouncementBar
        message="وفد ترافقك في رحلة العمرة — استشارة مجانية وخطة تناسبك"
        link={{ text: "اطلب استشارتك الآن", onClick: () => setLeadFormOpen(true) }}
      />
      <ScrollProgress />
      <Navbar onOpenLeadForm={() => setLeadFormOpen(true)} />
      <main className="flex-1">
        <Router />
      </main>
      <Footer />
      <WhatsAppFloat />
      <CookieConsent />
      <LeadForm open={leadFormOpen} onClose={() => setLeadFormOpen(false)} />
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <HeaderHeightProvider>
            <SiteDataProvider>
              <WouterRouter base={BASE}>
                <AppContent />
              </WouterRouter>
            </SiteDataProvider>
          </HeaderHeightProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
