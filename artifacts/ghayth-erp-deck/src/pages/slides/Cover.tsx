import PlatformShot from "../../components/PlatformShot";

const base = import.meta.env.BASE_URL;

export default function Cover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary" dir="rtl">
      <img
        src={`${base}hero.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover opacity-40"
        alt=""
      />
      <div className="absolute inset-0 bg-gradient-to-l from-[#0E3B43]/95 via-[#0E3B43]/80 to-[#0E3B43]/40" />

      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1vw]">
        <div className="w-[2.6vw] h-[2.6vw] rounded-full bg-accent" />
        <span className="font-display text-[1.6vw] font-bold text-white tracking-tight">
          غـيـث · Ghayth
        </span>
      </div>

      <div className="absolute top-[6vh] left-[6vw] text-[1.1vw] font-body text-white/70">
        عرض تقديمي · للمدير العام
      </div>

      <div className="absolute bottom-[12vh] right-[6vw] max-w-[60vw]">
        <div className="text-accent font-body text-[1.4vw] font-semibold mb-[2vh] tracking-wide">
          نظام تشغيل مؤسسي متكامل
        </div>
        <h1 className="font-display text-white font-black text-[7.5vw] leading-[0.95] tracking-tighter">
          غيث ERP
        </h1>
        <p className="font-body text-white/85 text-[1.8vw] mt-[3vh] leading-relaxed font-light max-w-[50vw]">
          منصة موحّدة تدير عملياتك من الموارد البشرية إلى المالية والأسطول والمشاريع — بلغة عربية كاملة وذكاء تشغيلي.
        </p>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] w-[32vw]" style={{ aspectRatio: "1600 / 960" }}>
        <PlatformShot
          src="screenshots/dashboard.png"
          alt="لوحة التحكم الرئيسية في غيث ERP"
          className="w-full h-full"
          callouts={[
            { x: 50, y: 28, label: "لوحة تحكم تنفيذية لحظية", side: "bottom" },
          ]}
        />
        <div className="mt-[0.8vh] text-accent font-body text-[0.85vw] tracking-wide" dir="rtl">
          لقطة حيّة من نواة المنصّة — لوحة التحكم الرئيسية
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[6vw] left-[6vw] flex items-center justify-between text-white/60 font-body text-[1vw] border-t border-white/15 pt-[2vh]">
        <span>إعداد: فريق تطوير غيث</span>
        <span>2026 · إصدار للعرض الإداري</span>
      </div>
    </div>
  );
}
