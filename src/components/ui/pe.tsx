// Pioneer Enterprises — shared design primitives used across the redesigned screens.
// These wrap raw HTML so the look stays consistent without touching shadcn internals.
import * as React from "react";
import { cn } from "@/lib/utils";

export type PeTone = "good" | "warn" | "bad" | "info" | "neutral" | "green";

export const toneStyle = (tone: PeTone) => {
  switch (tone) {
    case "good":
      return { fg: "var(--pe-good)", bg: "var(--pe-good-bg)" };
    case "warn":
      return { fg: "var(--pe-warn)", bg: "var(--pe-warn-bg)" };
    case "bad":
      return { fg: "var(--pe-bad)", bg: "var(--pe-bad-bg)" };
    case "info":
      return { fg: "var(--pe-info)", bg: "var(--pe-info-bg)" };
    case "green":
      return { fg: "var(--pe-green)", bg: "var(--pe-green-soft)" };
    default:
      return { fg: "var(--pe-ink-2)", bg: "#F0EEE5" };
  }
};

export function PeAvatar({
  name,
  size = 44,
  tone = "green",
}: {
  name?: string;
  size?: number;
  tone?: PeTone;
}) {
  const c = toneStyle(tone);
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        background: c.bg,
        color: c.fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 750,
        fontSize: size * 0.38,
        flexShrink: 0,
        letterSpacing: "-0.02em",
      }}
    >
      {initials}
    </span>
  );
}

export function PeStatusPill({ tone, label, big }: { tone: PeTone; label: string; big?: boolean }) {
  const c = toneStyle(tone);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: big ? "7px 13px" : "4px 11px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: big ? 14 : 12.5,
        fontWeight: 700,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: c.fg }} />
      {label}
    </span>
  );
}

export function PeCard({
  children,
  className,
  pad = 20,
  hover,
  onClick,
  style,
  flat,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: number;
  hover?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  flat?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        hover && "pe-card-hover",
        "rounded-[10px] border border-[color:var(--pe-line)] bg-card",
        className,
      )}
      style={{
        padding: pad,
        boxShadow: flat ? "var(--pe-shadow)" : "var(--pe-shadow-lg)",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PePageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-[28px] md:text-[30px] font-extrabold text-[color:var(--pe-ink)] tracking-[-0.035em] leading-[1.05] m-0">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm md:text-[15px] text-[color:var(--pe-ink-3)] mt-1.5 font-medium">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function PeSectionLabel({
  children,
  first,
}: {
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className="text-[color:var(--pe-ink-2)] font-bold tracking-[-0.01em]"
      style={{ fontSize: 14.5, margin: (first ? "4px" : "26px") + " 0 12px" }}
    >
      {children}
    </div>
  );
}

// Inline save-error banner for dialog forms: the dialog stays open and shows
// what went wrong, instead of closing and losing the user's input.
export function PeFormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700"
    >
      {message}
    </div>
  );
}

// ---------- Emerald redesign primitives ----------
// Small, inline-styled building blocks that mirror the "Design B — Emerald"
// prototype: numbered step labels, grid tables, filter pills, segmented
// controls, and the three button shapes (green, gold, outline).

