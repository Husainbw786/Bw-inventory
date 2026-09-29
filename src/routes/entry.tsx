import * as React from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityPicker } from "@/components/EntityPicker";
import { MobileHeader } from "@/components/AppLayout";
import { NumberInput } from "@/components/ui/number-input";
import {
  useDB,
  today,
  fmtINR,
  fmtDate,
  newId,
  nowStamp,
  khataReady,
  partyBalance,
  findItem,
  findDealer,
  findCustomer,
  itemLabel,
  type Payment,
  type PaymentMode,
  type Purchase,
  type Expense,
} from "@/lib/store";
import { useCanWrite } from "@/lib/auth";
import {
  PeAvatar,
  PeBtn,
  PeCard,
  PeEmpty,
  PeFormError,
  PeModePicker,
  PeMoneyInput,
  PeTitle,
} from "@/components/ui/pe";
import { X } from "lucide-react";
import { toast } from "sonner";

type EntryType = "purchase" | "expense" | "in" | "out";
const TYPES: { value: EntryType | "sale"; label: string }[] = [
  { value: "sale", label: "Sale" },
  { value: "purchase", label: "Purchase" },
  { value: "expense", label: "Expense" },
  { value: "in", label: "Got payment" },
  { value: "out", label: "Gave payment" },
];
const MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank" },
  { value: "cheque", label: "Cheque" },
];
const CATS = ["Transport", "Rent", "Tea & Snacks", "Electricity", "Repairs", "Stationery", "Other"];
type PayStatus = "full" | "partial" | "credit";

export const Route = createFileRoute("/entry")({
  // Quick entry from the mobile "+" menu: ?type=purchase|expense|in|out[&party=<id>]
  validateSearch: (search: Record<string, unknown>): { type?: EntryType; party?: string } => ({
    ...(search.type === "purchase" ||
    search.type === "expense" ||
    search.type === "in" ||
    search.type === "out"
      ? { type: search.type }
      : {}),
    ...(typeof search.party === "string" && search.party ? { party: search.party } : {}),
  }),
  head: () => ({ meta: [{ title: "Add entry — Shop Manager" }] }),
  component: EntryPage,
});

// Selectable "status" tile (Paid / Partial / Unpaid…).
function Tile({
  on,
  label,
  sub,
  onClick,
}: {
  on: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-center"
      style={{
        padding: "10px 6px",
        borderRadius: 10,
        cursor: "pointer",
        border: `1.5px solid ${on ? "var(--pe-green)" : "var(--pe-line)"}`,
        background: on ? "var(--pe-green-soft)" : "#fff",
      }}
    >
      <span
        className="block text-[13.5px] font-bold"
        style={{ color: on ? "var(--pe-green-dark)" : "var(--pe-ink)" }}
      >
        {label}
      </span>
      <span className="block text-[11px] text-[color:var(--pe-ink-3)] mt-px">{sub}</span>
    </button>
  );
}

