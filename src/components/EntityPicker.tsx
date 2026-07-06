import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDB, newId, nowStamp, itemLabel, isValidGstin, GST_SLABS, type Item, type Person } from "@/lib/store";
import { isValidPhone, PhoneInput } from "@/components/ui/phone-input";
import { toast } from "sonner";
import { PeFormError } from "@/components/ui/pe";

type Kind = "item" | "dealer" | "customer";

export function EntityPicker({
  kind,
  value,
  onChange,
  placeholder,
}: {
  kind: Kind;
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [db] = useDB();
  const [open, setOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  const list = kind === "item" ? db.items : kind === "dealer" ? db.dealers : db.customers;
  const label = (id: string) => {
    if (kind === "item") {
      const it = db.items.find((i) => i.id === id);
      return it ? itemLabel(it) : "";
    }
    const p = list.find((x) => x.id === id) as Person | undefined;
    return p?.name ?? "";
  };

  const selected = value ? label(value) : "";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between h-11 font-normal">
            <span className={cn(!selected && "text-muted-foreground")}>{selected || placeholder || "Select…"}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${kind}…`} />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {(list as (Item | Person)[]).map((row) => {
                  const text = "company" in row ? itemLabel(row) : row.name;
                  return (
                    <CommandItem
                      key={row.id}
                      value={text}
                      onSelect={() => {
                        onChange(row.id);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === row.id ? "opacity-100" : "opacity-0")} />
                      {text}
                    </CommandItem>
                  );
                })}
                <CommandItem
                  value="__add"
                  onSelect={() => {
                    setOpen(false);
                    setAddOpen(true);
                  }}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add new {kind}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <AddDialog
        kind={kind}
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(id) => {
          onChange(id);
          setAddOpen(false);
        }}
      />
    </>
  );
}

// Quick-add with the SAME field set as the full Items/Directory dialogs, so
// records created mid-bill aren't second-class (missing price/GST/GSTIN).
function AddDialog({
  kind,
  open,
  onOpenChange,
  onCreated,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [, set] = useDB();
  // item fields
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [unit, setUnit] = React.useState("pc");
  const [price, setPrice] = React.useState("");
  const [gstSlab, setGstSlab] = React.useState("none");
  const [hsn, setHsn] = React.useState("");
  const [low, setLow] = React.useState("5");
  // person fields
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [gstin, setGstin] = React.useState("");
  const [opening, setOpening] = React.useState("0");
  const [openingAdvance, setOpeningAdvance] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(""); setCompany(""); setUnit("pc"); setPrice(""); setGstSlab("none"); setHsn(""); setLow("5");
      setPhone(""); setAddress(""); setGstin(""); setOpening("0"); setOpeningAdvance(false);
      setSaving(false); setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const id = newId();
    let res;
    setError(null);
    if (kind === "item") {
      const item: Item = {
        id,
        name: name.trim(),
        company: company.trim() || "Generic",
        unit: unit.trim() || "pc",
        lowStock: Number(low) || 5,
        price: price.trim() === "" ? null : Math.max(0, Number(price) || 0),
        gstRate: gstSlab === "none" ? null : Number(gstSlab),
        hsn: hsn.trim() || undefined,
        createdAt: nowStamp(),
      };
      setSaving(true);
      res = await set((db) => ({ ...db, items: [...db.items, item] }));
    } else {
      if (!isValidPhone(phone.trim())) return setError("Enter a valid phone (7–15 digits)");
      const g = gstin.trim().toUpperCase();
      if (g && !isValidGstin(g)) return setError("GSTIN must be 15 characters starting with a 2-digit state code");
      const ob = (openingAdvance ? -1 : 1) * Math.max(0, Number(opening) || 0);
      const p: Person = {
        id,
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        gstin: g || undefined,
        openingBalance: ob,
        createdAt: nowStamp(),
      };
      setSaving(true);
      res = await set((db) =>
        kind === "dealer" ? { ...db, dealers: [...db.dealers, p] } : { ...db, customers: [...db.customers, p] },
      );
    }
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast.success("Added");
    onCreated(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind === "item" ? "Add item" : kind === "dealer" ? "Add dealer" : "Add customer"}</DialogTitle>
        </DialogHeader>
        {kind === "item" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Item name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brake Shoe" autoFocus maxLength={80} />
            </div>
            <div className="grid gap-1.5">
              <Label>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Hero Honda" maxLength={80} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Unit</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value.replace(/[^a-zA-Z/ ]/g, "").slice(0, 12))} placeholder="pc / set / btl" />
              </div>
              <div className="grid gap-1.5">
                <Label>Low-stock alert</Label>
                <NumberInput value={low} onValueChange={setLow} allowDecimal={false} min={0} max={99999} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Selling price (₹)</Label>
                <NumberInput value={price} onValueChange={setPrice} min={0} max={10000000} placeholder="auto-fills bills" />
              </div>
              <div className="grid gap-1.5">
                <Label>GST slab</Label>
                <Select value={gstSlab} onValueChange={setGstSlab}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {GST_SLABS.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>HSN/SAC code</Label>
              <Input value={hsn} onChange={(e) => setHsn(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 8))} placeholder="e.g. 8708" />
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <PhoneInput value={phone} onValueChange={setPhone} placeholder="e.g. +91 98765 43210" />
            </div>
            <div className="grid gap-1.5">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
            </div>
            <div className="grid gap-1.5">
              <Label>GSTIN (optional)</Label>
              <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} placeholder="e.g. 27ABCDE1234F1Z5" />
            </div>
            <div className="grid gap-1.5">
              <Label>Opening balance (₹)</Label>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput value={opening} onValueChange={setOpening} />
                <Select value={openingAdvance ? "advance" : "due"} onValueChange={(v) => setOpeningAdvance(v === "advance")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due">{kind === "dealer" ? "You owe them" : "They owe you"}</SelectItem>
                    <SelectItem value="advance">Advance held</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
        <PeFormError message={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
