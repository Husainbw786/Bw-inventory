import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Check, Sun, Moon, Monitor } from "lucide-react";

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "Emerald" | "Teal" | "Indigo" | "Plum";

// [green, greenDark, greenSoft, greenSoft2] per mode. `swatch` is the menu dot.
export const ACCENTS: Record<Accent, { light: string[]; dark: string[]; swatch: string }> = {
  Emerald: { light: ["#0E6B57", "#0A4E40", "#E6F2EE", "#D2E8E1"], dark: ["#2EBE9A", "#1F9E80", "#15302A", "#1C3D35"], swatch: "#0E6B57" },
  Teal: { light: ["#0E7490", "#0A5468", "#E3F1F5", "#CDE6ED"], dark: ["#2BBFD6", "#1E93A8", "#122E34", "#173B43"], swatch: "#0E7490" },
  Indigo: { light: ["#4338CA", "#312E81", "#EAE9FB", "#DAD8F6"], dark: ["#8B85F0", "#6B63E0", "#1E1F3A", "#272949"], swatch: "#4338CA" },
  Plum: { light: ["#9333EA", "#6B21A8", "#F3E9FC", "#EAD9F8"], dark: ["#C384F5", "#A35FE0", "#2A1E3A", "#371F49"], swatch: "#9333EA" },
};

export const MODE_KEY = "bw-theme-mode";
export const ACCENT_KEY = "bw-theme-accent";

const isBrowser = typeof window !== "undefined";
const prefersDark = () => isBrowser && window.matchMedia("(prefers-color-scheme: dark)").matches;
const resolveDark = (mode: ThemeMode) => mode === "dark" || (mode === "system" && prefersDark());

function applyTheme(mode: ThemeMode, accent: Accent) {
  if (!isBrowser) return;
  const dark = resolveDark(mode);
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  const p = (ACCENTS[accent] ?? ACCENTS.Emerald)[dark ? "dark" : "light"];
  const s = el.style;
  s.setProperty("--pe-green", p[0]);
  s.setProperty("--pe-green-dark", p[1]);
  s.setProperty("--pe-green-soft", p[2]);
  s.setProperty("--pe-green-soft-2", p[3]);
  s.setProperty("--primary", p[0]);
  s.setProperty("--ring", p[0]);
  s.setProperty("--accent", p[2]);
  s.setProperty("--accent-foreground", dark ? p[0] : p[1]);
  s.setProperty("--sidebar-primary", p[0]);
  s.setProperty("--sidebar-ring", p[0]);
}

// Inline <script> for the document head — applies the saved theme BEFORE first
// paint so there's no light/accent flash on load. Keep in sync with applyTheme.
export const THEME_INIT_SCRIPT = `(function(){try{
var m=localStorage.getItem('${MODE_KEY}')||'system';
var dark=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);
var el=document.documentElement; if(dark)el.classList.add('dark');
var a=localStorage.getItem('${ACCENT_KEY}')||'Emerald';
var A={Emerald:{l:['#0E6B57','#0A4E40','#E6F2EE','#D2E8E1'],d:['#2EBE9A','#1F9E80','#15302A','#1C3D35']},Teal:{l:['#0E7490','#0A5468','#E3F1F5','#CDE6ED'],d:['#2BBFD6','#1E93A8','#122E34','#173B43']},Indigo:{l:['#4338CA','#312E81','#EAE9FB','#DAD8F6'],d:['#8B85F0','#6B63E0','#1E1F3A','#272949']},Plum:{l:['#9333EA','#6B21A8','#F3E9FC','#EAD9F8'],d:['#C384F5','#A35FE0','#2A1E3A','#371F49']}};
var p=(A[a]||A.Emerald)[dark?'d':'l'];var s=el.style;
s.setProperty('--pe-green',p[0]);s.setProperty('--pe-green-dark',p[1]);s.setProperty('--pe-green-soft',p[2]);s.setProperty('--pe-green-soft-2',p[3]);
s.setProperty('--primary',p[0]);s.setProperty('--ring',p[0]);s.setProperty('--accent',p[2]);s.setProperty('--accent-foreground',dark?p[0]:p[1]);s.setProperty('--sidebar-primary',p[0]);s.setProperty('--sidebar-ring',p[0]);
}catch(e){}})();`;

type Ctx = { mode: ThemeMode; accent: Accent; setMode: (m: ThemeMode) => void; setAccent: (a: Accent) => void };
const ThemeCtx = React.createContext<Ctx>({ mode: "system", accent: "Emerald", setMode: () => {}, setAccent: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeS] = React.useState<ThemeMode>(() => (isBrowser && (localStorage.getItem(MODE_KEY) as ThemeMode)) || "system");
  const [accent, setAccentS] = React.useState<Accent>(() => (isBrowser && (localStorage.getItem(ACCENT_KEY) as Accent)) || "Emerald");

  React.useEffect(() => { applyTheme(mode, accent); }, [mode, accent]);

  React.useEffect(() => {
    if (mode !== "system" || !isBrowser) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system", accent);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [mode, accent]);

  const setMode = React.useCallback((m: ThemeMode) => { setModeS(m); if (isBrowser) localStorage.setItem(MODE_KEY, m); }, []);
  const setAccent = React.useCallback((a: Accent) => { setAccentS(a); if (isBrowser) localStorage.setItem(ACCENT_KEY, a); }, []);

  return <ThemeCtx.Provider value={{ mode, accent, setMode, setAccent }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => React.useContext(ThemeCtx);

// 3-dots "Appearance" menu — light/dark/system + accent colour.
export function AppearanceMenu({ className }: { className?: string }) {
  const { mode, accent, setMode, setAccent } = useTheme();
  const modes: { k: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { k: "light", label: "Light", icon: Sun },
    { k: "dark", label: "Dark", icon: Moon },
    { k: "system", label: "Auto", icon: Monitor },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Appearance settings"
          className={className ?? "text-[color:var(--pe-ink-3)] hover:text-[color:var(--pe-ink)] p-1.5"}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <div className="px-2 pb-2">
          <div className="text-xs text-muted-foreground mb-1.5">Theme</div>
          <div className="grid grid-cols-3 gap-1">
            {modes.map((m) => {
              const Icon = m.icon;
              const on = mode === m.k;
              return (
                <button
                  key={m.k}
                  onClick={() => setMode(m.k)}
                  className={
                    "flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-semibold transition " +
                    (on
                      ? "border-primary text-primary bg-primary/10"
                      : "border-[color:var(--pe-line)] text-[color:var(--pe-ink-2)] hover:bg-muted")
                  }
                >
                  <Icon className="h-4 w-4" />
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground mt-3 mb-2">Accent colour</div>
          <div className="flex gap-2.5">
            {(Object.keys(ACCENTS) as Accent[]).map((a) => {
              const on = accent === a;
              return (
                <button
                  key={a}
                  onClick={() => setAccent(a)}
                  aria-label={a}
                  title={a}
                  className={
                    "h-8 w-8 rounded-full flex items-center justify-center transition " +
                    (on ? "ring-2 ring-offset-2 ring-foreground ring-offset-background" : "hover:scale-105")
                  }
                  style={{ background: ACCENTS[a].swatch }}
                >
                  {on && <Check className="h-4 w-4 text-white" />}
                </button>
              );
            })}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
