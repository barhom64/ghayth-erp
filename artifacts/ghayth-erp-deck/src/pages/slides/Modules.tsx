import { ModuleIcon } from "../../components/ModuleIcons";
import PlatformShot from "../../components/PlatformShot";

type ModuleNode = {
  code: string;
  iconCode: string;
  name: string;
  tagline: string;
};

const MODULES: ModuleNode[] = [
  { code: "HR", iconCode: "HR", name: "الموارد البشرية", tagline: "رواتب · حضور · أداء" },
  { code: "FIN", iconCode: "FIN", name: "المالية والمحاسبة", tagline: "قيود · ميزانيات · بنوك" },
  { code: "OPS", iconCode: "OPS", name: "العمليات", tagline: "طلبات · مهام · سير عمل" },
  { code: "FLT", iconCode: "FLT", name: "الأسطول", tagline: "مركبات · صيانة · وقود" },
  { code: "RE", iconCode: "RE", name: "الأملاك", tagline: "عقود · إيجارات · مستأجرون" },
  { code: "LGL", iconCode: "LGL", name: "القانونية", tagline: "قضايا · عقود · مواعيد" },
  { code: "PRJ", iconCode: "PRJ", name: "المشاريع", tagline: "خطط · مراحل · تكاليف" },
  { code: "SUP", iconCode: "SUP", name: "الدعم الفني", tagline: "تذاكر · SLA · معرفة" },
  { code: "CRM", iconCode: "CRM", name: "إدارة العملاء", tagline: "عملاء · فرص · 360°" },
  { code: "PRT", iconCode: "PRT", name: "البوابات الثلاث", tagline: "موظف · عميل · توظيف" },
];

