type IconProps = {
  className?: string;
};

const baseProps = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HRIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <circle cx="22" cy="22" r="7" />
      <circle cx="44" cy="20" r="5.5" />
      <path d="M8 50c2-8 8-12 14-12s12 4 14 12" />
      <path d="M36 46c1.5-5.5 6-9 10-9 5 0 9 3 10.5 8" />
    </svg>
  );
}

export function FinanceIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <rect x="8" y="14" width="48" height="36" rx="3" />
      <path d="M8 24h48" />
      <circle cx="32" cy="38" r="6" />
      <path d="M32 33v10M29 36h6M29 40h6" />
      <path d="M14 44h4M50 44h-4" />
    </svg>
  );
}

export function CRMIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <circle cx="32" cy="22" r="8" />
      <path d="M14 52c2-9 9-14 18-14s16 5 18 14" />
      <path d="M48 14l4 4-4 4" />
      <path d="M16 14l-4 4 4 4" />
      <path d="M12 18h40" strokeDasharray="2 3" />
    </svg>
  );
}

export function OperationsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <circle cx="32" cy="32" r="9" />
      <path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6" />
      <circle cx="32" cy="32" r="3" />
    </svg>
  );
}

export function ProjectsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <rect x="8" y="12" width="14" height="40" rx="2" />
      <rect x="25" y="12" width="14" height="28" rx="2" />
      <rect x="42" y="12" width="14" height="34" rx="2" />
      <path d="M8 22h14M25 22h14M42 22h14" />
    </svg>
  );
}

export function FleetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <path d="M6 42V22h28v20" />
      <path d="M34 28h12l8 10v4H34" />
      <circle cx="18" cy="46" r="5" />
      <circle cx="44" cy="46" r="5" />
      <path d="M23 46h16" />
    </svg>
  );
}

export function PropertiesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <path d="M8 54V26l16-12 16 12v28" />
      <path d="M40 54V20l12 8v26" />
      <path d="M8 54h48" />
      <rect x="16" y="32" width="6" height="6" />
      <rect x="26" y="32" width="6" height="6" />
      <rect x="16" y="42" width="6" height="12" />
      <rect x="44" y="34" width="4" height="4" />
      <rect x="44" y="44" width="4" height="10" />
    </svg>
  );
}

export function LegalIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <path d="M32 10v44" />
      <path d="M14 54h36" />
      <path d="M14 22h36" />
      <path d="M22 22l-8 14h16z" />
      <path d="M50 22l-8 14h16z" />
      <circle cx="32" cy="14" r="3" />
    </svg>
  );
}

export function SupportIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <path d="M12 36v-4a20 20 0 0 1 40 0v4" />
      <rect x="8" y="36" width="10" height="14" rx="3" />
      <rect x="46" y="36" width="10" height="14" rx="3" />
      <path d="M46 50v2a6 6 0 0 1-6 6h-6" />
      <circle cx="32" cy="58" r="2" />
    </svg>
  );
}

export function PortalsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...baseProps} aria-hidden>
      <rect x="6" y="12" width="52" height="36" rx="3" />
      <path d="M6 22h52" />
      <circle cx="12" cy="17" r="1.4" fill="currentColor" />
      <circle cx="17" cy="17" r="1.4" fill="currentColor" />
      <circle cx="22" cy="17" r="1.4" fill="currentColor" />
      <path d="M14 32h16M14 38h22M14 44h12" />
      <rect x="40" y="30" width="14" height="14" rx="2" />
    </svg>
  );
}

export function ModuleIcon({ code, className }: { code: string; className?: string }) {
  switch (code) {
    case "HR":
      return <HRIcon className={className} />;
    case "FIN":
      return <FinanceIcon className={className} />;
    case "CRM":
      return <CRMIcon className={className} />;
    case "OPS":
      return <OperationsIcon className={className} />;
    case "PRJ":
      return <ProjectsIcon className={className} />;
    case "FLT":
      return <FleetIcon className={className} />;
    case "RE":
      return <PropertiesIcon className={className} />;
    case "LGL":
      return <LegalIcon className={className} />;
    case "SUP":
      return <SupportIcon className={className} />;
    case "PRT":
      return <PortalsIcon className={className} />;
    default:
      return null;
  }
}
