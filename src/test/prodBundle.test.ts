import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

/**
 * D4 evidence: the production bundle must not contain developer tooling.
 * Skipped when dist/ has not been built in this environment.
 */
const distDir = path.resolve(__dirname, "../../dist/assets");
const hasBuild = existsSync(distDir);

describe.skipIf(!hasBuild)("production bundle", () => {
  const bundle = readdirSync(distDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(path.join(distDir, f), "utf8"))
    .join("\n");

  it.each([
    "DJDevTools",
    "IngestTestPanel",
    "BridgeMonitor",
    "smoke_test",
    "test_ingest",
    "Bridge & ingest debug",
    "now-playing-ingest",
  ])("contains no developer tooling reference: %s", (needle) => {
    expect(bundle.includes(needle)).toBe(false);
  });

  it("contains no /dj/:id/dev route path", () => {
    expect(bundle.includes("/dj/:id/dev")).toBe(false);
  });
});

describe("development build", () => {
  it("keeps the developer route module available in source", () => {
    expect(existsSync(path.resolve(__dirname, "../dev/DJDevTools.tsx"))).toBe(true);
    expect(existsSync(path.resolve(__dirname, "../dev/DevRoutes.tsx"))).toBe(true);
  });

  it("registers the dev route only behind import.meta.env.DEV", () => {
    const app = readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
    expect(app).toContain('import.meta.env.DEV ? lazy(() => import("./dev/DevRoutes")) : null');
    expect(app).not.toMatch(/^import DJDevTools/m);
  });
});
