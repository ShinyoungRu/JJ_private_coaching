import { useMemo, useState } from "react";
import { unwrap } from "../lib/api";
import { addDays, daysBetween, dateKey, fmtDay, fmtTime, todayKey, tzAbbrev } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Slot } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import { Alert, Button, cx, Spinner } from "./ui";

const DAYS_PER_PAGE = 7;

/**
 * Week-at-a-time calendar of open slots for one session type.
 * Times are always shown in the coach's time zone.
 */
export function SlotPicker({ sessionTypeId, tz, maxDaysAhead = 60, selected, onSelect, refreshKey = 0 }: {
  sessionTypeId: string;
  tz: string;
  maxDaysAhead?: number;
  selected?: string | null;
  onSelect: (slot: Slot) => void;
  refreshKey?: number;
}) {
  const today = todayKey(tz);
  const [from, setFrom] = useState(today);
  const to = addDays(from, DAYS_PER_PAGE - 1);

  const { data: slots, loading, error } = useLoad(
    async () => unwrap(await supabase.rpc("get_available_slots", { p_session_type_id: sessionTypeId, p_from: from, p_to: to })),
    [sessionTypeId, from, refreshKey],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (let i = 0; i < DAYS_PER_PAGE; i++) map.set(addDays(from, i), []);
    (slots ?? []).forEach((s) => map.get(dateKey(s.slot_start, tz))?.push(s));
    return [...map.entries()];
  }, [slots, from, tz]);

  const canPrev = from > today;
  const canNext = daysBetween(today, addDays(from, DAYS_PER_PAGE)) < maxDaysAhead;
  const total = slots?.length ?? 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" disabled={!canPrev} onClick={() => setFrom(addDays(from, -DAYS_PER_PAGE) < today ? today : addDays(from, -DAYS_PER_PAGE))} aria-label="Previous week">
          ← Prev
        </Button>
        <div className="text-center text-sm font-semibold text-fg-2">
          {fmtDay(from, { month: "short", day: "numeric" })} – {fmtDay(to, { month: "short", day: "numeric" })}
          <div className="text-xs font-normal text-subtle">Times in {tzAbbrev(tz)}</div>
        </div>
        <Button variant="secondary" size="sm" disabled={!canNext} onClick={() => setFrom(addDays(from, DAYS_PER_PAGE))} aria-label="Next week">
          Next →
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && !slots && <div className="flex justify-center py-10 text-muted"><Spinner /></div>}

      {slots && (
        <div className={cx("space-y-2 transition-opacity", loading && "opacity-50")}>
          {byDay.map(([day, list]) => (
            <div key={day} className="flex flex-col gap-2 rounded-xl border border-line bg-ink-deep/60 p-3 sm:flex-row sm:items-start">
              <div className="w-28 shrink-0 pt-1.5">
                <div className="text-sm font-semibold text-fg">{fmtDay(day, { weekday: "long" })}</div>
                <div className="text-xs text-subtle">{fmtDay(day, { month: "short", day: "numeric" })}</div>
              </div>
              {list.length === 0 ? (
                <div className="pt-1.5 text-sm text-muted">No open times</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {list.map((s) => {
                    const isSel = selected === s.slot_start;
                    return (
                      <button
                        key={s.slot_start}
                        type="button"
                        onClick={() => onSelect(s)}
                        aria-pressed={isSel}
                        className={cx(
                          "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                          isSel
                            ? "border-brand bg-brand text-white"
                            : "border-line bg-panel text-fg hover:border-brand-soft hover:text-brand",
                        )}
                      >
                        {fmtTime(s.slot_start, tz)}
                        {s.capacity > 1 && (
                          <span className={cx("ml-1.5 text-xs font-medium", isSel ? "text-blue-100" : "text-muted")}>
                            {s.spots_left} left
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {total === 0 && !loading && (
            <p className="pt-2 text-center text-sm text-muted">
              Nothing open this week.{canNext && <> <button className="font-semibold text-brand hover:underline" onClick={() => setFrom(addDays(from, DAYS_PER_PAGE))}>Check next week →</button></>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
