import * as React from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<"input">, "onChange" | "value" | "type"> & {
  value: string | number;
  onValueChange: (val: string) => void;
  allowDecimal?: boolean;
  allowNegative?: boolean;
  min?: number;
  max?: number;
};

/**
 * Strict numeric input. Blocks any non-numeric keystroke (letters, e, +, -, etc.)
 * and rejects pastes that don't match the allowed numeric pattern.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, Props>(function NumberInput(
  { value, onValueChange, allowDecimal = true, allowNegative = false, min, max, inputMode, ...rest },
  ref,
) {
  const pattern = React.useMemo(() => {
    const neg = allowNegative ? "-?" : "";
    return allowDecimal ? new RegExp(`^${neg}\\d*\\.?\\d*$`) : new RegExp(`^${neg}\\d*$`);
  }, [allowDecimal, allowNegative]);

  const sanitize = (s: string) => {
    let v = s.replace(/[^\d.\-]/g, "");
    if (!allowNegative) v = v.replace(/-/g, "");
    else v = v.replace(/(?!^)-/g, "");
    if (!allowDecimal) v = v.replace(/\./g, "");
    else {
      const i = v.indexOf(".");
      if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
    }
    return v;
  };

  const clamp = (s: string) => {
    if (s === "" || s === "-" || s === ".") return s;
    const n = Number(s);
    if (!Number.isFinite(n)) return s;
    if (typeof max === "number" && n > max) return String(max);
    if (typeof min === "number" && n < min) return String(min);
    return s;
  };

  return (
    <Input
      ref={ref}
      type="text"
      inputMode={inputMode ?? (allowDecimal ? "decimal" : "numeric")}
      value={String(value ?? "")}
      onKeyDown={(e) => {
        const allowed = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];
        if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
        if (e.key.length === 1) {
          const target = e.currentTarget;
          const next = target.value.slice(0, target.selectionStart ?? 0) + e.key + target.value.slice(target.selectionEnd ?? 0);
          if (!pattern.test(next)) e.preventDefault();
        }
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData("text");
        const cleaned = sanitize(text);
        if (cleaned !== text) {
          e.preventDefault();
          onValueChange(clamp(sanitize((e.currentTarget.value ?? "") + cleaned)));
        }
      }}
      onChange={(e) => onValueChange(clamp(sanitize(e.target.value)))}
      {...rest}
    />
  );
});