function HubAndSpoke() {
  const cx = 300;
  const cy = 300;
  const hubR = 78;
  const orbitR = 232;
  const nodeR = 44;
  const count = MODULES.length;

  const nodes = MODULES.map((m, i) => {
    const angle = (-Math.PI / 2) + (i * (2 * Math.PI)) / count;
    const x = cx + orbitR * Math.cos(angle);
    const y = cy + orbitR * Math.sin(angle);
    const lineX1 = cx + hubR * Math.cos(angle);
    const lineY1 = cy + hubR * Math.sin(angle);
    const lineX2 = x - nodeR * Math.cos(angle);
    const lineY2 = y - nodeR * Math.sin(angle);
    return { ...m, x, y, lineX1, lineY1, lineX2, lineY2, angle };
  });

  return (
    <svg
      viewBox="0 0 600 600"
      className="w-full h-full"
      role="img"
      aria-label="مخطط دائري للوحدات العشر حول نواة غيث ERP"
    >
      <defs>
        <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#C8A24C" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#C8A24C" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#C8A24C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hubFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a3d3a" />
          <stop offset="100%" stopColor="#0d2422" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r={orbitR + 8} fill="none" stroke="#C8A24C" strokeOpacity="0.18" strokeDasharray="2 6" />
      <circle cx={cx} cy={cy} r={orbitR - 60} fill="none" stroke="#ffffff" strokeOpacity="0.06" />

      <circle cx={cx} cy={cy} r={hubR + 60} fill="url(#hubGlow)" />

      {nodes.map((n) => (
        <line
          key={`line-${n.code}`}
          x1={n.lineX1}
          y1={n.lineY1}
          x2={n.lineX2}
          y2={n.lineY2}
          stroke="#C8A24C"
          strokeOpacity="0.55"
          strokeWidth="1.4"
        />
      ))}

      <circle cx={cx} cy={cy} r={hubR} fill="url(#hubFill)" stroke="#C8A24C" strokeWidth="1.6" />
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        fill="#C8A24C"
        fontFamily="inherit"
        fontWeight="800"
        fontSize="22"
        letterSpacing="2"
      >
        غيث
      </text>
      <text
        x={cx}
        y={cy + 22}
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="inherit"
        fontWeight="700"
        fontSize="14"
        letterSpacing="3"
      >
        ERP
      </text>
      <text
        x={cx}
        y={cy + 44}
        textAnchor="middle"
        fill="#ffffff"
        fillOpacity="0.5"
        fontFamily="inherit"
        fontWeight="500"
        fontSize="9"
        letterSpacing="2"
      >
        النواة المشتركة
      </text>

      {nodes.map((n) => (
        <g key={`node-${n.code}`}>
          <circle
            cx={n.x}
            cy={n.y}
            r={nodeR}
            fill="#0d2422"
            stroke="#C8A24C"
            strokeOpacity="0.7"
            strokeWidth="1.4"
          />
          <svg
            x={n.x - 14}
            y={n.y - 22}
            width="28"
            height="28"
            viewBox="0 0 28 28"
            style={{ color: "#C8A24C" }}
          >
            <ModuleIcon code={n.iconCode} className="w-full h-full" />
          </svg>
          <text
            x={n.x}
            y={n.y + 18}
            textAnchor="middle"
            fill="#ffffff"
            fontFamily="inherit"
            fontWeight="700"
            fontSize="9"
            letterSpacing="1.5"
          >
            {n.code}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function Modules() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-full h-[8vh] bg-gradient-to-b from-black/30 to-transparent" />

      <div className="flex items-end justify-between mb-[3vh]">
        <div>
          <div className="text-accent font-body text-[1.1vw] font-semibold tracking-wider mb-[1.5vh]">
            الفصل الثالث · الوحدات
          </div>
          <h2 className="font-display text-white font-black text-[3.6vw] leading-[1.05] tracking-tighter">
            منظومة وحدات متكاملة
          </h2>
        </div>
        <div className="text-white/60 font-body text-[1vw] pb-[1vh] max-w-[28vw] text-left">
          عشر وحدات متّصلة بنواة واحدة — لا عشرة برامج منفصلة
        </div>
      </div>

      <div className="grid grid-cols-12 gap-[2vw] items-center" style={{ height: "70vh" }}>
        <div className="col-span-7 h-full flex items-center justify-center">
          <div className="w-full h-full max-h-[68vh] aspect-square">
            <HubAndSpoke />
          </div>
        </div>

        <div className="col-span-5 grid grid-cols-2 gap-[0.9vw]">
          {MODULES.map((m) => (
            <div
              key={m.code}
              className="bg-white/8 border border-white/15 rounded-lg px-[0.9vw] py-[1vh] flex items-center gap-[0.8vw]"
            >
              <div className="text-accent w-[2vw] h-[2vw] shrink-0">
                <ModuleIcon code={m.iconCode} className="w-full h-full" />
              </div>
              <div className="min-w-0">
                <div className="text-accent font-display text-[0.7vw] font-bold tracking-widest">{m.code}</div>
                <div className="text-white font-display text-[1vw] font-bold leading-tight truncate">{m.name}</div>
                <div className="text-white/55 font-body text-[0.7vw] mt-[0.2vh] truncate">{m.tagline}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="absolute bottom-[7vh] left-[6vw] w-[22vw]"
        style={{ aspectRatio: "1600 / 960" }}
      >
        <PlatformShot
          src="screenshots/dashboard.png"
          alt="لوحة التحكم في غيث ERP"
          className="w-full h-full"
          callouts={[
            { x: 50, y: 30, label: "نواة موحّدة لكل الوحدات", side: "bottom" },
          ]}
        />
        <div className="absolute -top-[2.6vh] right-0 text-accent font-body text-[0.8vw] font-bold tracking-[0.25em]">
          لقطة حيّة · لوحة التحكم
        </div>
      </div>

      <div className="absolute bottom-[2.5vh] right-[6vw] text-white/50 font-body text-[1vw]">04 / 19</div>
    </div>
  );
}
