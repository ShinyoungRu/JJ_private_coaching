import { useState } from "react";
import { Alert, Badge, Button, Card, Empty, Loading, PageHeader, Segmented, useToast } from "../../components/ui";
import { errorMessage, unwrap } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDateTime } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { Inquiry, InquiryStatus } from "../../lib/types";
import { useLoad } from "../../lib/useLoad";

const TONE = { new: "amber", replied: "blue", closed: "gray" } as const;

export default function Inquiries() {
  const { tz } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<InquiryStatus | "all">("new");
  const inquiries = useLoad(async () => {
    let q = supabase.from("inquiries").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    return unwrap(await q);
  }, [filter]);

  async function setStatus(i: Inquiry, status: InquiryStatus) {
    try {
      unwrap(await supabase.from("inquiries").update({ status }).eq("id", i.id).select().single());
      inquiries.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      <PageHeader title="Website inquiries" subtitle="Messages from the contact form on jjprivatetraining.com." />
      <Segmented className="mb-5" value={filter} onChange={setFilter}
        options={[{ value: "new", label: "New" }, { value: "replied", label: "Replied" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]} />
      {inquiries.loading ? <Loading /> : inquiries.error ? <Alert tone="error">{inquiries.error}</Alert> : (inquiries.data ?? []).length === 0 ? (
        <Empty title={filter === "new" ? "You're all caught up" : "Nothing here"} />
      ) : (
        <div className="space-y-3">
          {inquiries.data!.map((i) => (
            <Card key={i.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-fg">{i.name}</h2>
                    <Badge tone={TONE[i.status]}>{i.status}</Badge>
                  </div>
                  <div className="text-sm text-muted">
                    <a className="hover:text-brand" href={`mailto:${i.email}`}>{i.email}</a>
                    {i.phone && <> · <a className="hover:text-brand" href={`tel:${i.phone}`}>{i.phone}</a></>}
                    <span className="text-subtle"> · {fmtDateTime(i.created_at, tz)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`mailto:${i.email}?subject=${encodeURIComponent("Re: your message to JJ Private Training")}`}
                    onClick={() => i.status === "new" && setStatus(i, "replied")}
                    className="inline-flex items-center rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover"
                  >
                    Reply
                  </a>
                  {i.status !== "closed"
                    ? <Button size="sm" variant="ghost" onClick={() => setStatus(i, "closed")}>Close</Button>
                    : <Button size="sm" variant="ghost" onClick={() => setStatus(i, "new")}>Reopen</Button>}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-fg-2">{i.message}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