export const ini = (s?: string) =>
  (s || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

// Deterministic avatar tone from a name so the same party always gets the same colour.
export function toneFor(name?: string): PeTone {
  const tones: PeTone[] = ["warn", "green", "info", "good", "neutral"];
  const n = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return tones[Math.abs(n) % tones.length];
}

export function PeBtn({
  variant = "primary",
  size = "md",
  className,
  style,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const h = size === "sm" ? 34 : size === "lg" ? 48 : 40;
  const base: React.CSSProperties = {
    height: h,
    padding: size === "sm" ? "0 12px" : "0 16px",
    borderRadius: size === "sm" ? 8 : 10,
    fontSize: size === "sm" ? 12.5 : size === "lg" ? 15 : 13.5,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    whiteSpace: "nowrap",
    border: "1px solid transparent",
    transition: "background .12s ease, opacity .12s ease",
  };
  const v: React.CSSProperties =
    variant === "primary"
      ? { background: "var(--pe-green)", color: "#fff", borderColor: "var(--pe-green)" }
      : variant === "gold"
        ? {
            background: "var(--pe-gold)",
            color: "var(--pe-gold-ink)",
            borderColor: "var(--pe-gold)",
          }
        : variant === "outline"
          ? {
              background: "var(--pe-surface)",
              color: "var(--pe-ink)",
              borderColor: "var(--pe-line)",
              fontWeight: 650,
            }
          : { background: "transparent", color: "var(--pe-ink-2)", fontWeight: 650 };
  const hover =
    variant === "primary" ? "pe-btn-primary" : variant === "gold" ? "pe-btn-gold" : "pe-hover-bg";
  return (
    <button
      type="button"
      className={cn(
        hover,
        "disabled:opacity-50 disabled:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      style={{ ...base, ...v, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function PeStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.05em] text-[color:var(--pe-ink-3)]">
      <span
        className="inline-flex items-center justify-center text-white"
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          background: "var(--pe-green)",
          fontSize: 11,
        }}
      >
        {n}
      </span>
      {children}
    </div>
  );
}

// Section card header: title + subtitle on the left, optional action on the right.
export function PeCardHead({
  title,
  sub,
  action,
  divider = true,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3"
      style={{
        padding: "16px 20px",
        borderBottom: divider ? "1px solid var(--pe-line-2)" : undefined,
      }}
    >
      <div className="min-w-0">
        <div className="text-[15.5px] font-bold text-[color:var(--pe-ink)]">{title}</div>
        {sub && <div className="text-[12.5px] text-[color:var(--pe-ink-3)] mt-0.5">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

// "Open reports →" style text link.
export function PeArrow({ children, className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "pe-link text-[13px] font-semibold cursor-pointer whitespace-nowrap shrink-0",
        className,
      )}
      style={{ color: "var(--pe-green)" }}
      {...rest}
    >
      {children} →
    </span>
  );
}

// Grid-based table pieces. `template` is a grid-template-columns string; wrap
// rows in <PeTable minWidth> so narrow screens scroll horizontally.
export function PeTable({ minWidth, children }: { minWidth: number; children: React.ReactNode }) {
  return (
    <div className="pe-scroll-x">
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
export function PeTHead({
  template,
  children,
  top,
}: {
  template: string;
  children: React.ReactNode;
  top?: boolean;
}) {
  return (
    <div
      className="grid gap-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-[color:var(--pe-ink-3)]"
      style={{
        gridTemplateColumns: template,
        padding: "10px 20px",
        background: "var(--pe-bg-2)",
        borderTop: top ? "1px solid var(--pe-line-2)" : undefined,
        borderBottom: "1px solid var(--pe-line-2)",
      }}
    >
      {children}
    </div>
  );
}
export function PeTRow({
  template,
  children,
  onClick,
  className,
  style,
}: {
  template: string;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "grid gap-3 items-center text-[14px]",
        onClick && "pe-row-hover cursor-pointer",
        className,
      )}
      style={{
        gridTemplateColumns: template,
        padding: "12px 20px",
        borderTop: "1px solid var(--pe-line-3)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PeFilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      style={{
        height: 34,
        padding: "0 12px",
        borderRadius: 999,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 650,
        border: `1px solid ${active ? "var(--pe-green)" : "var(--pe-line)"}`,
        background: active ? "var(--pe-green-soft)" : "var(--pe-surface)",
        color: active ? "var(--pe-green-dark)" : "var(--pe-ink-2)",
      }}
    >
      {label}
      {count != null && <span style={{ fontSize: 11.5, opacity: 0.75 }}>{count}</span>}
    </button>
  );
}

export function PeSegmented<T extends string>({
  options,
  value,
  onChange,
  grow,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  grow?: boolean;
}) {
  return (
    <div
      className={cn("inline-flex", grow && "grid w-full")}
      style={{
        padding: 3,
        borderRadius: 10,
        background: "#EFEDE4",
        gap: 2,
        gridTemplateColumns: grow ? `repeat(${options.length}, 1fr)` : undefined,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              border: 0,
              cursor: "pointer",
              padding: "7px 14px",
              borderRadius: 8,
              fontSize: 13,
              whiteSpace: "nowrap",
              fontWeight: on ? 700 : 600,
              background: on ? "#fff" : "transparent",
              color: on ? "var(--pe-ink)" : "var(--pe-ink-3)",
              boxShadow: on ? "0 1px 2px rgba(20,32,29,.08)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Payment-mode chooser (Cash / UPI / Bank / Cheque …). `filled` = solid green when on.
export function PeModePicker<T extends string>({
  options,
  value,
  onChange,
  filled,
  columns,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  filled?: boolean;
  columns?: number;
}) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((m) => {
        const on = m.value === value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            style={{
              height: 34,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 700,
              padding: "0 6px",
              border: `1px solid ${on ? "var(--pe-green)" : "var(--pe-line)"}`,
              background: on
                ? filled
                  ? "var(--pe-green)"
                  : "var(--pe-green-soft)"
                : "var(--pe-surface)",
              color: on ? (filled ? "#fff" : "var(--pe-green-dark)") : "var(--pe-ink-2)",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// Page title block used by every redesigned screen: eyebrow, h1, subtitle, actions.
export function PeTitle({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap mb-[22px]">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[13.5px] font-semibold text-[color:var(--pe-ink-3)]">{eyebrow}</div>
        )}
        <h1
          className="text-[24px] md:text-[26px] font-bold tracking-[-0.02em] text-[color:var(--pe-ink)] m-0"
          style={{ marginTop: eyebrow ? 4 : 0 }}
        >
          {title}
        </h1>
        {sub && (
          <div className="text-[14px] font-medium text-[color:var(--pe-ink-3)] mt-1.5">{sub}</div>
        )}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function PeEmpty({ children, pad = 32 }: { children: React.ReactNode; pad?: number }) {
  return (
    <div className="text-center text-[14px] text-[color:var(--pe-ink-3)]" style={{ padding: pad }}>
      {children}
    </div>
  );
}

// Bordered ₹ amount field (design: 46px tall, bold input).
export function PeMoneyInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  size = "md",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <div
      className="flex items-center gap-2 bg-white"
      style={{
        height: size === "lg" ? 46 : 42,
        padding: "0 14px",
        borderRadius: 10,
        border: "1px solid #D7D3C6",
      }}
    >
      <span
        className="font-bold text-[color:var(--pe-ink-3)]"
        style={{ fontSize: size === "lg" ? 16 : 14 }}
      >
        ₹
      </span>
      <input
        value={value}
        autoFocus={autoFocus}
        inputMode="decimal"
        placeholder={placeholder ?? "0"}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          const i = v.indexOf(".");
          onChange(i === -1 ? v : v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, ""));
        }}
        className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[color:var(--pe-ink)]"
        style={{ fontSize: size === "lg" ? 18 : 15, fontWeight: 750 }}
      />
    </div>
  );
}
