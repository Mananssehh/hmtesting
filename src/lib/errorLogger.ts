import { supabase } from "@/integrations/supabase/client";

export type ErrorSeverity = "critical" | "warning" | "info";

interface LogErrorInput {
  severity: ErrorSeverity;
  source: string;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
}

const recent = new Map<string, number>();
const DEDUP_MS = 5000;

export async function logError({ severity, source, message, context, stack }: LogErrorInput) {
  try {
    // Dedupe identical errors within 5s
    const key = `${severity}|${source}|${message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUP_MS) return;
    recent.set(key, now);

    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    // Anonymous users cannot insert error logs (RLS), drop silently.
    if (!user) return;

    await supabase.from("error_logs").insert({
      severity,
      source,
      message: message.slice(0, 2000),
      context: context ? (context as never) : null,
      stack: stack?.slice(0, 5000) ?? null,
      user_id: user?.id ?? null,
      route: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
  } catch {
    // Never let logging crash the app
  }
}

/** Log a non-critical issue silently (failed API, RLS denial, validation, etc.). */
export const logWarning = (source: string, message: string, context?: Record<string, unknown>) =>
  logError({ severity: "warning", source, message, context });

/** Log a critical DJ-flow breaking error — surfaced as alert in admin view. */
export const logCritical = (source: string, message: string, context?: Record<string, unknown>, stack?: string) =>
  logError({ severity: "critical", source, message, context, stack });

export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => {
    logError({
      severity: "critical",
      source: "window.error",
      message: e.message || "Uncaught error",
      stack: e.error?.stack,
      context: { filename: e.filename, lineno: e.lineno, colno: e.colno },
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    logError({
      severity: "critical",
      source: "unhandledrejection",
      message: typeof reason === "string" ? reason : reason?.message || "Unhandled promise rejection",
      stack: reason?.stack,
    });
  });
}
