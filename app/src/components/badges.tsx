import type { BookingStatus, PaymentMethod, PaymentStatus } from "../lib/types";
import { Badge, type BadgeTone } from "./ui";

const STATUS: Record<BookingStatus, [string, BadgeTone]> = {
  pending_payment: ["Awaiting payment", "amber"],
  booked: ["Booked", "blue"],
  completed: ["Completed", "green"],
  no_show: ["No-show", "red"],
  cancelled: ["Cancelled", "gray"],
};

export function StatusBadge({ status, late }: { status: BookingStatus; late?: boolean }) {
  const [label, tone] = STATUS[status];
  return <Badge tone={tone}>{status === "cancelled" && late ? "Cancelled (forfeited)" : label}</Badge>;
}

export function PaymentBadge({ method, status }: { method: PaymentMethod; status: PaymentStatus }) {
  if (status === "refunded") return <Badge tone="gray">{method === "package" ? "Credit returned" : "Refunded"}</Badge>;
  if (method === "package") return <Badge tone="blue">Package credit</Badge>;
  if (method === "stripe") return status === "paid" ? <Badge tone="green">Paid by card</Badge> : <Badge tone="amber">Card: unpaid</Badge>;
  return status === "paid" ? <Badge tone="green">Paid (manual)</Badge> : <Badge tone="amber">Unpaid (cash/Venmo)</Badge>;
}
