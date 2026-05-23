import { forwardRef, useId } from "react";
import { cn } from "../../lib/cn";

export const Textarea = forwardRef(
  ({ label, error, helpText, className, id, rows = 4, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-err` : helpText ? `${inputId}-help` : undefined}
          className={cn(
            "block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm",
            "placeholder:text-slate-400 resize-y",
            "focus:outline-none focus:ring-2 focus:ring-[#1D6EF5]/40 focus:border-[#1D6EF5]",
            "disabled:bg-slate-50 disabled:text-slate-500",
            error && "border-red-400 focus:ring-red-200 focus:border-red-500",
            className,
          )}
          {...rest}
        />
        {error && (
          <p id={`${inputId}-err`} className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
        {!error && helpText && (
          <p id={`${inputId}-help`} className="mt-1 text-xs text-slate-500">
            {helpText}
          </p>
        )}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";
