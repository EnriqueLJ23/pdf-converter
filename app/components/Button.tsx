import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

type Variant = "primary" | "secondary";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50",
  secondary:
    "border border-black/10 bg-transparent hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />
  );
}

export function ButtonLink({
  to,
  variant = "primary",
  className = "",
  children,
}: {
  to: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Link>
  );
}
