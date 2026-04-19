export default function ArchitectureDiagram({ className }: { className?: string }) {
  const stroke = "var(--slide-line)";
  const primary = "var(--slide-primary)";
  const accent = "var(--slide-accent)";
  const surface = "var(--slide-surface)";
  const text = "var(--slide-text)";
  const muted = "var(--slide-muted)";

  return (
    <svg
      viewBox="0 0 960 360"
      className={className}
      role="img"
      aria-label="مخطط معماري لنظام غيث ERP"
      direction="rtl"
    >
      <defs>
        <marker id="arrAccent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={accent} />
        </marker>
      </defs>

      {/* Layer 1: Channels / Portals */}
      <g>
        <rect x="20" y="16" width="920" height="62" rx="10" fill={surface} stroke={stroke} />
        <text x="920" y="40" textAnchor="end" fontFamily="Tajawal, sans-serif" fontSize="14" fontWeight="700" fill={primary}>
          القنوات
        </text>
        <text x="920" y="60" textAnchor="end" fontFamily="Tajawal, sans-serif" fontSize="11" fill={muted}>
          واجهات الموظف · بوابة العملاء · بوابة التوظيف · تطبيق الجوال · لوحات الإدارة
        </text>
        <g fontFamily="Tajawal, sans-serif" fontSize="11" fill={text}>
          <rect x="40" y="28" width="84" height="36" rx="6" fill="#fff" stroke={accent} />
          <text x="82" y="51" textAnchor="middle">موظفون</text>
          <rect x="132" y="28" width="84" height="36" rx="6" fill="#fff" stroke={accent} />
          <text x="174" y="51" textAnchor="middle">عملاء</text>
          <rect x="224" y="28" width="84" height="36" rx="6" fill="#fff" stroke={accent} />
          <text x="266" y="51" textAnchor="middle">مرشحون</text>
          <rect x="316" y="28" width="128" height="36" rx="6" fill="#fff" stroke={accent} />
          <text x="380" y="51" textAnchor="middle">إدارة عليا · جوال</text>
        </g>
      </g>

      <line x1="480" y1="78" x2="480" y2="100" stroke={accent} strokeWidth="2" markerEnd="url(#arrAccent)" />

      {/* Layer 2: Modules */}
      <g>
        <rect x="20" y="100" width="920" height="92" rx="10" fill={surface} stroke={stroke} />
        <text x="920" y="124" textAnchor="end" fontFamily="Tajawal, sans-serif" fontSize="14" fontWeight="700" fill={primary}>
          الوحدات الوظيفية
        </text>
        <g fontFamily="Tajawal, sans-serif" fontSize="11" fontWeight="600" fill={primary}>
          {[
            "HR",
            "FIN",
            "CRM",
            "OPS",
            "PRJ",
            "FLT",
            "RE",
            "LGL",
            "SUP",
            "PRT",
          ].map((code, i) => {
            const x = 40 + i * 88;
            return (
              <g key={code}>
                <rect x={x} y={140} width={76} height={40} rx={6} fill="#fff" stroke={accent} />
                <text x={x + 38} y={164} textAnchor="middle">
                  {code}
                </text>
              </g>
            );
          })}
        </g>
      </g>

      <line x1="480" y1="192" x2="480" y2="216" stroke={accent} strokeWidth="2" markerEnd="url(#arrAccent)" />

      {/* Layer 3: Core engines */}
      <g>
        <rect x="20" y="216" width="920" height="72" rx="10" fill={primary} />
        <text x="920" y="240" textAnchor="end" fontFamily="Tajawal, sans-serif" fontSize="14" fontWeight="700" fill={accent}>
          النواة الذكية
        </text>
        <g fontFamily="Tajawal, sans-serif" fontSize="12" fontWeight="600" fill="#fff">
          <rect x="40" y="248" width="160" height="32" rx="6" fill="rgba(255,255,255,0.08)" stroke={accent} />
          <text x="120" y="269" textAnchor="middle">محرّك القواعد</text>

          <rect x="210" y="248" width="160" height="32" rx="6" fill="rgba(255,255,255,0.08)" stroke={accent} />
          <text x="290" y="269" textAnchor="middle">سير الموافقات</text>

          <rect x="380" y="248" width="180" height="32" rx="6" fill="rgba(255,255,255,0.08)" stroke={accent} />
          <text x="470" y="269" textAnchor="middle">الإشعارات والتنبيهات</text>

          <rect x="570" y="248" width="170" height="32" rx="6" fill="rgba(255,255,255,0.08)" stroke={accent} />
          <text x="655" y="269" textAnchor="middle">التحليلات و KPIs</text>
        </g>
      </g>

      <line x1="480" y1="288" x2="480" y2="304" stroke={accent} strokeWidth="2" markerEnd="url(#arrAccent)" />

      {/* Layer 4: Data backbone */}
      <g>
        <rect x="20" y="304" width="920" height="44" rx="10" fill={surface} stroke={stroke} strokeDasharray="4 4" />
        <text x="920" y="322" textAnchor="end" fontFamily="Tajawal, sans-serif" fontSize="13" fontWeight="700" fill={primary}>
          العمود الفقري للبيانات
        </text>
        <text x="920" y="340" textAnchor="end" fontFamily="Tajawal, sans-serif" fontSize="10" fill={muted}>
          دفتر أستاذ موحّد · سجل تدقيق · هوية موحّدة · تكاملات بنكية وضريبية
        </text>
      </g>
    </svg>
  );
}
