import { Link, useNavigate } from "react-router-dom";
import { Disc3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  variant?: "premium" | "outline";
  size?: "default" | "lg";
  className?: string;
  withIcon?: boolean;
  label?: string;
}

/**
 * Routes "Start as a DJ" by current auth state so signed-in users
 * never get bounced through the login form again.
 *  - loading           → disabled button
 *  - signed-in + DJ    → /dj
 *  - signed-in + guest → /auth?role=dj (invite-code-only panel)
 *  - signed-out        → /auth?role=dj (signup/login + invite)
 */
export function StartAsDjCta({
  variant = "premium",
  size = "lg",
  className,
  withIcon = true,
  label = "Start as a DJ",
}: Props) {
  const { user, isDJ, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Button size={size} variant={variant} className={className} disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {label}
      </Button>
    );
  }

  if (!user) {
    return (
      <Button asChild size={size} variant={variant} className={className}>
        <Link to="/auth?role=dj" state={{ from: "/dj" }}>
          {withIcon && <Disc3 className="mr-2 h-5 w-5" />}
          {label}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={() => navigate(isDJ ? "/dj" : "/auth?role=dj")}
    >
      {withIcon && <Disc3 className="mr-2 h-5 w-5" />}
      {label}
    </Button>
  );
}
