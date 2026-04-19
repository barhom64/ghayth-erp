export default function Vision() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg" dir="rtl">
      <div className="absolute top-0 left-0 w-[40vw] h-full bg-primary" />
      <div className="absolute top-[6vh] right-[6vw] text-muted font-body text-[1vw] tracking-widest">
        الفصل الأول · الرؤية
      </div>

      <div className="absolute top-[22vh] right-[6vw] max-w-[48vw]">
        <div className="text-accent font-body text-[1.2vw] font-semibold mb-[2vh] tracking-wider">
          ما هو غيث ERP؟
        </div>
        <h2 className="font-display text-text font-black text-[4.5vw] leading-[1.05] tracking-tighter">
          نظام تشغيل واحد
          <span className="block text-primary mt-[1vh]">يربط كل إدارة بالأخرى.</span>
        </h2>
        <p className="font-body text-muted text-[1.5vw] mt-[3vh] leading-relaxed font-light max-w-[42vw]">
          منصة مؤسسية عربية مبنية من الصفر لإدارة الدورة الكاملة للأعمال: من الموظف الأول إلى آخر فاتورة، عبر محرك أحداث ذكي وقواعد موافقات وتقارير لحظية.
        </p>
      </div>

      <div className="absolute top-[18vh] left-[6vw] w-[28vw] flex flex-col gap-[2vh]">
        <div className="bg-white/5 border border-white/15 rounded-2xl p-[2.2vw] backdrop-blur-sm">
          <div className="text-accent font-display text-[3.5vw] font-black leading-none">14+</div>
          <div className="text-white/80 font-body text-[1.1vw] mt-[1vh]">وحدة تشغيلية متكاملة</div>
        </div>
        <div className="bg-white/5 border border-white/15 rounded-2xl p-[2.2vw]">
          <div className="text-accent font-display text-[3.5vw] font-black leading-none">100٪</div>
          <div className="text-white/80 font-body text-[1.1vw] mt-[1vh]">واجهة عربية RTL أصيلة</div>
        </div>
        <div className="bg-white/5 border border-white/15 rounded-2xl p-[2.2vw]">
          <div className="text-accent font-display text-[3.5vw] font-black leading-none">3</div>
          <div className="text-white/80 font-body text-[1.1vw] mt-[1vh]">بوابات: موظف · عميل · توظيف</div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[6vw] text-muted font-body text-[1vw]">
        غيث ERP · 02 / 19
      </div>
    </div>
  );
}
