import DJDevTools from "./DJDevTools";

/**
 * Development-only screens. This module is reached exclusively through a
 * dynamic import that is dead-code eliminated in production builds
 * (`import.meta.env.DEV` is statically false there), so neither this file nor
 * the developer tooling it pulls in ships to production.
 */
export default function DevRoutes() {
  return <DJDevTools />;
}
