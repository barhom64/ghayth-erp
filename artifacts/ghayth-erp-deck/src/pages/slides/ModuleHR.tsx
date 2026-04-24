import { HRIcon } from "../../components/ModuleIcons";
import PlatformShot from "../../components/PlatformShot";
import DeepLinkButton from "../../components/DeepLinkButton";

export default function ModuleHR() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[3vh] left-[6vw] text-accent w-[7vh] h-[7vh]">
        <HRIcon className="w-full h-full" />
      </div>
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">HR</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 01 من 10</span>
      </div>

      <div className="absolute top-[16vh] right-[6vw] w-[40vw]">
        <h2 className="font-display text-text font-black text-[3.4vw] leading-[1.05] tracking-tighter">
          الموارد البشرية
        </h2>
        <p className="font-body text-muted text-[1.05vw] mt-[1.6vh] leading-relaxed font-light">
          إدارة كاملة لدورة حياة الموظف: من التعيين والعقد إلى الراتب والأداء والمغادرة، بأتمتة عربية متوافقة مع الأنظمة المحلية.
        </p>
      </div>

      <div className="absolute top-[42vh] right-[6vw] w-[40vw] flex flex-col gap-[1.4vh]">
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">ملفات الموظفين والعقود</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">سجل موحّد، مرفقات، تجديد تلقائي للعقود، تنبيهات الانتهاء.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">الرواتب والمكافآت</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">مسير رواتب شهري، استقطاعات، بدلات، تكامل بنكي وتقارير ضريبية.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">الحضور والإجازات</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">جداول مناوبات، أرصدة إجازات، طلبات ذاتية وموافقات هرمية.</div>
        </div>
        <div className="bg-surface rounded-lg p-[1vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.15vw] font-bold leading-tight">تقييم الأداء والتدريب</div>
          <div className="font-body text-muted text-[0.85vw] mt-[0.3vh] leading-snug">دورات تقييم دورية، مؤشرات أداء، خطط تدريبية وسجل كفاءات.</div>
        </div>
      </div>

      <div className="absolute top-[16vh] left-[6vw] w-[42vw]">
        <div className="text-accent font-body text-[0.85vw] font-bold tracking-[0.25em] mb-[1vh]">
          لقطة من المنصّة الحيّة
        </div>
        <div className="w-full" style={{ aspectRatio: "1600 / 960" }}>
          <PlatformShot
            src="screenshots/hr.png"
            alt="لوحة الموارد البشرية في غيث ERP"
            callouts={[{"x":50,"y":22,"label":"مؤشرات لحظية: الرواتب · الإجازات · الحضور","side":"bottom"},{"x":78,"y":60,"label":"أقسام الموارد البشرية المتكاملة","side":"left"},{"x":22,"y":78,"label":"إجراءات سريعة لكل عمليات HR","side":"top"}]}
            className="w-full h-full"
          />
        </div>
      </div>

      <DeepLinkButton
        to="/deep/slide2"
        label="تعمّق في هذه الوحدة"
        variant="to-deep"
        className="absolute bottom-[2.6vh] right-[6vw]"
      />
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">05 / 19</div>
    </div>
  );
}
