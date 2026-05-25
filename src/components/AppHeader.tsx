import { Link, useNavigate } from "react-router-dom";
import { Disc3, Globe2, LogOut, Trophy, User as UserIcon } from "lucide-react";
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
    <header className="sticky top-0 z-40 backdrop-blur-2xl bg-background/70 border-b border-white/[0.05]">
      <div className="container flex h-14 sm:h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Disc3 className="h-6 w-6 sm:h-7 sm:w-7 text-primary group-hover:rotate-180 transition-transform duration-700" />
            <span className="absolute inset-0 rounded-full bg-primary/15 blur-md -z-10" />
          </div>
          <span className="font-semibold text-[17px] tracking-tight">
            Decks
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/leaderboard"><Trophy className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Leaderboard</span></Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/global-leaderboard"><Globe2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Global</span></Link>
              </Button>
              {isDJ && (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/dj">Dashboard</Link>
                </Button>
              )}
              <Link
                to="/profile"
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/60 hover:bg-secondary text-sm transition-colors"
              >
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{profile?.nickname ?? "Guest"}</span>
                {profile && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 rounded-full ml-1">
                    {profile.points} pts
                  </Badge>
                )}
              </Link>
              <Button asChild variant="ghost" size="icon" className="sm:hidden" aria-label="Profile">
                <Link to="/profile"><UserIcon className="h-4 w-4" /></Link>
              </Button>
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
