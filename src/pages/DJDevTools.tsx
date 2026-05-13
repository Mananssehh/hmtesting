import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { IngestTestPanel } from "@/components/IngestTestPanel";


const DJDevTools = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isDJ, loading: authLoading } = useAuth();
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || !isDJ)) navigate("/auth", { replace: true });
  }, [user, isDJ, authLoading, navigate]);

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      const { data } = await supabase.from("events").select("dj_id").eq("id", id).maybeSingle();
      if (!data || data.dj_id !== user.id) {
        navigate("/dj", { replace: true });
        return;
      }
      setOk(true);
      setLoading(false);
    })();
  }, [id, user, navigate]);

  if (authLoading || loading || !ok || !id) {
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
      <div className="container max-w-4xl py-6 sm:py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Developer tools</div>
            <h1 className="text-2xl font-bold">Ingest &amp; stress testing</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Hidden dev-only panel. Not visible to guests or on the main DJ dashboard.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to={`/dj/${id}`}><ArrowLeft className="mr-2 h-4 w-4" /> Back to event</Link>
          </Button>
        </div>

        <IngestTestPanel eventId={id} />
        <StressTestPanel eventId={id} />
      </div>
    </div>
  );
};

export default DJDevTools;
