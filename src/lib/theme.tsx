import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Check } from "lucide-react";

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
// App is light-mode only — dark theme has been removed.
const resolveDark = (_mode: ThemeMode) => false;

function applyTheme(mode: ThemeMode, accent: Accent) {
  if (!isBrowser) return;
  const dark = resolveDark(mode);
  const el = document.documentElement;
  el.classList.remove("dark");
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
var el=document.documentElement; el.classList.remove('dark');
var a=localStorage.getItem('${ACCENT_KEY}')||'Emerald';
var A={Emerald:{l:['#0E6B57','#0A4E40','#E6F2EE','#D2E8E1']},Teal:{l:['#0E7490','#0A5468','#E3F1F5','#CDE6ED']},Indigo:{l:['#4338CA','#312E81','#EAE9FB','#DAD8F6']},Plum:{l:['#9333EA','#6B21A8','#F3E9FC','#EAD9F8']}};
var p=(A[a]||A.Emerald).l;var s=el.style;
s.setProperty('--pe-green',p[0]);s.setProperty('--pe-green-dark',p[1]);s.setProperty('--pe-green-soft',p[2]);s.setProperty('--pe-green-soft-2',p[3]);
s.setProperty('--primary',p[0]);s.setProperty('--ring',p[0]);s.setProperty('--accent',p[2]);s.setProperty('--accent-foreground',p[1]);s.setProperty('--sidebar-primary',p[0]);s.setProperty('--sidebar-ring',p[0]);
}catch(e){}})();`;

type Ctx = { mode: ThemeMode; accent: Accent; setMode: (m: ThemeMode) => void; setAccent: (a: Accent) => void };
const ThemeCtx = React.createContext<Ctx>({ mode: "system", accent: "Emerald", setMode: () => {}, setAccent: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Light-mode only — mode is fixed to "light".
  const [mode, setModeS] = React.useState<ThemeMode>("light");
  const [accent, setAccentS] = React.useState<Accent>(() => (isBrowser && (localStorage.getItem(ACCENT_KEY) as Accent)) || "Emerald");

  React.useEffect(() => { applyTheme(mode, accent); }, [mode, accent]);

  const setMode = React.useCallback((_m: ThemeMode) => { setModeS("light"); if (isBrowser) localStorage.setItem(MODE_KEY, "light"); }, []);
  const setAccent = React.useCallback((a: Accent) => { setAccentS(a); if (isBrowser) localStorage.setItem(ACCENT_KEY, a); }, []);

  return <ThemeCtx.Provider value={{ mode, accent, setMode, setAccent }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => React.useContext(ThemeCtx);

// 3-dots "Appearance" menu — light/dark/system + accent colour.
export function AppearanceMenu({ className }: { className?: string }) {
  const { accent, setAccent } = useTheme();
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
          <div className="text-xs text-muted-foreground mb-2">Accent colour</div>
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
