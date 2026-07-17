import { supabase } from "@/integrations/supabase/client";

export type GuestFunnelEvent =
  | "guest_prompt_shown"
  | "guest_prompt_dismissed"
  | "guest_prompt_create_clicked"
  | "guest_limit_shown"
  | "guest_limit_create_clicked"
  | "guest_limit_login_clicked"
  | "guest_signup_completed";

/**
 * Fire-and-forget analytics logger for the guest -> account funnel.
 * Silently no-ops if the user isn't authenticated or the insert fails.
 */
export async function logGuestFunnel(
  eventType: GuestFunnelEvent,
  opts: { eventId?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const { data: sessRes } = await supabase.auth.getSession();
    const uid = sessRes.session?.user?.id;
    if (!uid) return;
    await supabase.from("guest_funnel_events" as any).insert({
      user_id: uid,
      event_id: opts.eventId ?? null,
      event_type: eventType,
      metadata: opts.metadata ?? {},
    });
  } catch {
    // analytics failures never break the app
  }
}
