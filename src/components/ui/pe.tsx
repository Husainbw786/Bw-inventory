// Pioneer Enterprises — shared design primitives used across the redesigned screens.
// These wrap raw HTML so the look stays consistent without touching shadcn internals.
import * as React from "react";
import { cn } from "@/lib/utils";

export type PeTone = "good" | "warn" | "bad" | "info" | "neutral" | "green";

export const toneStyle = (tone: PeTone) => {
  switch (tone) {
    case "good": return { fg: "var(--pe-good)", bg: "var(--pe-good-bg)" };
    case "warn": return { fg: "var(--pe-warn)", bg: "var(--pe-warn-bg)" };
    case "bad":  return { fg: "var(--pe-bad)",  bg: "var(--pe-bad-bg)" };
    case "info": return { fg: "var(--pe-info)", bg: "var(--pe-info-bg)" };
    case "green":return { fg: "var(--pe-green)",bg: "var(--pe-green-soft)" };
    default:     return { fg: "var(--pe-ink-2)", bg: "#F0EEE5" };
  }
};

export function PeAvatar({ name, size = 44, tone = "green" }: { name?: string; size?: number; tone?: PeTone }) {
  const c = toneStyle(tone);
  const initials = (name || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      style={{
        width: size, height: size, borderRadius: size * 0.32, background: c.bg, color: c.fg,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontWeight: 750, fontSize: size * 0.38, flexShrink: 0, letterSpacing: "-0.02em",
      }}
    >{initials}</span>
  );
}

export function PeStatusPill({ tone, label, big }: { tone: PeTone; label: string; big?: boolean }) {
  const c = toneStyle(tone);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: big ? "7px 13px" : "4px 11px", borderRadius: 999,
        background: c.bg, color: c.fg, fontSize: big ? 14 : 12.5, fontWeight: 700,
        letterSpacing: "-0.01em", whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: c.fg }} />
      {label}
    </span>
  );
}

export function PeCard({ children, className, pad = 20, hover, onClick, style }: {
  children: React.ReactNode; className?: string; pad?: number; hover?: boolean;
  onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(hover && "pe-card-hover", "rounded-xl border border-[color:var(--pe-line)] bg-card", className)}
      style={{
        padding: pad,
        boxShadow: "0 1px 2px rgba(20,32,29,.04), 0 4px 16px rgba(20,32,29,.05)",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >{children}</div>
  );
}

export function PePageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-[28px] md:text-[30px] font-extrabold text-[color:var(--pe-ink)] tracking-[-0.035em] leading-[1.05] m-0">{title}</h1>
        {subtitle && <p className="text-sm md:text-[15px] text-[color:var(--pe-ink-3)] mt-1.5 font-medium">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function PeSectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div
      className="text-[color:var(--pe-ink-2)] font-bold tracking-[-0.01em]"
      style={{ fontSize: 14.5, margin: (first ? "4px" : "26px") + " 0 12px" }}
    >{children}</div>
  );
}
