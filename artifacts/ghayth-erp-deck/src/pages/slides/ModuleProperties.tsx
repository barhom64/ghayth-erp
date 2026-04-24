import { PropertiesIcon } from "../../components/ModuleIcons";
import PlatformShot from "../../components/PlatformShot";
import DeepLinkButton from "../../components/DeepLinkButton";

export default function ModuleProperties() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[3vh] left-[6vw] text-accent w-[7vh] h-[7vh]">
        <PropertiesIcon className="w-full h-full" />
      </div>
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">RE</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 05 من 10</span>
      </div>

      <div className="absolute top-[16vh] right-[6vw] w-[40vw]">
        <h2 className="font-display text-text font-black text-[3.4vw] leading-[1.05] tracking-tighter">
          الأملاك والعقارات
        </h2>
        <p className="font-body text-muted text-[1.05vw] mt-[1.6vh] leading-relaxed font-light">
          إدارة المحفظة العقارية: عقود إيجار، تحصيل، صيانة، ومستأجرون — مع لوحة عوائد تلقائية لكل عقار.
        </p>
      </div>

      <div className="absolute top-[42vh] right-[6vw] w-[40vw] flex flex-col gap-[1.4vh]">
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">العقارات والوحدات</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">سجل عقارات ووحدات، صور ووثائق، حالة الإشغال والشواغر لحظياً.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">عقود الإيجار</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">إنشاء، تجديد، إنذار وإنهاء، جداول دفعات وفهرسة سنوية تلقائية.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">التحصيل والمتأخرات</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">فواتير دورية، تذكيرات للمستأجرين، أعمار ديون وربط محاسبي.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">الصيانة والبلاغات</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">طلبات صيانة من البوابة، إسناد للفنيين، تكلفة وأثر على العائد.</div>
        </div>
      </div>

      <div className="absolute top-[16vh] left-[6vw] w-[42vw]">
        <div className="text-accent font-body text-[0.85vw] font-bold tracking-[0.25em] mb-[1vh]">
          لقطة من المنصّة الحيّة
        </div>
        <div className="w-full" style={{ aspectRatio: "1600 / 960" }}>
          <PlatformShot
            src="screenshots/properties.png"
            alt="لوحة الأملاك والعقارات في غيث ERP"
            callouts={[{"x":50,"y":20,"label":"مؤشرات المحفظة العقارية","side":"bottom"},{"x":78,"y":55,"label":"إدارة العقود والوحدات والمستأجرين","side":"left"},{"x":25,"y":80,"label":"تحصيل وصيانة لحظية","side":"top"}]}
            className="w-full h-full"
          />
        </div>
      </div>

      <DeepLinkButton
        to="/deep/slide6"
        label="تعمّق في هذه الوحدة"
        variant="to-deep"
        className="absolute bottom-[2.6vh] right-[6vw]"
      />
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">09 / 19</div>
    </div>
  );
}