function EntryPage() {
  const [db, set] = useDB();
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();
  const type: EntryType = search.type ?? "purchase";
  const [partyId, setPartyId] = React.useState<string | null>(search.party ?? null);
  const [itemId, setItemId] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [status, setStatus] = React.useState<PayStatus>("full");
  const [paid, setPaid] = React.useState("");
  const [mode, setMode] = React.useState<PaymentMode>("cash");
  const [cat, setCat] = React.useState(CATS[0]);
  const [customCat, setCustomCat] = React.useState("");
  const [note, setNote] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPartyId(search.party ?? null);
    setError(null);
  }, [type, search.party]);

  const pickType = (t: EntryType | "sale") => {
    if (t === "sale") navigate({ to: "/sales/new" });
    else navigate({ to: "/entry", search: { type: t }, replace: true });
  };
  const close = () => (router.history.length > 1 ? router.history.back() : navigate({ to: "/" }));

  const partyKind =
    type === "purchase" || type === "out" ? "dealer" : type === "in" ? "customer" : null;
  const party =
    partyKind === "dealer"
      ? findDealer(db, partyId)
      : partyKind === "customer"
        ? findCustomer(db, partyId)
        : undefined;
  const bal = party && partyKind ? partyBalance(db, partyKind, party.id) : 0;
  const total =
    type === "purchase" ? (Number(qty) || 0) * (Number(rate) || 0) : Number(amount) || 0;
  const paidNow =
    type === "purchase"
      ? status === "full"
        ? total
        : status === "credit"
          ? 0
          : Math.min(total, Number(paid) || 0)
      : total;
  const due = Math.max(0, total - paidNow);

  // Summary box copy, mirroring the prototype.
  const summary = (() => {
    if (type === "purchase")
      return {
        moneyLabel: "Paid now",
        money: paidNow,
        resultLabel: due > 0 ? "Added to dealer khata as due" : "Nothing due",
        result: due,
        color: due > 0 ? "var(--pe-warn)" : "var(--pe-good)",
        hint: "Stock comes in from the dealer.",
      };
    if (type === "expense")
      return {
        moneyLabel: "Money spent",
        money: total,
        resultLabel: "Shows in today's spend",
        result: total,
        color: "var(--pe-ink)",
        hint: "Not linked to any customer or dealer.",
      };
    const newBal = bal - total;
    return {
      moneyLabel: type === "in" ? "Money received" : "Money paid",
      money: total,
      resultLabel: !party
        ? "Pick a party first"
        : newBal > 0
          ? "Still due after this"
          : newBal < 0
            ? "Extra kept as advance"
            : "Account settled",
      result: Math.abs(newBal),
      color: newBal > 0 ? "var(--pe-bad)" : "var(--pe-good)",
      hint: "Reduces the running balance in khata.",
    };
  })();

  const submit = async () => {
    if (!canWrite) return setError("You have view-only access");
    if (type === "purchase") {
      if (!partyId || !itemId || !qty || !rate)
        return setError("Fill dealer, item, quantity and rate");
      const p: Purchase = {
        id: newId(),
        date,
        itemId,
        dealerId: partyId,
        qty: Number(qty),
        rate: Number(rate),
        notes: note || undefined,
        addedBy: db.currentUser,
        createdAt: nowStamp(),
      };
      // "Paid now" settles (part of) this purchase in the dealer's khata in the
      // same save; the row dies with the purchase (purchaseId CASCADE).
      const pay: Payment | null =
        paidNow > 0 && khataReady()
          ? {
              id: newId(),
              date,
              partyType: "dealer",
              partyId,
              saleId: null,
              purchaseId: p.id,
              amount: paidNow,
              mode,
              notes: "Paid with purchase",
              addedBy: db.currentUser,
              createdAt: nowStamp(),
            }
          : null;
      setSaving(true);
      const res = await set((d) => ({
        ...d,
        purchases: [...d.purchases, p],
        payments: pay ? [...d.payments, pay] : d.payments,
      }));
      setSaving(false);
      if (!res.ok) return setError(res.error);
      toast.success(due > 0 ? `Purchase saved · ${fmtINR(due)} to pay in khata` : "Purchase saved");
    } else if (type === "expense") {
      if (total <= 0) return setError("Enter an amount");
      const e: Expense = {
        id: newId(),
        date,
        category: cat === "Other" ? customCat.trim() || "Other" : cat,
        amount: total,
        note: note || undefined,
        addedBy: db.currentUser,
        createdAt: nowStamp(),
      };
      setSaving(true);
      const res = await set((d) => ({ ...d, expenses: [...d.expenses, e] }));
      setSaving(false);
      if (!res.ok) return setError(res.error);
      toast.success("Expense added");
    } else {
      if (!partyId || !partyKind)
        return setError(type === "in" ? "Choose a customer" : "Choose a dealer");
      if (total <= 0) return setError("Enter an amount");
      const p: Payment = {
        id: newId(),
        date,
        partyType: partyKind,
        partyId,
        saleId: null,
        amount: total,
        mode,
        notes: note.trim() || undefined,
        addedBy: db.currentUser,
        createdAt: nowStamp(),
      };
      setSaving(true);
      const res = await set((d) => ({ ...d, payments: [...d.payments, p] }));
      setSaving(false);
      if (!res.ok) return setError(res.error);
      toast.success(type === "in" ? "Payment received recorded" : "Payment to dealer recorded");
    }
    close();
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-semibold text-[color:var(--pe-ink-2)]">{label}</span>
      {node}
    </div>
  );
  const typeChips = (
    <div className="flex flex-wrap gap-1.5">
      {TYPES.map((t) => {
        const on = t.value === type;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => pickType(t.value)}
            className="shrink-0 whitespace-nowrap text-[13px] font-bold"
            style={{
              height: 36,
              padding: "0 13px",
              borderRadius: 999,
              background: on ? "var(--pe-gold)" : "rgba(255,255,255,.1)",
              color: on ? "var(--pe-gold-ink)" : "#fff",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
  const saveLabel =
    type === "purchase"
      ? "Save purchase"
      : type === "expense"
        ? "Save expense"
        : type === "in"
          ? "Save payment received"
          : "Save payment made";

  if (!canWrite) {
    return (
      <>
        <PeTitle title="Add entry" />
        <PeCard flat>
          <PeEmpty>You have view-only access to this business.</PeEmpty>
        </PeCard>
      </>
    );
  }

  return (
    <>
      <MobileHeader hideNav>
        <div style={{ padding: "6px 16px 14px" }}>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="inline-flex items-center justify-center"
              style={{ width: 40, height: 40 }}
            >
              <X className="h-[22px] w-[22px]" />
            </button>
            <div className="flex-1 text-[17px] font-bold">Add entry</div>
            <span className="text-[12.5px]" style={{ color: "rgba(255,255,255,.7)" }}>
              {fmtDate(date)}
            </span>
          </div>
          <div className="mt-3">{typeChips}</div>
        </div>
      </MobileHeader>

      <div className="hidden md:block">
        <PeTitle
          eyebrow="Quick entry"
          title={TYPES.find((t) => t.value === type)?.label ?? "Add entry"}
          actions={
            <div className="rounded-xl px-2 py-1.5" style={{ background: "var(--pe-header)" }}>
              {typeChips}
            </div>
          }
        />
      </div>

      <div className="grid gap-3 mx-auto w-full max-w-[560px] md:mx-0 pb-24 md:pb-0">
        {partyKind &&
          field(
            partyKind === "dealer" ? "Dealer" : "Customer",
            <>
              <EntityPicker
                kind={partyKind}
                value={partyId}
                onChange={setPartyId}
                placeholder={`Choose ${partyKind}`}
              />
              {party && (
                <div
                  className="flex items-center gap-2.5 text-[12.5px]"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: "#fff",
                    border: "1px solid var(--pe-line)",
                  }}
                >
                  <PeAvatar
                    name={party.name}
                    tone={partyKind === "dealer" ? "info" : "green"}
                    size={30}
                  />
                  <span className="font-semibold text-[color:var(--pe-ink)] truncate flex-1">
                    {party.name}
                  </span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: bal > 0 ? "var(--pe-bad)" : "var(--pe-good)" }}
                  >
                    {bal > 0
                      ? `${partyKind === "dealer" ? "You owe" : "Owes you"} ${fmtINR(bal)}`
                      : bal < 0
                        ? `Advance ${fmtINR(-bal)}`
                        : "Settled"}
                  </span>
                </div>
              )}
            </>,
          )}

        {type === "purchase" && (
          <>
            {field(
              "Item",
              <>
                <EntityPicker
                  kind="item"
                  value={itemId}
                  onChange={(id) => {
                    setItemId(id);
                    const it = findItem(db, id);
                    if (it && !rate) {
                      const last = db.purchases
                        .filter((p) => p.itemId === id)
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                      if (last) setRate(String(last.rate));
                    }
                  }}
                  placeholder="Choose item"
                />
                {itemId && findItem(db, itemId) && (
                  <span className="text-[12px] text-[color:var(--pe-ink-3)]">
                    {itemLabel(findItem(db, itemId)!)}
                  </span>
                )}
              </>,
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {field(
                "Quantity",
                <NumberInput
                  value={qty}
                  onValueChange={setQty}
                  min={0}
                  max={1000000}
                  className="h-12 rounded-xl text-[15px] font-semibold"
                />,
              )}
              {field(
                "Rate (₹)",
                <NumberInput
                  value={rate}
                  onValueChange={setRate}
                  min={0}
                  max={10000000}
                  className="h-12 rounded-xl text-[15px] font-semibold"
                />,
              )}
            </div>
          </>
        )}

        {type === "expense" &&
          field(
            "Category",
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {CATS.map((c) => {
                  const on = cat === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCat(c)}
                      className="text-[12.5px] font-bold"
                      style={{
                        height: 38,
                        borderRadius: 9,
                        border: `1px solid ${on ? "var(--pe-green)" : "var(--pe-line)"}`,
                        background: on ? "var(--pe-green)" : "#fff",
                        color: on ? "#fff" : "var(--pe-ink-2)",
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {cat === "Other" && (
                <Input
                  value={customCat}
                  onChange={(e) => setCustomCat(e.target.value)}
                  placeholder="Custom category"
                  maxLength={40}
                  className="h-12 rounded-xl"
                />
              )}
            </>,
          )}

        {type !== "purchase" ? (
          field(
            "Amount",
            <div
              className="flex items-center gap-2 bg-white"
              style={{
                height: 60,
                padding: "0 16px",
                borderRadius: 14,
                border: "1.5px solid var(--pe-green)",
              }}
            >
              <span className="text-[22px] font-bold text-[color:var(--pe-ink-3)]">₹</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                autoFocus
                className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[26px] font-bold text-[color:var(--pe-ink)]"
              />
            </div>,
          )
        ) : (
          <div
            className="flex justify-between text-[13.5px] text-[color:var(--pe-ink-2)]"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "#fff",
              border: "1px solid var(--pe-line)",
            }}
          >
            <span>Bill amount</span>
            <span className="font-bold text-[color:var(--pe-ink)] tabular-nums">
              {fmtINR(total)}
            </span>
          </div>
        )}

        {type === "purchase" &&
          field(
            "Payment",
            <div className="grid grid-cols-3 gap-1.5">
              <Tile
                on={status === "full"}
                label="Paid"
                sub="Full amount"
                onClick={() => setStatus("full")}
              />
              <Tile
                on={status === "partial"}
                label="Partial"
                sub="Some now"
                onClick={() => setStatus("partial")}
              />
              <Tile
                on={status === "credit"}
                label="Unpaid"
                sub="On credit"
                onClick={() => setStatus("credit")}
              />
            </div>,
          )}
        {type === "purchase" &&
          status === "partial" &&
          field("Amount paid now", <PeMoneyInput value={paid} onChange={setPaid} size="lg" />)}

        {type !== "expense" &&
          !(type === "purchase" && status === "credit") &&
          field("Paid by", <PeModePicker options={MODES} value={mode} onChange={setMode} filled />)}

        {field(
          "Date",
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-12 rounded-xl"
          />,
        )}
        {field(
          "Note (optional)",
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder={type === "expense" ? "e.g. September rent" : "e.g. Bill #1049"}
            className="h-12 rounded-xl"
          />,
        )}

        <div
          className="grid gap-1.5 text-[13.5px]"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "#fff",
            border: "1px solid var(--pe-line)",
          }}
        >
          <div className="flex justify-between text-[color:var(--pe-ink-2)]">
            <span>{summary.moneyLabel}</span>
            <span className="font-bold tabular-nums" style={{ color: "var(--pe-good)" }}>
              {fmtINR(summary.money)}
            </span>
          </div>
          <div className="flex justify-between font-bold" style={{ color: summary.color }}>
            <span>{summary.resultLabel}</span>
            <span className="tabular-nums">{fmtINR(summary.result)}</span>
          </div>
          <div className="text-[12px] text-[color:var(--pe-ink-3)]">{summary.hint}</div>
        </div>
        <PeFormError message={error} />

        <div className="hidden md:flex gap-2">
          <PeBtn variant="outline" onClick={close}>
            Cancel
          </PeBtn>
          <PeBtn onClick={submit} disabled={saving}>
            {saving ? "Saving…" : saveLabel}
          </PeBtn>
        </div>
      </div>

      {/* Mobile: fixed save bar */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white"
        style={{
          borderTop: "1px solid var(--pe-line)",
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
        }}
      >
        <PeBtn
          size="lg"
          onClick={submit}
          disabled={saving}
          className="w-full"
          style={{ borderRadius: 12 }}
        >
          {saving ? "Saving…" : saveLabel}
        </PeBtn>
      </div>
    </>
  );
}
