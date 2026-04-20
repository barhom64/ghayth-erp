import { FinanceIcon } from "../../components/ModuleIcons";
import PlatformShot from "../../components/PlatformShot";

export default function ModuleFinance() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[3vh] left-[6vw] text-accent w-[7vh] h-[7vh]">
        <FinanceIcon className="w-full h-full" />
      </div>
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">FIN</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 02 من 10</span>
      </div>

      <div className="absolute top-[16vh] right-[6vw] w-[40vw]">
        <h2 className="font-display text-text font-black text-[3.4vw] leading-[1.05] tracking-tighter">
          المالية والمحاسبة
        </h2>
        <p className="font-body text-muted text-[1.05vw] mt-[1.6vh] leading-relaxed font-light">
          محرّك محاسبي كامل بدفتر أستاذ موحّد، يربط كل عملية من أي وحدة بقيد محاسبي تلقائي ويغلق الفترات بثقة.
        </p>
      </div>

      <div className="absolute top-[42vh] right-[6vw] w-[40vw] flex flex-col gap-[1.4vh]">
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">دليل حسابات وقيود</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">شجرة حسابات قابلة للتخصيص، قيود يدوية وتلقائية، ربط بمراكز التكلفة.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">المدينون والدائنون</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">فواتير، تحصيلات، أعمار ديون، مطابقات بنكية، كشوف حسابات لحظية.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">الميزانيات والتقارير</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">ميزان مراجعة، قائمة دخل، مركز مالي، تدفقات نقدية، تقارير إدارية.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">الضرائب والامتثال</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">ضريبة القيمة المضافة، الزكاة، إقرارات دورية وملفات تدقيق جاهزة.</div>
        </div>
      </div>

      <div className="absolute top-[16vh] left-[6vw] w-[42vw]">
        <div className="text-accent font-body text-[0.85vw] font-bold tracking-[0.25em] mb-[1vh]">
          لقطة من المنصّة الحيّة
        </div>
        <div className="w-full" style={{ aspectRatio: "1600 / 960" }}>
          <PlatformShot
            src="screenshots/finance.png"
            alt="لوحة المالية في غيث ERP"
            callouts={[{"x":50,"y":22,"label":"ملخّص مالي تنفيذي بنظرة واحدة","side":"bottom"},{"x":75,"y":60,"label":"وحدات المحاسبة الفرعية","side":"left"},{"x":25,"y":78,"label":"تقارير وإغلاق الفترات","side":"top"}]}
            className="w-full h-full"
          />
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">06 / 19</div>
    </div>
  );
}
