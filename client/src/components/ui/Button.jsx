import { forwardRef } from "react";
import { cn } from "../../lib/cn";

const VARIANTS = {
  primary:   "bg-[#1D6EF5] hover:bg-[#1857c4] text-white",
  secondary: "bg-slate-100 hover:bg-slate-200 text-slate-900",
  ghost:     "hover:bg-slate-100 text-slate-700",
  danger:    "bg-red-600 hover:bg-red-700 text-white",
};

const SIZES = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4",
  lg: "h-12 px-6 text-lg",
};

export const Button = forwardRef(
  ({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus:ring-2 focus:ring-[#1D6EF5]/40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
