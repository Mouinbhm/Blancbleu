import { cn } from "../../lib/cn";

export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      {icon && <div className="mb-3 text-slate-400 text-4xl">{icon}</div>}
      {title && <h3 className="text-base font-semibold text-slate-800">{title}</h3>}
      {description && (
        <p className="mt-1 text-sm text-slate-500 max-w-md">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
