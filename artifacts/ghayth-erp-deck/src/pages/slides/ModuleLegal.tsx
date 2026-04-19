export default function ModuleLegal() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">LGL</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 06 من 10</span>
      </div>
      <div className="absolute top-[18vh] right-[6vw] max-w-[88vw]">
        <h2 className="font-display text-text font-black text-[4.5vw] leading-[1.05] tracking-tighter">
          الشؤون القانونية
        </h2>
        <p className="font-body text-muted text-[1.4vw] mt-[2vh] leading-relaxed font-light max-w-[75vw]">
          مركز عمليات الإدارة القانونية: قضايا، عقود، استشارات، ومواعيد — بسجلّ مرفقات آمن وتذكيرات لا تفوّت موعداً.
        </p>
      </div>
      <div className="absolute top-[42vh] right-[6vw] left-[6vw] grid grid-cols-2 gap-x-[2vw] gap-y-[2vh]">
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">القضايا والملفات</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">سجل كامل للقضية، الأطراف، الجلسات، القرارات ومرفقات معتمدة.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">العقود والاتفاقيات</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">قوالب موحّدة، سير اعتماد قانوني، توقيع، أرشفة وتنبيه تجديد.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">الجلسات والمواعيد</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">تقويم قانوني، تنبيهات قبل الجلسة، تكامل مع المحامين والوكلاء.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">الاستشارات والمراسلات</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">طلبات داخلية للاستشارة، ردود معتمدة، أرشيف بحث وقرارات.</div>
        </div>
      </div>
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">10 / 19</div>
    </div>
  );
}
