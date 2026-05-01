import { Link, useNavigate } from "react-router-dom";
import { Disc3, LogOut, Trophy, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  const { user, profile, isDJ, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 glass border-b">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Disc3 className="h-7 w-7 text-primary group-hover:rotate-180 transition-transform duration-700" />
            <span className="absolute inset-0 rounded-full bg-primary/30 blur-md -z-10" />
          </div>
          <span className="font-bold text-lg tracking-tight">
            Decks<span className="text-primary">.</span>
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/leaderboard"><Trophy className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Leaderboard</span></Link>
              </Button>
              {isDJ && (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/dj">Dashboard</Link>
                </Button>
              )}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-sm">
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{profile?.nickname ?? "Guest"}</span>
                {profile && (
                  <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/30 ml-1">
                    {profile.points} pts
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">DJ Login</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
