import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useDB, newId, nowStamp, itemLabel, type Item, type Person } from "@/lib/store";
import { toast } from "sonner";

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
  const [db, set] = useDB();
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
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const [c, setC] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setA("");
      setB("");
      setC("");
    }
  }, [open]);

  const submit = () => {
    if (!a.trim()) {
      toast.error("Name is required");
      return;
    }
    const id = newId();
    if (kind === "item") {
      const item: Item = {
        id,
        name: a.trim(),
        company: b.trim() || "Generic",
        unit: c.trim() || "pc",
        lowStock: 5,
        createdAt: nowStamp(),
      };
      set((db) => ({ ...db, items: [...db.items, item] }));
    } else {
      const p: Person = { id, name: a.trim(), phone: b.trim() || undefined, address: c.trim() || undefined, createdAt: nowStamp() };
      if (kind === "dealer") set((db) => ({ ...db, dealers: [...db.dealers, p] }));
      else set((db) => ({ ...db, customers: [...db.customers, p] }));
    }
    toast.success("Added");
    onCreated(id);
  };

  const t =
    kind === "item"
      ? { title: "Add item", a: "Item name (e.g. Brake Shoe)", b: "Company (e.g. Hero Honda)", c: "Unit (pc, set, btl)" }
      : kind === "dealer"
      ? { title: "Add dealer", a: "Dealer name", b: "Phone", c: "Address" }
      : { title: "Add customer", a: "Customer name", b: "Phone", c: "Address" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>{t.a}</Label>
            <Input value={a} onChange={(e) => setA(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>{t.b}</Label>
            <Input value={b} onChange={(e) => setB(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t.c}</Label>
            <Input value={c} onChange={(e) => setC(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
