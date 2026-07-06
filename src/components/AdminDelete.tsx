import * as React from "react";
import { Trash2 } from "lucide-react";
import { useIsAdmin } from "@/lib/auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Props = {
  label: string;
  onConfirm: (reason?: string) => void | Promise<unknown>;
  className?: string;
  /** When set, the delete is blocked and this reason is shown instead. */
  blockReason?: string | null;
  /** Optional extra detail line shown above the action buttons. */
  detail?: string;
  /** Require admin to type a reason before deleting. */
  requireReason?: boolean;
  /** Label shown above the reason textarea. */
  reasonLabel?: string;
};

export function AdminDelete({ label, onConfirm, className, blockReason, detail, requireReason, reasonLabel }: Props) {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!isAdmin) return null;
  const blocked = !!blockReason;
  const trimmed = reason.trim();
  const reasonOk = !requireReason || trimmed.length >= 3;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
          }}
          aria-label={`Delete ${label}`}
          className={
            "inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 " +
            (className ?? "")
          }
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{blocked ? `Can't delete ${label}` : `Delete ${label}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? blockReason
              : (detail ?? "This permanently removes the record. Use Edit if you just want to fix wrong values — only delete if the entry never actually happened.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!blocked && requireReason && (
          <div className="grid gap-1.5">
            <Label className="text-xs">{reasonLabel ?? "Why are you deleting this?"}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Short reason (visible in the toast)"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{blocked ? "OK" : "Cancel"}</AlertDialogCancel>
          {!blocked && (
            <AlertDialogAction
              disabled={!reasonOk}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none"
              onClick={async (e) => {
                if (!reasonOk) {
                  e.preventDefault();
                  return;
                }
                try {
                  await onConfirm(requireReason ? trimmed : undefined);
                  toast.success(`${label} deleted`);
                } catch (err: any) {
                  toast.error(err?.message ?? "Delete failed");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
