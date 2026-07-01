import { Button } from "@/components/ui/button";
import { Home, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { t, dir } = useLanguage();

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      dir={dir}
      style={{ background: "oklch(0.97 0.004 185)" }}
    >
      <div className="text-center px-6 max-w-lg mx-auto">
        {/* رقم 404 */}
        <div
          className="text-8xl md:text-9xl font-black mb-4 select-none"
          style={{
            fontFamily: "'Cairo', sans-serif",
            background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.72 0.09 75))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {dir === "rtl" ? "٤٠٤" : "404"}
        </div>

        {/* شعار وفد */}
        <div className="flex justify-center mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg"
            style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))" }}
          >
            و
          </div>
        </div>

        <h1
          className="text-2xl font-bold mb-3"
          style={{ fontFamily: "'Cairo', sans-serif", color: "oklch(0.14 0.005 0)" }}
        >
          {t.notFound.title}
        </h1>

        <p
          className="text-base leading-relaxed mb-8"
          style={{ fontFamily: "'Tajawal', sans-serif", color: "oklch(0.55 0.005 0)" }}
        >
          {t.notFound.subtitle}
        </p>

        <div
          id="not-found-button-group"
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <Button
            onClick={() => setLocation("/")}
            className="gap-2 px-6 py-2.5 rounded-full font-bold text-white shadow-md"
            style={{
              fontFamily: "'Cairo', sans-serif",
              background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
            }}
          >
            <Home className="w-4 h-4" />
            {t.notFound.backHome}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="gap-2 px-6 py-2.5 rounded-full font-bold"
            style={{
              fontFamily: "'Cairo', sans-serif",
              borderColor: "oklch(0.52 0.12 185)",
              color: "oklch(0.52 0.12 185)",
            }}
          >
            <ArrowRight className={`w-4 h-4 ${dir === "ltr" ? "rotate-180" : ""}`} />
            {dir === "rtl" ? "العودة للخلف" : "Go Back"}
          </Button>
        </div>
      </div>
    </div>
  );
}
