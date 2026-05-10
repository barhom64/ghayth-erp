import { OperationsIcon } from "../../components/ModuleIcons";
import PlatformShot from "../../components/PlatformShot";
import DeepLinkButton from "../../components/DeepLinkButton";

export default function ModuleOperations() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[3vh] left-[6vw] text-accent w-[7vh] h-[7vh]">
        <OperationsIcon className="w-full h-full" />
      </div>
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">OPS</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 03 من 10</span>
      </div>

      <div className="absolute top-[16vh] right-[6vw] w-[40vw]">
        <h2 className="font-display text-text font-black text-[3.4vw] leading-[1.05] tracking-tighter">
          العمليات
        </h2>
        <p className="font-body text-muted text-[1.05vw] mt-[1.6vh] leading-relaxed font-light">
          العمود الفقري التشغيلي: طلبات موحّدة، سلاسل موافقات، مهام، مخزون وتوريد — كل شيء متتبَّع وقابل للقياس.
        </p>
      </div>

      <div className="absolute top-[42vh] right-[6vw] w-[40vw] flex flex-col gap-[1.4vh]">
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">الطلبات والموافقات</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">أنواع طلبات قابلة للتكوين، سلاسل موافقات هرمية، تفويض ومناوبات.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">المهام وسير العمل</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">إسناد آلي، استحقاقات، تذكيرات، لوحات Kanban تشغيلية.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">المخزون والتوريد</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">حركات مخزنية، طلبات شراء، عروض موردين، استلام واحتساب تكلفة.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">لوحة العمليات الموحّدة</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">نبض اليوم لكل الإدارات، ومؤشرات الإنجاز والتأخير.</div>
        </div>
      </div>

      <div className="absolute top-[16vh] left-[6vw] w-[42vw]">
        <div className="text-accent font-body text-[0.85vw] font-bold tracking-[0.25em] mb-[1vh]">
          لقطة من المنصّة الحيّة
        </div>
        <div className="w-full" style={{ aspectRatio: "1600 / 960" }}>
          <PlatformShot
            src="screenshots/operations.png"
            alt="مركز العمليات في غيث ERP"
            callouts={[{"x":50,"y":22,"label":"نبض العمليات اليومي للإدارة","side":"bottom"},{"x":78,"y":55,"label":"متابعة الطلبات والموافقات","side":"left"},{"x":25,"y":78,"label":"إجراءات سريعة عبر الإدارات","side":"top"}]}
            className="w-full h-full"
          />
        </div>
      </div>

      <DeepLinkButton
        to="/deep/slide4"
        label="تعمّق في هذه الوحدة"
        variant="to-deep"
        className="absolute bottom-[2.6vh] right-[6vw]"
      />
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">07 / 19</div>
    </div>
  );
}
