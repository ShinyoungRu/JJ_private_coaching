import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { buttonClasses, Card, Spinner } from "../components/ui";
import { useAuth } from "../lib/auth";
import { fmtLongDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";

type State = "checking" | "confirmed" | "slow" | "missing";

/** Stripe sends parents here. The webhook (not this page) confirms payment; we just wait for it. */
export default function BookingSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const { tz } = useAuth();
  const [state, setState] = useState<State>(sessionId ? "checking" : "missing");
  const [detail, setDetail] = useState<{ start_time: string; player: string; type: string } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let tries = 0;
    let stop = false;
    const tick = async () => {
      tries++;
      const { data } = await supabase
        .from("bookings")
        .select("status, payment_status, start_time, player:players(first_name), session_type:session_types(name)")
        .eq("stripe_checkout_session_id", sessionId)
        .maybeSingle();
      if (stop) return;
      if (data && data.status === "booked" && data.payment_status === "paid") {
        setDetail({ start_time: data.start_time, player: data.player?.first_name ?? "", type: data.session_type?.name ?? "" });
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
            <Spinner className="mx-auto h-10 w-10 text-brand-soft" />
            <h1 className="mt-4 text-xl font-bold text-white">Confirming your payment...</h1>
            <p className="mt-2 text-sm text-gray-400">This usually takes a few seconds. Please don't close this page.</p>
          </>
        )}
        {state === "confirmed" && detail && (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-3xl text-emerald-300">✓</div>
            <h1 className="mt-4 text-2xl font-bold text-white">Payment received. You're booked!</h1>
            <p className="mt-2 text-gray-300">{detail.player} · {detail.type}</p>
            <p className="mt-1 font-semibold text-white">{fmtLongDateTime(detail.start_time, tz)}</p>
            <p className="mt-3 text-sm text-gray-400">A confirmation email is on its way.</p>
          </>
        )}
        {state === "slow" && (
          <>
            <h1 className="text-xl font-bold text-white">Payment received, still confirming</h1>
            <p className="mt-2 text-sm text-gray-400">Confirmation is taking longer than usual. You'll get an email as soon as it's done, and the booking will show in My Bookings.</p>
          </>
        )}
        {state === "missing" && (
          <>
            <h1 className="text-xl font-bold text-white">We couldn't find that checkout</h1>
            <p className="mt-2 text-sm text-gray-400">If you were charged, you'll receive a confirmation email shortly. Otherwise, please try booking again.</p>
          </>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/bookings" className={buttonClasses()}>My bookings</Link>
          <Link to="/book" className={buttonClasses("secondary")}>Book another</Link>
        </div>
      </Card>
    </div>
  );
}
