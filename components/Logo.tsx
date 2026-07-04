import Image from 'next/image';

const SRC = '/axantilo_nobg.png';
const NATIVE_WIDTH = 873;
const NATIVE_HEIGHT = 136;
const ASPECT = NATIVE_WIDTH / NATIVE_HEIGHT;

/**
 * Kein separates weißes Logo-Asset vorhanden — auf dunklem Hintergrund wird
 * das dunkle Original per CSS zu einer weißen Silhouette invertiert (der
 * blau/violette Farbverlauf im Claim geht dabei verloren).
 */
export function Logo({
  height = 28,
  inverted = false,
  className,
}: {
  height?: number;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={SRC}
      alt="Axantilo"
      width={Math.round(height * ASPECT)}
      height={height}
      priority
      className={className}
      style={inverted ? { filter: 'brightness(0) invert(1)' } : undefined}
    />
  );
}
