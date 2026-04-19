import PlatformShot from "./PlatformShot";
import type { DeepModuleEntry } from "../data/deep-slides-data";

type Props = {
  entry: DeepModuleEntry;
  index: number;
  total: number;
  position: number;
  totalSlides: number;
};

export default function DeepDiveSlide({ entry, index, total, position, totalSlides }: Props) {
  const Icon = entry.Icon;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg" dir="rtl">
      <div className="absolute top-0 right-0 w-full h-[10vh] bg-primary" />
      <div className="absolute top-[2.4vh] right-[4vw] flex items-center gap-[1vw]">
        <div className="text-accent w-[5.5vh] h-[5.5vh]">
          <Icon className="w-full h-full" />
        </div>
        <div className="leading-tight">
          <div className="text-accent font-display text-[0.95vw] font-bold tracking-[0.3em]">
            {entry.code}
          </div>
          <div className="text-white/70 font-body text-[0.85vw]">
            وحدة {pad(index)} من {pad(total)} · نسخة موسّعة
          </div>
        </div>
      </div>
      <div className="absolute top-[3.2vh] left-[4vw] text-white/55 font-body text-[0.8vw] tracking-[0.25em]">
        DEEP-DIVE · GHAYTH ERP
      </div>

      <div className="absolute top-[12vh] right-[4vw] w-[44vw]">
        <h2 className="font-display text-text font-black text-[2.6vw] leading-[1.05] tracking-tighter">
          {entry.title}
        </h2>
        <p className="font-body text-muted text-[0.95vw] mt-[1.2vh] leading-relaxed font-light">
          {entry.intro}
        </p>
      </div>

      <div className="absolute top-[12vh] left-[4vw] w-[46vw]" style={{ aspectRatio: "1600 / 960" }}>
        <PlatformShot
          src={entry.screenshot}
          alt={entry.alt}
          callouts={entry.callouts}
          className="w-full h-full"
        />
      </div>

      <div
        className="absolute right-[4vw] grid grid-cols-2 gap-x-[1.2vw] gap-y-[1vh]"
        style={{ top: "30vh", width: "44vw", bottom: "8vh" }}
      >
        {entry.bullets.map((b, i) => (
          <div
            key={i}
            className="bg-surface rounded-lg p-[0.9vw] border-r-4 border-accent flex flex-col"
          >
            <div className="flex items-baseline gap-[0.5vw]">
              <span className="font-display text-accent text-[0.9vw] font-black">
                {pad(i + 1)}
              </span>
              <div className="font-display text-primary text-[1.05vw] font-bold leading-tight">
                {b.title}
              </div>
            </div>
            <div className="font-body text-muted text-[0.82vw] mt-[0.4vh] leading-snug">
              {b.body}
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-[2.4vh] left-[4vw] text-muted font-body text-[0.9vw]">
        {pad(position)} / {pad(totalSlides)}
      </div>
      <div className="absolute bottom-[2.4vh] right-[4vw] text-muted font-body text-[0.9vw] tracking-[0.2em]">
        غيث ERP — جلسة تعمّق
      </div>
    </div>
  );
}
