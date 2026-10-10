import type { ReactNode } from "react";

// shadcn-style card, kept to the two pieces this app uses.
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">{children}</h2>;
}
