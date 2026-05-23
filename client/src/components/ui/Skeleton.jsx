import { cn } from "../../lib/cn";

export function Skeleton({ className, ...rest }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded bg-slate-200", className)}
      {...rest}
    />
  );
}
