import ArchitectureDiagram from "../../components/ArchitectureDiagram";

export default function HowItWorks() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[7vh]" dir="rtl">
      <div className="absolute top-[5vh] right-[6vw] text-accent font-body text-[1.1vw] font-semibold tracking-wider">
        الفصل الرابع · آلية العمل
      </div>
      <h2 className="absolute top-[8.5vh] right-[6vw] font-display text-text font-black text-[3.4vw] leading-[1.05] tracking-tighter max-w-[60vw]">
        كيف يعمل النظام؟
      </h2>
      <p className="absolute top-[17vh] right-[6vw] font-body text-muted text-[1.2vw] max-w-[80vw] leading-relaxed font-light">
        دورة واحدة تربط البيانات بالقرار: التقاط الحدث، تطبيق القاعدة، توجيه الموافقة، الإشعار، ثم القياس — فوق نواة ذكية وعمود فقري موحّد للبيانات.
      </p>

      <div className="absolute top-[24vh] right-[6vw] left-[6vw] h-[44vh]">
        <ArchitectureDiagram className="w-full h-full" />
      </div>

      <div className="absolute bottom-[5vh] right-[6vw] left-[6vw] grid grid-cols-5 gap-[1vw]">
        <div className="bg-surface rounded-xl p-[1.5vw] border-t-4 border-accent">
          <div className="font-display text-accent text-[1.8vw] font-black">01</div>
          <div className="font-display text-primary text-[1.5vw] font-bold mt-[0.8vh] leading-tight">الالتقاط</div>
          <div className="font-body text-muted text-[1vw] mt-[0.6vh] leading-snug">طلب أو حدث من أي وحدة</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.5vw] border-t-4 border-accent">
          <div className="font-display text-accent text-[1.8vw] font-black">02</div>
          <div className="font-display text-primary text-[1.5vw] font-bold mt-[0.8vh] leading-tight">القاعدة</div>
          <div className="font-body text-muted text-[1vw] mt-[0.6vh] leading-snug">محرّك القواعد يقرّر المسار</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.5vw] border-t-4 border-accent">
          <div className="font-display text-accent text-[1.8vw] font-black">03</div>
          <div className="font-display text-primary text-[1.5vw] font-bold mt-[0.8vh] leading-tight">الموافقة</div>
          <div className="font-body text-muted text-[1vw] mt-[0.6vh] leading-snug">سلسلة موافقات مرنة</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.5vw] border-t-4 border-accent">
          <div className="font-display text-accent text-[1.8vw] font-black">04</div>
          <div className="font-display text-primary text-[1.5vw] font-bold mt-[0.8vh] leading-tight">الإشعار</div>
          <div className="font-body text-muted text-[1vw] mt-[0.6vh] leading-snug">قنوات متعدّدة بالوقت الفعلي</div>
        </div>
        <div className="bg-primary rounded-xl p-[1.5vw] border-t-4 border-accent">
          <div className="font-display text-accent text-[1.8vw] font-black">05</div>
          <div className="font-display text-white text-[1.5vw] font-bold mt-[0.8vh] leading-tight">القياس</div>
          <div className="font-body text-white/70 text-[1vw] mt-[0.6vh] leading-snug">KPIs ولوحات تنفيذية</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">15 / 19</div>
    </div>
  );
}
