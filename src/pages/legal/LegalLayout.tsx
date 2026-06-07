import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  description: string;
  path: string;
  updated?: string;
  children: ReactNode;
}

export function LegalLayout({ title, description, path, updated = "June 2026", children }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO title={title} description={description} path={path} />
      <AppHeader />
      <main className="container max-w-3xl py-10 flex-1">
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
        </Button>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {updated}</p>
        <article className="prose prose-invert prose-sm max-w-none space-y-6 text-foreground/90 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-foreground [&_p]:text-sm [&_li]:text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-primary [&_a:hover]:underline">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
