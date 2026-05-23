import { cn } from "../../lib/cn";

const VARIANTS = {
  slate:  "bg-slate-100 text-slate-700",
  blue:   "bg-blue-100 text-blue-700",
  green:  "bg-emerald-100 text-emerald-700",
  yellow: "bg-amber-100 text-amber-800",
  red:    "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
};

export function Badge({ variant = "slate", className, children, ...rest }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
