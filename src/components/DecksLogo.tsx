interface DecksLogoProps {
  className?: string;
  alt?: string;
}

/**
 * Official Decks brand mark (transparent — logo mark only, no app-icon squircle).
 * Use this in-app for header/auth/footer/dashboard. The rounded app icon
 * (public/brand/decks-app-icon.png) is reserved for favicons/PWA/OS icons.
 */
export function DecksLogo({ className, alt = "Decks" }: DecksLogoProps) {
  return (
    <img
      src="/brand/decks-logo-mark-transparent.png?v=1"
      alt={alt}
      width={1024}
      height={1024}
      className={className}
      style={{ objectFit: "contain" }}
      draggable={false}
    />
  );
}

export default DecksLogo;
