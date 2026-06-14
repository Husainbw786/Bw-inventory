// Floating Tweaks panel — accent color, corner radius, big-text toggle.
// Stores prefs in localStorage and mutates :root CSS vars live.
import * as React from "react";
import { Settings2, X } from "lucide-react";

type Accent = "Emerald" | "Teal" | "Indigo" | "Plum";
type Corners = "Rounded" | "Soft" | "Sharp";
type Tweaks = { accent: Accent; corners: Corners; bigText: boolean };

const ACCENTS: Record<Accent, { green: string; dark: string; soft: string; soft2: string }> = {
  Emerald: { green: "#0E6B57", dark: "#0A4E40", soft: "#E6F2EE", soft2: "#D2E8E1" },
  Teal:    { green: "#0E7490", dark: "#0A5468", soft: "#E3F1F5", soft2: "#CDE6ED" },
  Indigo:  { green: "#4338CA", dark: "#312E81", soft: "#EAE9FB", soft2: "#DAD8F6" },
  Plum:    { green: "#9333EA", dark: "#6B21A8", soft: "#F3E9FC", soft2: "#EAD9F8" },
};
const RADII: Record<Corners, string> = { Rounded: "1.05rem", Soft: "0.85rem", Sharp: "0.5rem" };

const DEFAULTS: Tweaks = { accent: "Emerald", corners: "Soft", bigText: false };
const KEY = "pe-tweaks-v1";

function load(): Tweaks {
  if (typeof window === "undefined") return DEFAULTS;
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return DEFAULTS; }
}

function apply(t: Tweaks) {
  if (typeof document === "undefined") return;
  const a = ACCENTS[t.accent];
  const root = document.documentElement;
  root.style.setProperty("--pe-green", a.green);
  root.style.setProperty("--pe-green-dark", a.dark);
  root.style.setProperty("--pe-green-soft", a.soft);
  root.style.setProperty("--pe-green-soft-2", a.soft2);
  root.style.setProperty("--primary", a.green);
  root.style.setProperty("--ring", a.green);
  root.style.setProperty("--accent", a.soft);
  root.style.setProperty("--accent-foreground", a.dark);
  root.style.setProperty("--sidebar-primary", a.green);
  root.style.setProperty("--sidebar-ring", a.green);
  root.style.setProperty("--radius", RADII[t.corners]);
  document.body.classList.toggle("pe-big", t.bigText);
}

export function TweaksPanel() {
  const [t, setT] = React.useState<Tweaks>(DEFAULTS);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const initial = load();
    setT(initial);
    apply(initial);
  }, []);

  const update = (patch: Partial<Tweaks>) => {
    const next = { ...t, ...patch };
    setT(next);
    apply(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open appearance tweaks"
        className="fixed bottom-20 md:bottom-5 right-4 z-40 h-11 w-11 rounded-full bg-card border border-[color:var(--pe-line)] shadow-lg flex items-center justify-center text-[color:var(--pe-ink-2)] hover:text-[color:var(--pe-green)] hover:scale-105 transition print:hidden"
      >
        <Settings2 className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed bottom-32 md:bottom-20 right-4 z-50 w-72 rounded-xl border border-[color:var(--pe-line)] bg-card shadow-2xl p-4 print:hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-[color:var(--pe-ink)]">Tweaks</div>
            <button onClick={() => setOpen(false)} className="text-[color:var(--pe-ink-3)] hover:text-[color:var(--pe-ink)]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--pe-ink-3)] mb-1.5">Accent color</div>
            <div className="flex gap-2">
              {(Object.keys(ACCENTS) as Accent[]).map((name) => {
                const a = ACCENTS[name];
                const sel = t.accent === name;
                return (
                  <button
                    key={name}
                    onClick={() => update({ accent: name })}
                    aria-label={name}
                    className="h-10 flex-1 rounded-lg border-2 transition"
                    style={{
                      background: a.green,
                      borderColor: sel ? "#16201D" : "transparent",
                      boxShadow: sel ? "0 0 0 2px #fff inset" : undefined,
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--pe-ink-3)] mb-1.5">Corners</div>
            <div className="flex gap-1 p-1 rounded-lg bg-[#EFEDE3]">
              {(["Rounded", "Soft", "Sharp"] as Corners[]).map((c) => (
                <button
                  key={c}
                  onClick={() => update({ corners: c })}
                  className="flex-1 py-1.5 text-xs font-semibold rounded-md transition"
                  style={{
                    background: t.corners === c ? "#fff" : "transparent",
                    color: t.corners === c ? "var(--pe-ink)" : "var(--pe-ink-3)",
                    boxShadow: t.corners === c ? "0 1px 3px rgba(0,0,0,.08)" : undefined,
                  }}
                >{c}</button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-semibold text-[color:var(--pe-ink)]">Bigger text</span>
            <button
              type="button"
              role="switch"
              aria-checked={t.bigText}
              onClick={() => update({ bigText: !t.bigText })}
              className="relative w-10 h-6 rounded-full transition"
              style={{ background: t.bigText ? "var(--pe-green)" : "#D6D2C5" }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: t.bigText ? "translateX(16px)" : "translateX(0)" }}
              />
            </button>
          </label>
        </div>
      )}
    </>
  );
}
