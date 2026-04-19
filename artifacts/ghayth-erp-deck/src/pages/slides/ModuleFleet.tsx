import { FleetIcon } from "../../components/ModuleIcons";
import PlatformShot from "../../components/PlatformShot";

export default function ModuleFleet() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[3vh] left-[6vw] text-accent w-[7vh] h-[7vh]">
        <FleetIcon className="w-full h-full" />
      </div>
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">FLT</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 04 من 10</span>
      </div>

      <div className="absolute top-[16vh] right-[6vw] w-[40vw]">
        <h2 className="font-display text-text font-black text-[3.4vw] leading-[1.05] tracking-tighter">
          الأسطول
        </h2>
        <p className="font-body text-muted text-[1.05vw] mt-[1.6vh] leading-relaxed font-light">
          إدارة المركبات والمعدّات كأصول حقيقية: استمارات، تأمين، صيانة وقائية، وقود ورحلات وكفاءة محسوبة لكل وحدة.
        </p>
      </div>

      <div className="absolute top-[42vh] right-[6vw] w-[40vw] flex flex-col gap-[1.4vh]">
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">المركبات والمعدّات</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">سجل أصول، استمارات وتأمين، فحص دوري، إسناد للسائقين.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">الصيانة والقطع</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">صيانة وقائية مجدولة، مخزون قطع غيار، تكلفة لكل مركبة.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">الوقود والكيلومترات</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">مؤشرات استهلاك، تنبيهات شذوذ، تقارير كفاءة دورية.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">الرحلات والإسناد</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">ربط مع المشاريع والعمليات، تتبّع الرحلات الميدانية.</div>
        </div>
      </div>

      <div className="absolute top-[16vh] left-[6vw] w-[42vw]">
        <div className="text-accent font-body text-[0.85vw] font-bold tracking-[0.25em] mb-[1vh]">
          لقطة من المنصّة الحيّة
        </div>
        <div className="w-full" style={{ aspectRatio: "1600 / 960" }}>
          <PlatformShot
            src="screenshots/fleet.png"
            alt="لوحة الأسطول في غيث ERP"
            callouts={[{"x":50,"y":22,"label":"ملخّص الأسطول: المركبات والصيانة","side":"bottom"},{"x":75,"y":58,"label":"أقسام إدارة الأسطول","side":"left"},{"x":25,"y":80,"label":"إجراءات: رحلة، صيانة، فحص","side":"top"}]}
            className="w-full h-full"
          />
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">08 / 19</div>
    </div>
  );
}
