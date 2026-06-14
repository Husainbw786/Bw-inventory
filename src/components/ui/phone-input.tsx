import * as React from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<"input">, "onChange" | "value" | "type"> & {
  value: string;
  onValueChange: (val: string) => void;
};

/**
 * Phone input — allows digits, spaces, +, -, ( ). Max 20 chars.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, Props>(function PhoneInput(
  { value, onValueChange, maxLength = 20, ...rest },
  ref,
) {
  const sanitize = (s: string) => s.replace(/[^\d+\-\s()]/g, "").slice(0, maxLength);
  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="tel"
      value={value ?? ""}
      onChange={(e) => onValueChange(sanitize(e.target.value))}
      onPaste={(e) => {
        const text = e.clipboardData.getData("text");
        const cleaned = sanitize(text);
        if (cleaned !== text) {
          e.preventDefault();
          onValueChange(sanitize((value ?? "") + cleaned));
        }
      }}
      {...rest}
    />
  );
});

export function isValidPhone(v: string) {
  if (!v) return true; // optional
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
