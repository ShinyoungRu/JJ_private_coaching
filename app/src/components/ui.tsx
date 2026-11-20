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
  primary: "bg-brand text-white hover:bg-brand-hover shadow-sm shadow-brand/20",
  secondary: "bg-panel-2 text-gray-100 hover:bg-[#333] border border-line",
  outline: "border border-brand text-brand-soft hover:bg-brand hover:text-white",
  ghost: "text-gray-300 hover:text-white hover:bg-white/5",
  danger: "bg-red-600/90 text-white hover:bg-red-600",
};

const SIZES = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3.5 text-base" };

/** Button look for links (<a>/<Link>), so we never nest a <button> inside a link. */
export function buttonClasses(variant: Variant = "primary", size: "sm" | "md" | "lg" = "md", className?: string): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-soft",
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
    <div className="flex items-center gap-3 py-10 text-gray-400" role="status">
      <Spinner /> {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout bits
// ---------------------------------------------------------------------------
export function Card({ className, children, flush }: { className?: string; children: ReactNode; flush?: boolean }) {
  return <div className={cx("rounded-2xl border border-line bg-panel", !flush && "p-5 sm:p-6", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-gray-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold text-white">{children}</h2>
      {hint && <span className="text-sm text-gray-400">{hint}</span>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold text-gray-200">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-gray-400">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type Tone = "info" | "success" | "warning" | "error";
const ALERT_TONES: Record<Tone, string> = {
  info: "border-brand/40 bg-brand/10 text-blue-100",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  error: "border-red-500/40 bg-red-500/10 text-red-100",
};

export function Alert({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm", ALERT_TONES[tone], className)}>
      {children}
    </div>
  );
}

const BADGE_TONES = {
  gray: "bg-white/5 text-gray-300 ring-white/10",
  blue: "bg-brand/15 text-brand-soft ring-brand/30",
  green: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  red: "bg-red-500/15 text-red-300 ring-red-500/30",
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
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1.5 text-2xl font-bold text-white">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
const fieldBase =
  "w-full rounded-lg border border-line bg-ink-deep px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60";

export function Field({ label, hint, error, children, className }: {
  label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-200">{label}</label>
      {children(id)}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
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
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-200">
      <input type="checkbox" {...props} className="mt-0.5 h-4 w-4 rounded border-line bg-ink-deep accent-brand" />
      <span>{label}</span>
    </label>
  );
}

/** Segmented control / tabs */
export function Segmented<V extends string>({ value, onChange, options, className }: {
  value: V; onChange: (v: V) => void; options: Array<{ value: V; label: ReactNode }>; className?: string;
}) {
  return (
    <div className={cx("inline-flex flex-wrap rounded-xl border border-line bg-ink-deep p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
            value === o.value ? "bg-panel-2 text-white shadow" : "text-gray-400 hover:text-gray-200",
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
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
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white" aria-label="Close">
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
          <div key={t.id} className={cx("animate-toast-in pointer-events-auto w-full max-w-md rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur", ALERT_TONES[t.tone], "bg-panel/95")}>
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
