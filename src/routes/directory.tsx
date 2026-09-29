import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDB,
  newId,
  nowStamp,
  today,
  fmtINR,
  fmtDate,
  usageCount,
  type Person,
  type Payment,
  type PaymentMode,
  partyBalance,
  customerLedger,
  dealerLedger,
  isValidGstin,
  totalReceivable,
  billNoLabel,
  billPayable,
} from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import {
  Plus,
  Phone,
  Pencil,
  Contact,
  MessageCircle,
  Download,
  ArrowLeft,
  ArrowDownLeft,
  FileText,
  Search,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { PhoneInput, isValidPhone } from "@/components/ui/phone-input";
import {
  PeAvatar,
  PeFormError,
  PeBtn,
  PeCard,
  PeEmpty,
  PeModePicker,
  PeMoneyInput,
  PeSegmented,
  PeTable,
  PeTHead,
  PeTRow,
  PeTitle,
} from "@/components/ui/pe";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { contactsSupported, pickContacts } from "@/lib/contacts";
import { downloadStatementPdf } from "@/lib/statementPdf";
import { MobileHeader } from "@/components/AppLayout";

type Tab = "customers" | "dealers";
type Kind = "customer" | "dealer";

export const Route = createFileRoute("/directory")({
  // ?tab=customers|dealers&party=<id> deep-links straight into a khata
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: Tab; party?: string; new?: boolean } => ({
    ...(search.tab === "customers" || search.tab === "dealers" ? { tab: search.tab } : {}),
    ...(typeof search.party === "string" && search.party ? { party: search.party } : {}),
    ...(search.new === true || search.new === "true" || search.new === "1" ? { new: true } : {}),
  }),
  head: () => ({ meta: [{ title: "Directory & khata — Shop Manager" }] }),
  component: DirectoryPage,
});

const MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];
const LEDGER_COLS = "96px minmax(0,1fr) 108px 108px 108px 36px";

