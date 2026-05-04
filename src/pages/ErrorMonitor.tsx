import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";

interface ErrorLog {
  id: string;
  severity: "critical" | "warning" | "info";
  source: string;
  message: string;
  context: Record<string, unknown> | null;
  stack: string | null;
  user_id: string | null;
  route: string | null;
  user_agent: string | null;
  reviewed: boolean;
  created_at: string;
}

export default function ErrorMonitor() {
  const { user, isDJ, loading } = useAuth();
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "unreviewed">("unreviewed");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isDJ) return;
    void load();
    const ch = supabase
      .channel("error_logs_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "error_logs" }, (payload) => {
        const row = payload.new as ErrorLog;
        setLogs((prev) => [row, ...prev].slice(0, 200));
        if (row.severity === "critical") {
          toast({ title: "🚨 Critical error", description: `${row.source}: ${row.message}`, variant: "destructive" });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isDJ]);

  async function load() {
    const { data, error } = await supabase
      .from("error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { toast({ title: "Failed to load logs", variant: "destructive" }); return; }
    setLogs((data ?? []) as ErrorLog[]);
  }

  async function markReviewed(id: string) {
    setBusy(true);
    const { error } = await supabase.from("error_logs").update({ reviewed: true }).eq("id", id);
    setBusy(false);
    if (error) toast({ title: "Update failed", variant: "destructive" });
    else setLogs((p) => p.map((l) => (l.id === id ? { ...l, reviewed: true } : l)));
  }

  if (loading) return null;
  if (!user) return <Navigate to="/auth?role=dj" replace />;
  if (!isDJ) return <Navigate to="/" replace />;

  const filtered = logs.filter((l) => {
    if (filter === "all") return true;
    if (filter === "unreviewed") return !l.reviewed;
    return l.severity === filter;
  });

  const counts = {
    critical: logs.filter((l) => l.severity === "critical" && !l.reviewed).length,
    warning: logs.filter((l) => l.severity === "warning" && !l.reviewed).length,
    total: logs.length,
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto p-4 max-w-5xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">Error Monitor</h1>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="destructive">{counts.critical} critical</Badge>
            <Badge variant="secondary">{counts.warning} warnings</Badge>
            <Badge variant="outline">{counts.total} total</Badge>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {(["unreviewed", "critical", "warning", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={load}>Refresh</Button>
        </div>

        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No errors 🎉</Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((l) => (
              <Card key={l.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={l.severity === "critical" ? "destructive" : l.severity === "warning" ? "secondary" : "outline"}>
                      {l.severity}
                    </Badge>
                    <span className="font-mono text-sm">{l.source}</span>
                    {l.reviewed && <Badge variant="outline">reviewed</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm">{l.message}</p>
                {l.route && <p className="text-xs text-muted-foreground">route: {l.route}</p>}
                {l.stack && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Stack trace</summary>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all bg-muted p-2 rounded">{l.stack}</pre>
                  </details>
                )}
                {l.context && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Context</summary>
                    <pre className="mt-1 overflow-x-auto bg-muted p-2 rounded">{JSON.stringify(l.context, null, 2)}</pre>
                  </details>
                )}
                {!l.reviewed && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => markReviewed(l.id)}>
                    Mark reviewed
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
