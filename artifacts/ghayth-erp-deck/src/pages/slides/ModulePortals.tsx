import { PortalsIcon } from "../../components/ModuleIcons";
import DeepLinkButton from "../../components/DeepLinkButton";

export default function ModulePortals() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[3vh] left-[6vw] text-accent w-[7vh] h-[7vh]">
        <PortalsIcon className="w-full h-full" />
      </div>
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">PRT</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 10 من 10</span>
      </div>
      <div className="absolute top-[32vh] left-[6vw] text-primary w-[28vw] h-[28vw] pointer-events-none">
        <PortalsIcon className="w-full h-full opacity-[0.07]" />
      </div>
      <div className="absolute top-[18vh] right-[6vw] max-w-[88vw]">
        <h2 className="font-display text-text font-black text-[4.5vw] leading-[1.05] tracking-tighter">
          البوابات الإلكترونية
        </h2>
        <p className="font-body text-muted text-[1.4vw] mt-[2vh] leading-relaxed font-light max-w-[75vw]">
          ثلاث بوابات تفتح النظام للموظف والعميل والمتقدّم للوظيفة بتجربة عربية بسيطة وآمنة، تخفّف الحمل عن الإدارات.
        </p>
      </div>
      <div className="absolute top-[42vh] right-[6vw] left-[6vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface rounded-2xl p-[2vw] border-t-4 border-accent">
          <div className="font-display text-accent text-[1vw] font-bold tracking-[0.3em]">EMP</div>
          <div className="font-display text-primary text-[1.9vw] font-bold mt-[1vh] leading-tight">بوابة الموظف</div>
          <div className="font-body text-muted text-[1.05vw] mt-[1.5vh] leading-snug">طلبات الإجازات والسلف، كشف راتب، شهادات، تقييم وتدريب وإشعارات.</div>
        </div>
        <div className="bg-surface rounded-2xl p-[2vw] border-t-4 border-primary">
          <div className="font-display text-accent text-[1vw] font-bold tracking-[0.3em]">CST</div>
          <div className="font-display text-primary text-[1.9vw] font-bold mt-[1vh] leading-tight">بوابة العميل</div>
          <div className="font-body text-muted text-[1.05vw] mt-[1.5vh] leading-snug">عقود، فواتير، مدفوعات، طلبات صيانة، تذاكر دعم وتاريخ كامل للحساب.</div>
        </div>
        <div className="bg-surface rounded-2xl p-[2vw] border-t-4 border-accent">
          <div className="font-display text-accent text-[1vw] font-bold tracking-[0.3em]">CAR</div>
          <div className="font-display text-primary text-[1.9vw] font-bold mt-[1vh] leading-tight">بوابة التوظيف</div>
          <div className="font-body text-muted text-[1.05vw] mt-[1.5vh] leading-snug">إعلانات الوظائف، تقديم السيرة، تتبّع الطلب، تقييم وفرز ومقابلات.</div>
        </div>
      </div>
      <DeepLinkButton
        to="/deep/slide11"
        label="تعمّق في هذه الوحدة"
        variant="to-deep"
        className="absolute bottom-[2.6vh] right-[6vw]"
      />
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">14 / 19</div>
    </div>
  );
}