function DirectoryPage() {
  const [db, set] = useDB();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [tab, setTab] = React.useState<Tab>(search.tab ?? "customers");
  const [partyId, setPartyId] = React.useState<string | null>(search.party ?? null);
  const [showDetail, setShowDetail] = React.useState(!!search.party); // mobile: list vs detail
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Person | null>(null);
  const [canImport, setCanImport] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    setCanImport(contactsSupported());
  }, []);
  // Follow deep links (Ctrl+K, dashboard) even while already on this page.
  React.useEffect(() => {
    if (search.tab) setTab(search.tab);
    if (search.party) {
      setPartyId(search.party);
      setShowDetail(true);
    }
  }, [search.tab, search.party]);
  // ?new=1 (mobile "+" menu → Add party) opens the form straight away.
  React.useEffect(() => {
    if (search.new && canWrite) {
      setEditing(null);
      setOpen(true);
      navigate({ to: "/directory", search: search.tab ? { tab: search.tab } : {}, replace: true });
    }
  }, [search.new, search.tab, canWrite, navigate]);

  const kind: Kind = tab === "dealers" ? "dealer" : "customer";
  const all = tab === "dealers" ? db.dealers : db.customers;
  const withBalance = all
    .map((p) => ({ p, balance: partyBalance(db, kind, p.id) }))
    .sort((a, b) => a.p.name.localeCompare(b.p.name));
  const ql = q.trim().toLowerCase();
  const list = ql
    ? withBalance.filter(({ p }) =>
        (p.name + " " + (p.phone ?? "") + " " + (p.address ?? "")).toLowerCase().includes(ql),
      )
    : withBalance;
  const selected = all.find((p) => p.id === partyId) ?? list[0]?.p ?? all[0] ?? null;

  const receivable = totalReceivable(db);
  const payable = db.dealers.reduce((s, d) => s + Math.max(0, partyBalance(db, "dealer", d.id)), 0);

  const pick = (id: string) => {
    setPartyId(id);
    setShowDetail(true);
    navigate({ to: "/directory", search: { tab, party: id }, replace: true });
  };
  const switchTab = (t: Tab) => {
    setTab(t);
    setPartyId(null);
    setShowDetail(false);
    setQ("");
    navigate({ to: "/directory", search: { tab: t }, replace: true });
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      const picked = await pickContacts();
      if (picked.length === 0) return;

      const digits = (s?: string) => (s ? s.replace(/\D/g, "") : "");
      const seenPhones = new Set(all.map((p) => digits(p.phone)).filter(Boolean));
      const seenNames = new Set(all.map((p) => p.name.trim().toLowerCase()));

      const toAdd: Person[] = [];
      let skipped = 0;
      for (const c of picked) {
        const phoneOk = c.phone && isValidPhone(c.phone) ? c.phone : undefined;
        const d = digits(phoneOk);
        const nameKey = c.name.trim().toLowerCase();
        const dup = (d && seenPhones.has(d)) || (!d && seenNames.has(nameKey));
        if (dup) {
          skipped++;
          continue;
        }
        if (d) seenPhones.add(d);
        seenNames.add(nameKey);
        toAdd.push({ id: newId(), name: c.name, phone: phoneOk, createdAt: nowStamp() });
      }

      if (toAdd.length > 0) {
        set((d) =>
          tab === "dealers"
            ? { ...d, dealers: [...d.dealers, ...toAdd] }
            : { ...d, customers: [...d.customers, ...toAdd] },
        );
        toast.success(`Added ${toAdd.length} ${kind}${toAdd.length === 1 ? "" : "s"}`);
      }
      if (skipped > 0) toast.info(`${skipped} already existed, skipped`);
      if (toAdd.length === 0 && skipped === 0) toast.info("Nothing to import");
    } catch {
      toast.error("Couldn't read contacts");
    } finally {
      setImporting(false);
    }
  };

  const amountColor = (b: number) =>
    b > 0 ? (kind === "dealer" ? "var(--pe-warn)" : "var(--pe-bad)") : "var(--pe-good)";
  const avatarTone = kind === "dealer" ? "info" : "green";

  return (
    <>
      {!showDetail && (
        <MobileHeader>
          <div style={{ padding: "6px 18px 16px" }}>
            <div className="flex items-center gap-2.5">
              <div className="flex-1 text-[20px] font-bold">Directory &amp; khata</div>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                  className="inline-flex items-center text-[13.5px] font-bold"
                  style={{
                    height: 36,
                    padding: "0 13px",
                    borderRadius: 10,
                    background: "var(--pe-gold)",
                    color: "var(--pe-gold-ink)",
                  }}
                >
                  + Add
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div
                style={{
                  background: "rgba(255,255,255,.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                }}
              >
                <div className="text-[11.5px]" style={{ color: "rgba(255,255,255,.65)" }}>
                  You&apos;ll receive
                </div>
                <div className="text-[18px] font-bold tabular-nums" style={{ color: "#F9B4AC" }}>
                  {fmtINR(receivable)}
                </div>
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                }}
              >
                <div className="text-[11.5px]" style={{ color: "rgba(255,255,255,.65)" }}>
                  You&apos;ll pay
                </div>
                <div
                  className="text-[18px] font-bold tabular-nums"
                  style={{ color: "var(--pe-gold)" }}
                >
                  {fmtINR(payable)}
                </div>
              </div>
            </div>
          </div>
        </MobileHeader>
      )}
      <div className="hidden md:block">
        <PeTitle
          title="Directory & khata"
          sub={
            <>
              You&apos;ll receive{" "}
              <span className="font-bold" style={{ color: "var(--pe-bad)" }}>
                {fmtINR(receivable)}
              </span>
              {" · "}you owe{" "}
              <span className="font-bold" style={{ color: "var(--pe-warn)" }}>
                {fmtINR(payable)}
              </span>
            </>
          }
          actions={
            canWrite ? (
              <>
                {canImport && (
                  <PeBtn variant="outline" onClick={handleImport} disabled={importing}>
                    <Contact className="h-4 w-4" /> Import
                  </PeBtn>
                )}
                <PeBtn
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} /> Add {kind}
                </PeBtn>
              </>
            ) : null
          }
        />
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        {/* Party list */}
        <PeCard
          pad={0}
          flat
          className={"overflow-hidden min-w-0 " + (showDetail ? "hidden md:block" : "")}
          style={{ flex: "1 1 300px" }}
        >
          <div className="p-3 grid gap-2.5">
            <PeSegmented
              grow
              value={tab}
              onChange={switchTab}
              options={[
                { value: "customers", label: `Customers (${db.customers.length})` },
                { value: "dealers", label: `Dealers (${db.dealers.length})` },
              ]}
            />
            <div
              className="flex items-center gap-2.5"
              style={{
                height: 38,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid var(--pe-line)",
                background: "var(--pe-bg-2)",
              }}
            >
              <Search className="h-4 w-4 shrink-0 text-[color:var(--pe-ink-3)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${tab}…`}
                className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[14px] text-[color:var(--pe-ink)]"
              />
            </div>
          </div>
          <div className="max-h-[70dvh] overflow-y-auto">
            {list.map(({ p, balance }) => {
              const on = selected?.id === p.id;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => pick(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pick(p.id);
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer pe-row-hover"
                  style={{
                    padding: "12px 16px",
                    borderTop: "1px solid var(--pe-line-3)",
                    background: on ? "#F4F9F7" : undefined,
                    boxShadow: on ? "inset 3px 0 0 var(--pe-green)" : "none",
                  }}
                >
                  <PeAvatar name={p.name} tone={avatarTone} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-semibold text-[color:var(--pe-ink)] truncate">
                      {p.name}
                    </div>
                    <div className="text-[12px] text-[color:var(--pe-ink-3)] truncate">
                      {p.address || p.phone || "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="text-[14px] font-bold tabular-nums"
                      style={{ color: balance === 0 ? "var(--pe-good)" : amountColor(balance) }}
                    >
                      {balance === 0 ? "Settled" : fmtINR(Math.abs(balance))}
                    </div>
                    <div className="text-[11.5px] text-[color:var(--pe-ink-3)]">
                      {balance > 0
                        ? kind === "dealer"
                          ? "to pay"
                          : "to receive"
                        : balance < 0
                          ? "advance"
                          : ""}
                    </div>
                  </div>
                </div>
              );
            })}
            {list.length === 0 && (
              <PeEmpty>{all.length === 0 ? `No ${tab} yet.` : "No match."}</PeEmpty>
            )}
          </div>
        </PeCard>

        {/* Khata detail */}
        <div
          className={"flex-col gap-3.5 min-w-0 " + (showDetail ? "flex" : "hidden md:flex")}
          style={{ flex: "999 1 480px" }}
        >
          {selected ? (
            <PartyDetail
              key={selected.id}
              person={selected}
              kind={kind}
              mobileHeader={showDetail}
              onBack={() => setShowDetail(false)}
              canWrite={canWrite}
              canEdit={canWrite && (isAdmin || (!!user && selected.createdBy === user.id))}
              onEdit={() => {
                setEditing(selected);
                setOpen(true);
              }}
              onDeleted={() => {
                setPartyId(null);
                setShowDetail(false);
              }}
            />
          ) : (
            <PeCard flat>
              <PeEmpty>Add a {kind} to start a khata.</PeEmpty>
            </PeCard>
          )}
        </div>
      </div>

      <PersonDialog open={open} onOpenChange={setOpen} kind={kind} editing={editing} />
    </>
  );
}

