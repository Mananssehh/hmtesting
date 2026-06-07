import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Status = "open" | "reviewing" | "resolved" | "dismissed";

interface Report {
  id: string;
  reporter_id: string;
  event_id: string | null;
  target_type: "request" | "user" | "nickname";
  target_id: string;
  reason: string;
  details: string | null;
  status: Status;
  created_at: string;
}

export default function AdminReports() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status>("open");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const admin = !!data?.some((r) => r.role === "admin");
      setIsAdmin(admin);
      if (!admin) navigate("/", { replace: true });
    })();
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, filter]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("reports")
      .select("*")
      .eq("status", filter)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error) setReports((data ?? []) as Report[]);
    setLoading(false);
  };

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await (supabase as any).from("reports").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Report updated");
      setReports((prev) => prev.filter((r) => r.id !== id));
    }
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container py-20 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container max-w-4xl py-8 space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Home</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" /> Admin · Reports
          </h1>
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Status)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="reviewing">Reviewing</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{reports.length} report{reports.length === 1 ? "" : "s"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {loading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : reports.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">No reports here.</p>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{r.target_type}</Badge>
                    <Badge className="capitalize">{r.reason}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {r.details && <p className="text-sm text-foreground/80">{r.details}</p>}
                  <div className="text-[11px] text-muted-foreground font-mono break-all">
                    target: {r.target_id}{r.event_id ? ` · event: ${r.event_id}` : ""}
                  </div>
                  <div className="flex gap-2 flex-wrap pt-1">
                    {r.status !== "reviewing" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "reviewing")}>
                        Mark reviewing
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
      </main>
      <SiteFooter />
    </div>
  );
}
