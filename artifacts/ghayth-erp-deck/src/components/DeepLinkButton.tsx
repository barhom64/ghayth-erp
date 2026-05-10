import { Link } from "react-router-dom";

type Props = {
  to: string;
  label: string;
  variant?: "to-deep" | "to-short";
  className?: string;
};

export default function DeepLinkButton({
  to,
  label,
  variant = "to-deep",
  className = "",
}: Props) {
  const arrow = variant === "to-deep" ? "↙" : "↗";
  return (
    <Link
      to={to}
      data-deep-link="true"
      className={
        "deep-link-btn inline-flex items-center gap-[0.5vw] rounded-md " +
        "bg-accent/15 hover:bg-accent/25 active:bg-accent/35 " +
        "text-accent border border-accent/40 " +
        "px-[0.9vw] py-[0.6vh] font-body text-[0.85vw] font-bold " +
        "tracking-wide transition-colors no-underline " +
        className
      }
    >
      <span aria-hidden="true">{arrow}</span>
      <span>{label}</span>
    </Link>
  );
}