function PartyDetail({
  person,
  kind,
  mobileHeader,
  onBack,
  canWrite,
  canEdit,
  onEdit,
  onDeleted,
}: {
  person: Person;
  kind: Kind;
  mobileHeader: boolean;
  onBack: () => void;
  canWrite: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [db, set] = useDB();
  const payRef = React.useRef<HTMLDivElement>(null);
  const focusPay = () => {
    payRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    payRef.current?.querySelector("input")?.focus();
  };
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [mode, setMode] = React.useState<PaymentMode>("cash");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ledger = kind === "dealer" ? dealerLedger(db, person.id) : customerLedger(db, person.id);
  const balance = partyBalance(db, kind, person.id);
  let running = 0;
  const rows = ledger
    .map((e) => {
      running += e.debit - e.credit;
      return { ...e, running };
    })
    .reverse();

  const phoneDigits = (person.phone ?? "").replace(/\D/g, "");
  const waNumber = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
  const label =
    balance > 0
      ? kind === "dealer"
        ? "You owe them"
        : "They owe you"
      : balance < 0
        ? "Advance held"
        : "All settled";
  const color =
    balance > 0 ? (kind === "dealer" ? "var(--pe-warn)" : "var(--pe-bad)") : "var(--pe-good)";
  const meta = [person.address, person.phone, person.gstin ? `GSTIN ${person.gstin}` : ""]
    .filter(Boolean)
    .join(" · ");
  const usage = usageCount(db, kind, person.id);
  const deleteDetail =
    usage.total > 0
      ? kind === "dealer"
        ? `Warning: this dealer is referenced by ${usage.purchases} purchase(s). Those records will show "—" for the dealer after deletion. Continue?`
        : `Warning: this customer is referenced by ${usage.sales} sale(s)/bill(s). Those records will show "—" for the customer after deletion. Continue?`
      : undefined;

  const remind = () => {
    if (!waNumber) {
      toast.error("Add a phone number first");
      return;
    }
    const pending = db.sales.filter(
      (s) =>
        s.customerId === person.id &&
        !s.archived &&
        (s.amountPaid ?? 0) < billPayable(s) &&
        !s.paymentReceived,
    );
    const bills = pending
      .map((s) => billNoLabel(s))
      .slice(0, 5)
      .join(", ");
    const msg = `Hi ${person.name}, this is a gentle reminder that ${fmtINR(balance)} is pending${bills ? ` for bill${pending.length > 1 ? "s" : ""} ${bills}` : ""}. Thank you!`;
    window.open(
      `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const recordPayment = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return setError("Enter an amount");
    const p: Payment = {
      id: newId(),
      date,
      partyType: kind,
      partyId: person.id,
      saleId: null,
      amount: amt,
      mode,
      notes: note.trim() || undefined,
      addedBy: db.currentUser,
      createdAt: nowStamp(),
    };
    setSaving(true);
    setError(null);
    const res = await set((d) => ({ ...d, payments: [...d.payments, p] }));
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast.success(kind === "dealer" ? "Payment to dealer recorded" : "Payment received recorded");
    setAmount("");
    setNote("");
  };

  const actionBtn =
    "inline-flex items-center gap-[7px] text-[13px] font-semibold text-[color:var(--pe-ink)] pe-hover-bg";
  const actionStyle: React.CSSProperties = {
    height: 36,
    padding: "0 13px",
    borderRadius: 9,
    border: "1px solid var(--pe-line)",
    background: "var(--pe-surface)",
  };

  const heroColor = balance > 0 ? (kind === "dealer" ? "var(--pe-gold)" : "#F9B4AC") : "#86EFAC";
  const mobileAction: React.CSSProperties = {
    height: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.2)",
    fontSize: 13,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
  };

  return (
    <>
      {mobileHeader && (
        <MobileHeader>
          <div style={{ padding: "6px 16px 18px" }}>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Back"
                onClick={onBack}
                className="inline-flex items-center justify-center"
                style={{ width: 40, height: 40 }}
              >
                <ArrowLeft className="h-[22px] w-[22px]" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[17px] font-bold truncate">{person.name}</div>
                <div className="text-[11.5px] truncate" style={{ color: "rgba(255,255,255,.62)" }}>
                  {meta || "No contact details yet"}
                </div>
              </div>
            </div>
            <div className="mt-3.5" style={{ padding: "0 6px" }}>
              <div className="text-[12.5px]" style={{ color: "rgba(255,255,255,.65)" }}>
                {label}
              </div>
              <div
                className="text-[32px] font-bold tracking-[-0.02em] tabular-nums"
                style={{ color: heroColor }}
              >
                {fmtINR(Math.abs(balance))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3.5">
              {canWrite ? (
                <button
                  type="button"
                  onClick={focusPay}
                  style={{
                    ...mobileAction,
                    border: 0,
                    background: "var(--pe-gold)",
                    color: "var(--pe-gold-ink)",
                    fontWeight: 700,
                  }}
                >
                  {kind === "dealer" ? "Pay dealer" : "Get paid"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => downloadStatementPdf(db.shop, kind, person, ledger)}
                  style={{
                    ...mobileAction,
                    border: 0,
                    background: "var(--pe-gold)",
                    color: "var(--pe-gold-ink)",
                    fontWeight: 700,
                  }}
                >
                  Statement
                </button>
              )}
              {kind === "customer" && balance > 0 ? (
                <button type="button" onClick={remind} style={mobileAction}>
                  Remind
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => downloadStatementPdf(db.shop, kind, person, ledger)}
                  style={mobileAction}
                >
                  Statement
                </button>
              )}
              {person.phone ? (
                <a href={`tel:${person.phone}`} style={mobileAction}>
                  Call
                </a>
              ) : canEdit ? (
                <button type="button" onClick={onEdit} style={mobileAction}>
                  Edit
                </button>
              ) : (
                <span style={{ ...mobileAction, opacity: 0.5 }}>Call</span>
              )}
            </div>
          </div>
        </MobileHeader>
      )}

      <PeCard flat pad={22} className="hidden md:block" style={{ padding: "20px 22px" }}>
        <div className="flex items-center gap-3.5 flex-wrap">
          <PeAvatar name={person.name} tone={kind === "dealer" ? "info" : "green"} size={48} />
          <div className="flex-1 min-w-[180px]">
            <div className="text-[19px] font-bold tracking-[-0.02em] text-[color:var(--pe-ink)]">
              {person.name}
            </div>
            <div className="text-[13px] text-[color:var(--pe-ink-3)] mt-0.5">
              {meta || "No contact details yet"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[12.5px] font-semibold text-[color:var(--pe-ink-3)]">{label}</div>
            <div
              className="text-[28px] font-bold tracking-[-0.02em] tabular-nums"
              style={{ color }}
            >
              {fmtINR(Math.abs(balance))}
            </div>
          </div>
        </div>
        <div
          className="flex gap-2 flex-wrap mt-4 pt-4"
          style={{ borderTop: "1px solid var(--pe-line-2)" }}
        >
          {kind === "customer" && balance > 0 && (
            <button type="button" onClick={remind} className={actionBtn} style={actionStyle}>
              <MessageCircle className="h-[15px] w-[15px]" style={{ color: "var(--pe-good)" }} />{" "}
              Send reminder
            </button>
          )}
          {person.phone && (
            <a href={`tel:${person.phone}`} className={actionBtn} style={actionStyle}>
              <Phone className="h-[15px] w-[15px] text-[color:var(--pe-ink-2)]" /> Call
            </a>
          )}
          <button
            type="button"
            onClick={() => downloadStatementPdf(db.shop, kind, person, ledger)}
            className={actionBtn}
            style={actionStyle}
          >
            <Download className="h-[15px] w-[15px] text-[color:var(--pe-ink-2)]" /> Statement PDF
          </button>
          {canEdit && (
            <button type="button" onClick={onEdit} className={actionBtn} style={actionStyle}>
              <Pencil className="h-[15px] w-[15px] text-[color:var(--pe-ink-2)]" /> Edit
            </button>
          )}
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More"
                  className={actionBtn}
                  style={{ ...actionStyle, padding: "0 10px" }}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {person.phone && (
                  <DropdownMenuItem asChild>
                    <a href={`tel:${person.phone}`}>Call {person.phone}</a>
                  </DropdownMenuItem>
                )}
                {person.notes && <DropdownMenuItem disabled>Note: {person.notes}</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <div className="px-1 py-1">
                  <AdminDelete
                    label={kind}
                    detail={deleteDetail}
                    onConfirm={() => {
                      onDeleted();
                      return set((d) =>
                        kind === "dealer"
                          ? { ...d, dealers: d.dealers.filter((x) => x.id !== person.id) }
                          : { ...d, customers: d.customers.filter((x) => x.id !== person.id) },
                      );
                    }}
                  />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </PeCard>

      {canWrite && (
        <div ref={payRef} style={{ scrollMarginTop: 12 }}>
          <PeCard flat style={{ padding: "16px 20px" }}>
            <div className="text-[14.5px] font-bold text-[color:var(--pe-ink)] mb-3">
              {kind === "dealer" ? "Record payment to dealer" : "Record payment received"}
            </div>
            <div className="flex gap-2.5 flex-wrap items-center">
              <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                <PeMoneyInput value={amount} onChange={setAmount} placeholder="Amount" />
              </div>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-[42px] rounded-[10px]"
                style={{ flex: "0 1 150px" }}
              />
              <div style={{ flex: "1 1 260px" }}>
                <PeModePicker options={MODES} value={mode} onChange={setMode} />
              </div>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                maxLength={120}
                className="h-[42px] rounded-[10px]"
                style={{ flex: "1 1 160px" }}
              />
              <PeBtn
                onClick={recordPayment}
                disabled={saving}
                style={{ height: 42, padding: "0 18px" }}
              >
                {saving ? "Saving…" : "Record"}
              </PeBtn>
            </div>
            <PeFormError message={error} />
          </PeCard>
        </div>
      )}

      {/* Mobile: ledger as cards (design: 05 Party ledger) */}
      <div className="md:hidden grid gap-2">
        <div className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--pe-ink-3)]">
          Entries
        </div>
        {rows.map((e) => {
          const debit = e.debit > 0;
          return (
            <div
              key={`m-${e.kind}-${e.id}`}
              className="bg-white flex items-center gap-2.5"
              style={{ border: "1px solid var(--pe-line)", borderRadius: 12, padding: "11px 14px" }}
            >
              <span
                className="inline-flex items-center justify-center shrink-0"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: debit ? "var(--pe-bad-bg)" : "var(--pe-good-bg)",
                  color: debit ? "var(--pe-bad)" : "var(--pe-good)",
                }}
              >
                {debit ? <FileText className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-[color:var(--pe-ink)] truncate">
                  {e.label}
                </div>
                <div className="text-[12px] text-[color:var(--pe-ink-3)] truncate">
                  {fmtDate(e.date)}
                  {e.payment?.mode ? ` · ${e.payment.mode.toUpperCase()}` : ""}
                  {e.payment?.notes ? ` · ${e.payment.notes}` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className="text-[14.5px] font-bold tabular-nums"
                  style={{ color: debit ? "var(--pe-bad)" : "var(--pe-good)" }}
                >
                  {debit ? `+ ${fmtINR(e.debit)}` : `− ${fmtINR(e.credit)}`}
                </div>
                <div className="text-[11px] text-[color:var(--pe-ink-3)] tabular-nums">
                  bal {fmtINR(e.running)}
                </div>
              </div>
              {canWrite && e.kind === "payment" && !e.payment?.saleId && (
                <AdminDelete
                  label="payment entry"
                  onConfirm={() =>
                    set((d) => ({ ...d, payments: d.payments.filter((x) => x.id !== e.id) }))
                  }
                />
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <PeEmpty pad={20}>No entries yet — bills and payments will show up here.</PeEmpty>
        )}
      </div>

      <PeCard pad={0} flat className="overflow-hidden hidden md:block">
        <PeTable minWidth={580}>
          <PeTHead template={LEDGER_COLS}>
            <span>Date</span>
            <span>Entry</span>
            <span className="text-right">{kind === "dealer" ? "Purchase" : "Bill"}</span>
            <span className="text-right">Paid</span>
            <span className="text-right">Balance</span>
            <span />
          </PeTHead>
          {rows.map((e) => (
            <PeTRow key={`${e.kind}-${e.id}`} template={LEDGER_COLS}>
              <span className="text-[color:var(--pe-ink-3)] text-[13px]">{fmtDate(e.date)}</span>
              <span className="min-w-0 truncate font-semibold text-[color:var(--pe-ink)]">
                {e.label}
                {e.payment?.mode && (
                  <span className="ml-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[color:var(--pe-ink-3)]">
                    {e.payment.mode}
                  </span>
                )}
                {e.payment?.notes && (
                  <span className="ml-1.5 text-[12px] font-normal text-[color:var(--pe-ink-3)]">
                    · {e.payment.notes}
                  </span>
                )}
              </span>
              <span
                className="text-right font-bold tabular-nums"
                style={{ color: "var(--pe-bad)" }}
              >
                {e.debit ? fmtINR(e.debit) : ""}
              </span>
              <span
                className="text-right font-bold tabular-nums"
                style={{ color: "var(--pe-good)" }}
              >
                {e.credit ? fmtINR(e.credit) : ""}
              </span>
              <span className="text-right font-semibold tabular-nums text-[color:var(--pe-ink-2)]">
                {fmtINR(e.running)}
              </span>
              <span className="flex justify-end">
                {canWrite && e.kind === "payment" && !e.payment?.saleId && (
                  <AdminDelete
                    label="payment entry"
                    onConfirm={() =>
                      set((d) => ({ ...d, payments: d.payments.filter((x) => x.id !== e.id) }))
                    }
                  />
                )}
              </span>
            </PeTRow>
          ))}
        </PeTable>
        {rows.length === 0 && (
          <PeEmpty>No entries yet — bills and payments will show up here.</PeEmpty>
        )}
      </PeCard>
    </>
  );
}

function PersonDialog({
  open,
  onOpenChange,
  kind,
  editing,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  kind: "dealer" | "customer";
  editing: Person | null;
}) {
  const [, set] = useDB();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [gstin, setGstin] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [opening, setOpening] = React.useState("0");
  const [openingAdvance, setOpeningAdvance] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSaving(false);
      setError(null);
      setName(editing?.name ?? "");
      setPhone(editing?.phone ?? "");
      setAddress(editing?.address ?? "");
      setGstin(editing?.gstin ?? "");
      setNotes(editing?.notes ?? "");
      const ob = editing?.openingBalance ?? 0;
      setOpening(String(Math.abs(ob)));
      setOpeningAdvance(ob < 0);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim()) return setError("Name required");
    if (name.trim().length > 80) return setError("Name too long");
    if (!isValidPhone(phone.trim())) return setError("Enter a valid phone (7–15 digits)");
    const g = gstin.trim().toUpperCase();
    if (g && !isValidGstin(g))
      return setError("GSTIN must be 15 characters starting with a 2-digit state code");
    const ob = (openingAdvance ? -1 : 1) * Math.max(0, Number(opening) || 0);
    setSaving(true);
    setError(null);
    let res;
    if (editing) {
      const patch = {
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        gstin: g || undefined,
        notes: notes.trim() || undefined,
        openingBalance: ob,
      };
      res = await set((d) =>
        kind === "dealer"
          ? { ...d, dealers: d.dealers.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) }
          : {
              ...d,
              customers: d.customers.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)),
            },
      );
    } else {
      const p: Person = {
        id: newId(),
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        gstin: g || undefined,
        notes: notes.trim() || undefined,
        openingBalance: ob,
        createdAt: nowStamp(),
      };
      res = await set((d) =>
        kind === "dealer"
          ? { ...d, dealers: [...d.dealers, p] }
          : { ...d, customers: [...d.customers, p] },
      );
    }
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast.success(editing ? "Updated" : "Added");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${kind}` : `Add ${kind}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={80}
              className="h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Phone</Label>
            <PhoneInput
              value={phone}
              onValueChange={setPhone}
              className="h-11"
              placeholder="e.g. +91 98765 43210"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={200}
              className="h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>GSTIN (optional)</Label>
            <Input
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              maxLength={15}
              placeholder="e.g. 27ABCDE1234F1Z5"
              className="h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
              className="h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Opening balance (₹)</Label>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput value={opening} onValueChange={setOpening} className="h-11" />
              <Select
                value={openingAdvance ? "advance" : "due"}
                onValueChange={(v) => setOpeningAdvance(v === "advance")}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due">
                    {kind === "dealer" ? "You owe them" : "They owe you"}
                  </SelectItem>
                  <SelectItem value="advance">Advance held</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Old dues from before you started using the app. Shows as the first khata entry.
            </p>
          </div>
        </div>
        <PeFormError message={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
