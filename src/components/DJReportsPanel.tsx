import { useEffect, useState } from "react";
import { Loader2, Shield, Flag, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Status = "open" | "reviewing" | "resolved" | "dismissed";

interface Report {
  id: string;
  reporter_id: string;
  target_type: "request" | "user" | "nickname";
  target_id: string;
  reason: string;
  details: string | null;
  status: Status;
  created_at: string;
}

interface Props {
  eventId: string;
  onRemoveRequest?: (songRequestId: string) => Promise<void> | void;
}

export function DJReportsPanel({ eventId, onRemoveRequest }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("reports")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50);
    setReports((data ?? []) as Report[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`reports-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reports", filter: `event_id=eq.${eventId}` },
        () => void load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  const open = reports.filter((r) => r.status === "open" || r.status === "reviewing");
  const closed = reports.filter((r) => r.status === "resolved" || r.status === "dismissed");
  const visible = showResolved ? reports : open;

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
          visible.map((r) => (
            <div key={r.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Flag className="h-3.5 w-3.5 text-destructive" />
                <Badge variant="outline" className="capitalize">{r.target_type}</Badge>
                <Badge className="capitalize">{r.reason}</Badge>
                <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </span>
              </div>
              {r.details && <p className="text-sm text-foreground/80">{r.details}</p>}
              <div className="flex gap-2 flex-wrap pt-1">
                {r.status === "open" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "reviewing")}>
                    Mark reviewing
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
