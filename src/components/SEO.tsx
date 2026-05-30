import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description?: string;
  path?: string; // route path, e.g. "/join"
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
}

const SITE_URL = "https://linku99.com";
const DEFAULT_DESC =
  "Live DJ song requests, crowd voting, boosts, and Now Playing syncing for clubs, parties, and events.";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.jpg?v=2`;

export function SEO({
  title,
  description = DEFAULT_DESC,
  path = "/",
  image = DEFAULT_IMAGE,
  type = "website",
  noindex = false,
}: SEOProps) {
  const url = `${SITE_URL}${path}`;
  const fullTitle = title.includes("Decks") ? title : `${title} — Decks`;
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Decks" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
