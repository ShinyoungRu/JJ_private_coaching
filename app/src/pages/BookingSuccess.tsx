import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AddToCalendar } from "../components/AddToCalendar";
import { LocationLine } from "../components/LocationLine";
import { placeFromSettings } from "../lib/location";
import { buttonClasses, Card, Spinner, SuccessMark } from "../components/ui";
import { useAuth } from "../lib/auth";
import { fmtLongDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";

type State = "checking" | "confirmed" | "slow" | "missing";

/** Stripe sends parents here. The webhook (not this page) confirms payment; we just wait for it. */
export default function BookingSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const { tz, settings } = useAuth();
  const [state, setState] = useState<State>(sessionId ? "checking" : "missing");
  const [detail, setDetail] = useState<{ id: string; start_time: string; end_time: string; player: string; type: string } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let tries = 0;
    let stop = false;
    const tick = async () => {
      tries++;
      const { data } = await supabase
        .from("bookings")
        .select("id, status, payment_status, start_time, end_time, player:players(first_name), session_type:session_types(name)")
        .eq("stripe_checkout_session_id", sessionId)
        .maybeSingle();
      if (stop) return;
      if (data && data.status === "booked" && data.payment_status === "paid") {
        setDetail({
          id: data.id, start_time: data.start_time, end_time: data.end_time,
          player: data.player?.first_name ?? "", type: data.session_type?.name ?? "",
        });
        setState("confirmed");
        return;
      }
      if (tries >= 20) setState(data ? "slow" : "missing");
      else setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; };
  }, [sessionId]);

  return (
    <div className="mx-auto max-w-xl">
      <Card className="p-6 text-center sm:p-8">
        {state === "checking" && (
          <>
            <Spinner className="mx-auto h-10 w-10 text-brand" />
            <h1 className="mt-4 text-xl font-bold text-fg">Confirming your payment...</h1>
            <p className="mt-2 text-sm text-muted">This usually takes a few seconds. Please don't close this page.</p>
          </>
        )}
        {state === "confirmed" && detail && (
          <>
            <SuccessMark />
            <h1 className="mt-4 text-2xl font-bold text-fg">Payment received. You're booked!</h1>
            <p className="mt-2 text-fg-2">{detail.player} · {detail.type}</p>
            <p className="mt-1 font-semibold text-fg">{fmtLongDateTime(detail.start_time, tz)}</p>
            <LocationLine place={placeFromSettings(settings)} className="mt-2 justify-center" />
            <p className="mt-3 text-sm text-muted">A confirmation email is on its way.</p>
          </>
        )}
        {state === "slow" && (
          <>
            <h1 className="text-xl font-bold text-fg">Payment received, still confirming</h1>
            <p className="mt-2 text-sm text-muted">Confirmation is taking longer than usual. You'll get an email as soon as it's done, and the booking will show in My Bookings.</p>
          </>
        )}
        {state === "missing" && (
          <>
            <h1 className="text-xl font-bold text-fg">We couldn't find that checkout</h1>
            <p className="mt-2 text-sm text-muted">If you were charged, you'll receive a confirmation email shortly. Otherwise, please try booking again.</p>
          </>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {state === "confirmed" && detail && (
            <AddToCalendar booking={detail} sessionName={detail.type} playerName={detail.player} tz={tz} />
          )}
          <Link to="/bookings" className={buttonClasses()}>My bookings</Link>
          <Link to="/book" className={buttonClasses("secondary")}>Book another</Link>
        </div>
      </Card>
    </div>
  );
}
