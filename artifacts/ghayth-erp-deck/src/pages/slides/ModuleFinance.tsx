export default function ModuleFinance() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">FIN</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 02 من 10</span>
      </div>
      <div className="absolute top-[18vh] right-[6vw] max-w-[88vw]">
        <h2 className="font-display text-text font-black text-[4.5vw] leading-[1.05] tracking-tighter">
          المالية والمحاسبة
        </h2>
        <p className="font-body text-muted text-[1.4vw] mt-[2vh] leading-relaxed font-light max-w-[75vw]">
          محرّك محاسبي كامل بدفتر أستاذ موحّد، يربط كل عملية من أي وحدة بقيد محاسبي تلقائي ويغلق الفترات بثقة.
        </p>
      </div>
      <div className="absolute top-[42vh] right-[6vw] left-[6vw] grid grid-cols-2 gap-x-[2vw] gap-y-[2vh]">
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">دليل حسابات وقيود</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">شجرة حسابات قابلة للتخصيص، قيود يدوية وتلقائية، ربط بمراكز التكلفة.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">المدينون والدائنون</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">فواتير، تحصيلات، أعمار ديون، مطابقات بنكية، كشوف حسابات لحظية.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">الميزانيات والتقارير</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">ميزان مراجعة، قائمة دخل، مركز مالي، تدفقات نقدية، تقارير إدارية.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">الضرائب والامتثال</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">ضريبة القيمة المضافة، الزكاة، إقرارات دورية وملفات تدقيق جاهزة.</div>
        </div>
      </div>
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">06 / 19</div>
    </div>
  );
}
