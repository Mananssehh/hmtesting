import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Shield, Flag, Trash2, ChevronDown, ChevronRight, User, Music, Copy, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Status = "open" | "reviewing" | "resolved" | "dismissed";
type TargetType = "request" | "user" | "nickname";

interface Report {
  id: string;
  reporter_id: string;
  target_type: TargetType;
  target_id: string;
  reason: string;
  details: string | null;
  status: Status;
  created_at: string;
}

interface SongInfo {
  id: string;
  title: string;
  artist: string | null;
  requested_by: string | null;
  requester_nickname?: string | null;
}

interface Props {
  eventId: string;
  onRemoveRequest?: (songRequestId: string) => Promise<void> | void;
}

const REASON_LABELS: Record<string, string> = {
  inappropriate: "Inappropriate content",
  harassment: "Harassment",
  spam: "Spam",
  copyright: "Copyright",
  other: "Other",
};

export function DJReportsPanel({ eventId, onRemoveRequest }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [songs, setSongs] = useState<Record<string, SongInfo>>({});
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("reports")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data ?? []) as Report[];
    setReports(rows);

    // Collect user IDs (reporters + user/nickname targets) and song request IDs
    const userIds = new Set<string>();
    const requestIds = new Set<string>();
    for (const r of rows) {
      if (r.reporter_id) userIds.add(r.reporter_id);
      if (r.target_type === "user" || r.target_type === "nickname") userIds.add(r.target_id);
      if (r.target_type === "request") requestIds.add(r.target_id);
    }

    // Fetch song requests for reported songs
    const songMap: Record<string, SongInfo> = {};
    if (requestIds.size > 0) {
      const { data: srData } = await (supabase as any)
        .from("song_requests")
        .select("id, title, artist, requested_by")
        .in("id", Array.from(requestIds));
      for (const s of (srData ?? []) as SongInfo[]) {
        songMap[s.id] = s;
        if (s.requested_by) userIds.add(s.requested_by);
      }
    }

    // Fetch nicknames for all collected user IDs
    const nickMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: profData } = await (supabase as any)
        .from("profiles")
        .select("id, nickname")
        .in("id", Array.from(userIds));
      for (const p of (profData ?? []) as { id: string; nickname: string }[]) {
        nickMap[p.id] = p.nickname;
      }
    }

    // Attach requester nicknames to songs
    for (const id of Object.keys(songMap)) {
      const s = songMap[id];
      if (s.requested_by) s.requester_nickname = nickMap[s.requested_by] ?? null;
    }

    setNicknames(nickMap);
    setSongs(songMap);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(); }, 5000);
    return () => { clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await (supabase as any).from("reports").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Report updated");
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const open = reports.filter((r) => r.status === "open" || r.status === "reviewing");
  const closed = reports.filter((r) => r.status === "resolved" || r.status === "dismissed");
  const visible = showResolved ? reports : open;

  const renderTargetSummary = (r: Report) => {
    if (r.target_type === "request") {
      const s = songs[r.target_id];
      if (!s) return <span className="text-muted-foreground italic">Song deleted</span>;
      return (
        <div className="flex items-start gap-2">
          <Music className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{s.title}</div>
            {s.artist && <div className="text-xs text-muted-foreground truncate">{s.artist}</div>}
            {s.requester_nickname && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Requested by <span className="font-medium text-foreground/90">{s.requester_nickname}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    const nick = nicknames[r.target_id] ?? "Unknown";
    return (
      <div className="flex items-start gap-2">
        <User className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            {r.target_type === "nickname" ? `"${nick}"` : nick}
          </div>
          <div className="text-xs text-muted-foreground">
            {r.target_type === "nickname" ? "Nickname report" : "User report"}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> Reports
          {open.length > 0 && (
            <Badge className="bg-destructive/20 text-destructive border-destructive/40">
              {open.length} open
            </Badge>
          )}
        </CardTitle>
        {closed.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "Hide resolved" : `Show all (${reports.length})`}
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0 divide-y">
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <p className="px-6 py-6 text-center text-sm text-muted-foreground">
            No open reports. Guests can flag requests, nicknames, or users from the event page.
          </p>
        ) : (
          visible.map((r) => {
            const isOpen = !!expanded[r.id];
            const reporterNick = nicknames[r.reporter_id] ?? "Unknown";
            const reasonLabel = REASON_LABELS[r.reason] ?? r.reason;
            const isUserTarget = r.target_type === "user" || r.target_type === "nickname";
            return (
              <div key={r.id} className="px-4 py-3 space-y-2">
                {/* Header row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Flag className="h-3.5 w-3.5 text-destructive" />
                  <Badge variant="outline" className="capitalize">{r.target_type}</Badge>
                  <Badge className="capitalize">{reasonLabel}</Badge>
                  <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2"
                    onClick={() => setExpanded((p) => ({ ...p, [r.id]: !isOpen }))}
                    aria-label={isOpen ? "Collapse" : "Expand"}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Target summary (always visible) */}
                <div className="rounded-lg border border-border/60 bg-secondary/20 p-2.5">
                  {renderTargetSummary(r)}
                </div>

                {/* Reporter + reason */}
                <div className="text-xs text-muted-foreground">
                  Reported by <span className="font-medium text-foreground/90">{reporterNick}</span> · {reasonLabel}
                </div>

                {/* Details/notes */}
                {r.details && (
                  <div className="text-sm text-foreground/90 bg-background/50 rounded-md px-3 py-2 border border-border/40">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Notes</span>
                    {r.details}
                  </div>
                )}

                {/* Expanded diagnostics */}
                {isOpen && (
                  <div className="text-[11px] text-muted-foreground font-mono break-all space-y-1 bg-background/40 rounded-md p-2 border border-border/30">
                    <div>report_id: {r.id}</div>
                    <div>target_id: {r.target_id}</div>
                    <div>reporter_id: {r.reporter_id}</div>
                    <div>created_at: {new Date(r.created_at).toLocaleString()}</div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 flex-wrap pt-1">
                  {r.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "reviewing")}>
                      Review
                    </Button>
                  )}
                  {isUserTarget && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/users/${r.target_id}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Profile
                      </Link>
                    </Button>
                  )}
                  {isUserTarget && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(r.target_id, "User ID")}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy User ID
                    </Button>
                  )}
                  {r.target_type === "request" && onRemoveRequest && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        await onRemoveRequest(r.target_id);
                        await updateStatus(r.id, "resolved");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove & resolve
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "resolved")}>
                    Resolve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, "dismissed")}>
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
