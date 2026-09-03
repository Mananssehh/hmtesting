import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
const logWarning = vi.fn();
vi.mock("@/lib/errorLogger", () => ({ logWarning: (...a: unknown[]) => logWarning(...a) }));

import { fetchNicknames, fetchMyProfile } from "./publicProfiles";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  rpc.mockReset();
  logWarning.mockReset();
});

describe("fetchNicknames", () => {
  it("returns an empty map and makes no request for empty input", async () => {
    expect(await fetchNicknames([], "test")).toEqual({});
    expect(await fetchNicknames([null, undefined], "test")).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it("dedupes ids and issues a single batched request", async () => {
    rpc.mockResolvedValue({ data: [{ id: A, nickname: "Pat" }, { id: B, nickname: "Pru" }], error: null });
    const map = await fetchNicknames([A, A, B, null], "test");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_public_nicknames", { _user_ids: [A, B] });
    expect(map).toEqual({ [A]: "Pat", [B]: "Pru" });
  });

  it("chunks input above 500 ids instead of failing", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const ids = Array.from({ length: 501 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    await fetchNicknames(ids, "test");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect((rpc.mock.calls[0][1] as { _user_ids: string[] })._user_ids).toHaveLength(500);
    expect((rpc.mock.calls[1][1] as { _user_ids: string[] })._user_ids).toHaveLength(1);
  });

  it("falls back to an empty map and logs a sanitized error on RPC failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: `no row for ${A}`, code: "42501" } });
    expect(await fetchNicknames([A], "Earnings")).toEqual({});
    expect(logWarning).toHaveBeenCalledWith("Earnings", "get_public_nicknames failed", { code: "42501", count: 1 });
    expect(JSON.stringify(logWarning.mock.calls)).not.toContain(A);
  });
});

describe("fetchMyProfile", () => {
  it("returns the owner profile payload", async () => {
    rpc.mockResolvedValue({ data: { id: A, nickname: "Pat", points: 42, is_premium: false, is_public: true }, error: null });
    const p = await fetchMyProfile("Profile");
    expect(rpc).toHaveBeenCalledWith("get_my_profile");
    expect(p?.points).toBe(42);
  });

  it("returns null and logs sanitized on failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom", code: "P0001" } });
    expect(await fetchMyProfile("Profile")).toBeNull();
    expect(logWarning).toHaveBeenCalledWith("Profile", "get_my_profile failed", { code: "P0001" });
  });
});
