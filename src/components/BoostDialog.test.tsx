import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BoostDialog } from "@/components/BoostDialog";

const {
  mockRpc,
  mockRefreshProfile,
  mockAdjustProfilePoints,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockRefreshProfile: vi.fn(),
  mockAdjustProfilePoints: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { id: "u1", nickname: "Tester", points: 21, is_premium: false },
    refreshProfile: mockRefreshProfile,
    adjustProfilePoints: mockAdjustProfilePoints,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

describe("BoostDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deducts points locally and returns the latest boost total on success", async () => {
    mockRpc.mockResolvedValueOnce({ data: { boost: 10 }, error: null });
    const onBoosted = vi.fn();

    render(
      <BoostDialog
        open
        onOpenChange={() => undefined}
        songRequestId="song-1"
        songTitle="Test Song — Artist"
        onBoosted={onBoosted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Boost \+5$/ }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("boost_request", {
        _song_request_id: "song-1",
        _amount: 5,
      });
    });

    expect(mockAdjustProfilePoints).toHaveBeenCalledWith(-5);
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
    expect(onBoosted).toHaveBeenCalledWith(10);
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("blocks rapid double taps from sending duplicate boost requests", async () => {
    let resolveRpc: ((value: unknown) => void) | undefined;
    mockRpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRpc = resolve;
        }),
    );

    render(
      <BoostDialog
        open
        onOpenChange={() => undefined}
        songRequestId="song-1"
        songTitle="Test Song — Artist"
      />,
    );

    const submitButton = screen.getByRole("button", { name: /^Boost \+5$/ });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(mockRpc).toHaveBeenCalledTimes(1);

    resolveRpc?.({ data: { boost: 5 }, error: null });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });
});