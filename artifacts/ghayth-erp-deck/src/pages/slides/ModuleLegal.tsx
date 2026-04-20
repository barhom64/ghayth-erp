import { LegalIcon } from "../../components/ModuleIcons";
import PlatformShot from "../../components/PlatformShot";

export default function ModuleLegal() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[3vh] left-[6vw] text-accent w-[7vh] h-[7vh]">
        <LegalIcon className="w-full h-full" />
      </div>
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">LGL</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 06 من 10</span>
      </div>

      <div className="absolute top-[16vh] right-[6vw] w-[40vw]">
        <h2 className="font-display text-text font-black text-[3.4vw] leading-[1.05] tracking-tighter">
          الشؤون القانونية
        </h2>
        <p className="font-body text-muted text-[1.05vw] mt-[1.6vh] leading-relaxed font-light">
          سجلّ متكامل للقضايا، العقود، الجلسات والمراسلات — مع تنبيهات استباقية وأرشفة قانونية مأمونة.
        </p>
      </div>

      <div className="absolute top-[42vh] right-[6vw] w-[40vw] flex flex-col gap-[1.4vh]">
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">القضايا والجلسات</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">أطراف، مرفقات، قرارات، تقويم جلسات وتنبيهات قبل الاستحقاق.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">العقود والاعتماد</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">قوالب موحّدة، سير اعتماد قانوني، توقيع وتجديد آلي.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">المراسلات والاستشارات</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">تسجيل وأرشفة، بحث، وبناء قاعدة معرفة قانونية مع الزمن.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">التنبيهات القانونية</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">استحقاقات، تجديدات، انتهاء صلاحيات — لا مفاجآت.</div>
        </div>
      </div>

      <div className="absolute top-[16vh] left-[6vw] w-[42vw]">
        <div className="text-accent font-body text-[0.85vw] font-bold tracking-[0.25em] mb-[1vh]">
          لقطة من المنصّة الحيّة
        </div>
        <div className="w-full" style={{ aspectRatio: "1600 / 960" }}>
          <PlatformShot
            src="screenshots/legal.png"
            alt="لوحة الشؤون القانونية في غيث ERP"
            callouts={[{"x":50,"y":22,"label":"نظرة على القضايا والعقود الفعّالة","side":"bottom"},{"x":75,"y":58,"label":"أقسام الإدارة القانونية","side":"left"},{"x":25,"y":80,"label":"إجراءات قانونية سريعة","side":"top"}]}
            className="w-full h-full"
          />
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">10 / 19</div>
    </div>
  );
}
