// Thin wrapper around the browser Contacts Picker API.
// Supported on Android Chrome/Chromium in a secure (HTTPS) context only;
// not available on iOS Safari or desktop. Callers must check contactsSupported()
// before exposing any contacts UI.

// The Contacts Picker API is not in the default DOM lib types, so declare the
// minimal surface we use here.
type ContactProperty = "name" | "tel" | "email" | "address" | "icon";
interface ContactInfo {
  name?: string[];
  tel?: string[];
  email?: string[];
  address?: unknown[];
}
interface ContactsManager {
  getProperties(): Promise<ContactProperty[]>;
  select(properties: ContactProperty[], options?: { multiple?: boolean }): Promise<ContactInfo[]>;
}
declare global {
  interface Navigator {
    contacts?: ContactsManager;
  }
}

export type PickedContact = { name: string; phone?: string };

export function contactsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    "contacts" in navigator &&
    "ContactsManager" in window
  );
}

// Opens the native contact picker and returns the selected contacts mapped to
// { name, phone }. Resolves to [] if the user cancels.
export async function pickContacts(): Promise<PickedContact[]> {
  const mgr = navigator.contacts;
  if (!mgr) return [];

  const supported = await mgr.getProperties();
  const props: ContactProperty[] = ["name", "tel"].filter((p) =>
    supported.includes(p as ContactProperty),
  ) as ContactProperty[];
  if (!props.includes("name")) return [];

  const selected = await mgr.select(props, { multiple: true });

  const out: PickedContact[] = [];
  for (const c of selected) {
    const name = (c.name ?? []).find((n) => n && n.trim())?.trim();
    const phone = (c.tel ?? []).find((t) => t && t.trim())?.trim();
    if (name) out.push({ name, phone: phone || undefined });
    else if (phone) out.push({ name: phone, phone }); // no name → use phone as label
  }
  return out;
}
