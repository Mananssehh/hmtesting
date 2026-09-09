import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const eventsRow: { data: unknown } = { data: null };
const participantRow: { data: unknown } = { data: null };

function builder(result: { data: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => result;
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => builder(table === "events" ? eventsRow : participantRow),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

import { resolveEventEntry } from "./eventEntry";

const EV = {
  id: "e1",
  name: "Night",
  venue: null,
  dj_name: "DJ Pat",
  is_active: true,
  requests_status: "live" as const,
  allow_explicit: true,
  require_approval: false,
  cooldown_seconds: 30,
  rules_text: null,
};

beforeEach(() => {
  invoke.mockReset();
  eventsRow.data = null;
  participantRow.data = null;
  sessionStorage.clear();
});

describe("resolveEventEntry", () => {
  it("joins through the boundary when the event is not readable (join-by-code path)", async () => {
    invoke.mockResolvedValue({ data: { ok: true, event: EV }, error: null });
    const ev = await resolveEventEntry("abc12", "u1", "Pat");
    expect(invoke).toHaveBeenCalledWith("join-event", { body: { code: "ABC12", nickname: "Pat" } });
    expect(ev?.id).toBe("e1");
  });

  it("returns null when the join boundary denies the visitor", async () => {
    invoke.mockResolvedValue({ data: { ok: false }, error: null });
    expect(await resolveEventEntry("abc12", "u1", "Pat")).toBeNull();
  });

  it("creates participation for a guest who opens the event link directly", async () => {
    eventsRow.data = { ...EV, dj_id: "dj1" };
    participantRow.data = null;
    invoke.mockResolvedValue({ data: { ok: true, event: EV }, error: null });
    const ev = await resolveEventEntry("abc12", "guest1", "Pat");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(ev?.id).toBe("e1");
  });

  it("returns null when a direct-link guest cannot be joined", async () => {
    eventsRow.data = { ...EV, dj_id: "dj1" };
    invoke.mockResolvedValue({ data: { ok: false }, error: null });
    expect(await resolveEventEntry("abc12", "guest1", "Pat")).toBeNull();
  });

  it("does not re-join an existing participant, and never exposes dj_id", async () => {
    eventsRow.data = { ...EV, dj_id: "dj1" };
    participantRow.data = { id: "p1" };
    invoke.mockResolvedValue({ data: { ok: true, event: EV }, error: null });
    const ev = await resolveEventEntry("abc12", "guest1", "Pat");
    expect(ev).toEqual(EV);
    expect((ev as Record<string, unknown>).dj_id).toBeUndefined();
    // First visit in this session refreshes presence once...
    expect(invoke).toHaveBeenCalledTimes(1);
    invoke.mockClear();
    // ...and a second load within the throttle window does not.
    await resolveEventEntry("abc12", "guest1", "Pat");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("skips participation checks for the event owner", async () => {
    eventsRow.data = { ...EV, dj_id: "dj1" };
    const ev = await resolveEventEntry("abc12", "dj1", "DJ Pat");
    expect(ev).toEqual(EV);
    expect(invoke).not.toHaveBeenCalled();
  });
});
