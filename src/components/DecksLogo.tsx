interface DecksLogoProps {
  className?: string;
  alt?: string;
}

/**
 * Official Decks brand mark. Renders the master logo image.
 * Do not stretch, crop, or recolor — control size via className width/height.
 */
export function DecksLogo({ className, alt = "Decks" }: DecksLogoProps) {
  return (
    <img
      src="/brand/decks-logo.png?v=3"
      alt={alt}
      width={512}
      height={512}
      className={className}
      style={{ objectFit: "contain" }}
      draggable={false}
    />
  );
}

export default DecksLogo;
