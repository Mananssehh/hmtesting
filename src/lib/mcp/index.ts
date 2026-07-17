import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMyEvents from "./tools/list-my-events";
import listEventRequests from "./tools/list-event-requests";
import getNowPlaying from "./tools/get-now-playing";
import listRecentTips from "./tools/list-recent-tips";

// Direct Supabase issuer (not the .lovable.cloud proxy). Project ref is inlined
// at build time by Vite, keeping this entry import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "decks-mcp",
  title: "Decks",
  version: "0.1.0",
  instructions:
    "Tools for the Decks live-request app. Use `list_my_events` to find the DJ's events, then `list_event_requests`, `get_now_playing`, or `list_recent_tips` to inspect a specific event or earnings.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMyEvents, listEventRequests, getNowPlaying, listRecentTips],
});
