import { cn } from "../../lib/cn";

export function Card({ className, children, ...rest }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

function CardHeader({ className, children, ...rest }) {
  return (
    <div className={cn("px-5 py-4 border-b border-slate-100", className)} {...rest}>
      {children}
    </div>
  );
}

function CardBody({ className, children, ...rest }) {
  return (
    <div className={cn("px-5 py-4", className)} {...rest}>
      {children}
    </div>
  );
}

function CardFooter({ className, children, ...rest }) {
  return (
    <div
      className={cn("px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

Card.Header = CardHeader;
Card.Body   = CardBody;
Card.Footer = CardFooter;
