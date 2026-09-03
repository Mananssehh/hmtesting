import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const authState = {
  user: null as { id: string } | null,
  isDJ: false,
  loading: false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/AppHeader", () => ({ AppHeader: () => <div /> }));

const queryResult = { data: null as unknown, error: null as unknown };

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: chain,
    maybeSingle: () => Promise.resolve(queryResult),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(queryResult).then(resolve),
  });
  return { supabase: { from: () => builder } };
});

import { RequireAdmin, RequireAuth, RequireDJ, RequireEventOwner } from "./RouteGuards";

function renderGuard(guard: React.ReactNode, initial = "/dj/e1") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/dj/:id" element={guard} />
        <Route path="/dj" element={<div>dj dashboard</div>} />
        <Route path="/dj/onboarding" element={<div>onboarding</div>} />
        <Route path="/auth" element={<div>auth page</div>} />
        <Route path="/" element={<div>landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const Secret = () => <div>SECRET CONTENT</div>;

beforeEach(() => {
  authState.user = null;
  authState.isDJ = false;
  authState.loading = false;
  queryResult.data = null;
  queryResult.error = null;
});

describe("RequireAuth", () => {
  it("shows only a neutral loading screen while auth loads", () => {
    authState.loading = true;
    renderGuard(<RequireAuth><Secret /></RequireAuth>);
    expect(screen.queryByText("SECRET CONTENT")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("redirects signed-out users", () => {
    renderGuard(<RequireAuth><Secret /></RequireAuth>);
    expect(screen.getByText("auth page")).toBeTruthy();
  });

  it("allows signed-in non-DJ users (onboarding access)", () => {
    authState.user = { id: "u1" };
    renderGuard(<RequireAuth><Secret /></RequireAuth>);
    expect(screen.getByText("SECRET CONTENT")).toBeTruthy();
  });
});

describe("RequireDJ", () => {
  it("denies guests", () => {
    authState.user = { id: "guest" };
    renderGuard(<RequireDJ><Secret /></RequireDJ>);
    expect(screen.queryByText("SECRET CONTENT")).toBeNull();
    expect(screen.getByText("onboarding")).toBeTruthy();
  });

  it("allows DJs", () => {
    authState.user = { id: "dj" };
    authState.isDJ = true;
    renderGuard(<RequireDJ><Secret /></RequireDJ>);
    expect(screen.getByText("SECRET CONTENT")).toBeTruthy();
  });
});

describe("RequireEventOwner", () => {
  it("never renders content for a non-owner DJ", async () => {
    authState.user = { id: "djB" };
    authState.isDJ = true;
    queryResult.data = null; // ownership row not visible
    renderGuard(<RequireEventOwner><Secret /></RequireEventOwner>);
    expect(screen.queryByText("SECRET CONTENT")).toBeNull();
    await waitFor(() => expect(screen.getByText("dj dashboard")).toBeTruthy());
    expect(screen.queryByText("SECRET CONTENT")).toBeNull();
  });

  it("denies when the ownership lookup errors", async () => {
    authState.user = { id: "djA" };
    authState.isDJ = true;
    queryResult.data = { id: "e1" };
    queryResult.error = { message: "boom" };
    renderGuard(<RequireEventOwner><Secret /></RequireEventOwner>);
    await waitFor(() => expect(screen.getByText("dj dashboard")).toBeTruthy());
  });

  it("allows the owning DJ", async () => {
    authState.user = { id: "djA" };
    authState.isDJ = true;
    queryResult.data = { id: "e1" };
    renderGuard(<RequireEventOwner><Secret /></RequireEventOwner>);
    await waitFor(() => expect(screen.getByText("SECRET CONTENT")).toBeTruthy());
  });
});

describe("RequireAdmin", () => {
  it("fails closed when no admin role rows exist", async () => {
    authState.user = { id: "dj" };
    authState.isDJ = true;
    queryResult.data = [];
    renderGuard(<RequireAdmin><Secret /></RequireAdmin>);
    expect(screen.queryByText("SECRET CONTENT")).toBeNull();
    await waitFor(() => expect(screen.getByText("landing")).toBeTruthy());
  });

  it("allows a user holding the admin role", async () => {
    authState.user = { id: "admin" };
    queryResult.data = [{ role: "admin" }];
    renderGuard(<RequireAdmin><Secret /></RequireAdmin>);
    await waitFor(() => expect(screen.getByText("SECRET CONTENT")).toBeTruthy());
  });
});
