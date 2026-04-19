type Callout = {
  x: number;
  y: number;
  label: string;
  side?: "top" | "bottom" | "left" | "right";
};

type Props = {
  src: string;
  alt: string;
  callouts?: Callout[];
  className?: string;
  caption?: string;
};

const base = import.meta.env.BASE_URL;

export default function PlatformShot({ src, alt, callouts = [], className = "", caption }: Props) {
  const fullSrc = src.startsWith("http") || src.startsWith("/") ? src : `${base}${src}`;

  return (
    <div className={`relative ${className}`}>
      <div className="relative w-full h-full rounded-xl overflow-hidden border border-primary/20 shadow-[0_1.5vh_3vh_rgba(14,59,67,0.18)] bg-white">
        <div className="absolute top-0 left-0 right-0 h-[2.2vh] bg-[#0E3B43] flex items-center px-[0.8vw] gap-[0.4vw] z-10">
          <span className="w-[0.7vh] h-[0.7vh] rounded-full bg-[#FF5F56]" />
          <span className="w-[0.7vh] h-[0.7vh] rounded-full bg-[#FFBD2E]" />
          <span className="w-[0.7vh] h-[0.7vh] rounded-full bg-[#27C93F]" />
          <span className="ms-[0.6vw] text-white/55 font-body text-[0.75vw] tracking-wide">
            ghayth-erp · لقطة حيّة من المنصّة
          </span>
        </div>
        <img
          src={fullSrc}
          alt={alt}
          crossOrigin="anonymous"
          className="block w-full h-full object-cover object-top pt-[2.2vh]"
        />

        {callouts.map((c, i) => {
          const side = c.side ?? "left";
          const labelPos: React.CSSProperties =
            side === "right" ? { left: "100%", marginInlineStart: "0.6vw", top: "50%", transform: "translateY(-50%)" }
            : side === "left" ? { right: "100%", marginInlineEnd: "0.6vw", top: "50%", transform: "translateY(-50%)" }
            : side === "top" ? { bottom: "100%", marginBottom: "0.6vh", left: "50%", transform: "translateX(-50%)" }
            : { top: "100%", marginTop: "0.6vh", left: "50%", transform: "translateX(-50%)" };

          return (
            <div
              key={i}
              className="absolute z-20"
              style={{ left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-50%, -50%)" }}
            >
              <div className="relative">
                <div className="w-[2.6vh] h-[2.6vh] rounded-full bg-accent text-primary font-display font-black text-[1.2vh] flex items-center justify-center shadow-[0_0_0_0.4vh_rgba(200,162,76,0.25)] ring-2 ring-white">
                  {i + 1}
                </div>
                <div
                  className="absolute whitespace-nowrap bg-primary text-white font-body text-[0.85vw] leading-tight px-[0.7vw] py-[0.5vh] rounded-md shadow-md border border-accent/40"
                  style={labelPos}
                  dir="rtl"
                >
                  {c.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {caption ? (
        <div className="mt-[0.8vh] text-muted font-body text-[0.85vw] text-center" dir="rtl">{caption}</div>
      ) : null}
    </div>
  );
}
