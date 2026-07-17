import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function db(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_event_requests",
  title: "List song requests for an event",
  description: "List song requests for a Decks event you can access, ordered by score then newest.",
  inputSchema: {
    event_id: z.string().uuid().describe("Event UUID (from list_my_events)."),
    status: z.enum(["pending", "approved", "played", "skipped", "removed"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ event_id, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = db(ctx)
      .from("song_requests")
      .select("id, title, artist, status, upvotes, downvotes, requester_name, created_at")
      .eq("event_id", event_id);
    if (status) q = q.eq("status", status);
    const { data, error } = await q
      .order("upvotes", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit ?? 30);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { requests: data ?? [] },
    };
  },
});
