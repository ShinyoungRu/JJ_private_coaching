import {
  type ButtonHTMLAttributes,
  createContext,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover shadow-md shadow-brand/25",
  secondary: "bg-panel text-fg border border-line-strong hover:bg-ink-deep hover:border-faint",
  outline: "border border-brand text-brand hover:bg-brand hover:text-white",
  ghost: "text-fg-2 hover:text-brand hover:bg-panel-2",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

const SIZES = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3.5 text-base" };

/** Button look for links (<a>/<Link>), so we never nest a <button> inside a link. */
export function buttonClasses(variant: Variant = "primary", size: "sm" | "md" | "lg" = "md", className?: string): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button {...rest} disabled={disabled || loading} className={buttonClasses(variant, size, className)}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-subtle" role="status">
      <Spinner /> {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout bits
// ---------------------------------------------------------------------------
export function Card({ className, children, flush }: { className?: string; children: ReactNode; flush?: boolean }) {
  return <div className={cx("rounded-2xl border border-line-soft bg-panel shadow-lg shadow-black/5 dark:shadow-none", !flush && "p-5 sm:p-6", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">{title}</h1>
        {subtitle && <div className="mt-2 max-w-3xl text-lg text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-xl font-bold text-fg">{children}</h2>
      {hint && <span className="text-sm text-subtle">{hint}</span>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-panel px-6 py-12 text-center">
      <p className="font-semibold text-fg">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type Tone = "info" | "success" | "warning" | "error";
const ALERT_TONES: Record<Tone, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  error: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
};

export function Alert({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm", ALERT_TONES[tone], className)}>
      {children}
    </div>
  );
}

const BADGE_TONES = {
  gray: "bg-panel-2 text-fg-2 ring-line",
  blue: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30",
};
export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card flush className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-subtle">{label}</div>
      <div className="mt-1.5 text-3xl font-bold text-fg">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-subtle">{hint}</div>}
    </Card>
  );
}

/** Big green check shown when a booking or payment is confirmed. */
export function SuccessMark() {
  return (
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-3xl text-success" aria-hidden="true">✓</div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
const fieldBase =
  "w-full rounded-xl border border-line-strong bg-panel px-3.5 py-2.5 text-sm text-fg placeholder:text-faint " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-ink-deep disabled:opacity-70";

export function Field({ label, hint, error, children, className }: {
  label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg-2">{label}</label>
      {children(id)}
      {hint && !error && <p className="text-xs text-subtle">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldBase, props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldBase, "pr-8", props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldBase, "min-h-24", props.className)} />;
}
export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg-2">
      <input type="checkbox" {...props} className="mt-0.5 h-4 w-4 rounded border-line-strong bg-panel accent-brand" />
      <span>{label}</span>
    </label>
  );
}

/** Segmented control / tabs */
export function Segmented<V extends string>({ value, onChange, options, className }: {
  value: V; onChange: (v: V) => void; options: Array<{ value: V; label: ReactNode }>; className?: string;
}) {
  return (
    <div className={cx("inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-panel-2 p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors sm:px-3.5",
            value === o.value ? "bg-panel text-brand shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 dark:bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          "flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-fg">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-subtle hover:bg-panel-2 hover:text-fg" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
interface ToastItem { id: number; message: string; tone: Tone }
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className={cx("animate-toast-in pointer-events-auto w-full max-w-md rounded-xl border px-4 py-3 text-sm shadow-xl", ALERT_TONES[t.tone])}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
