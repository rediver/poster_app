import React, { useEffect, useState } from 'react';

interface MapImageProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Map image with skeleton placeholder and smooth fade-in.
 * Avoids layout jumps when the Mapbox static image is loading.
 */
export function MapImage({ src, className = '', style }: MapImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  // Reset loaded state when src changes
  useEffect(() => {
    if (src !== currentSrc) {
      setLoaded(false);
      setCurrentSrc(src);
    }
  }, [src, currentSrc]);

  return (
    <>
      {/* Animated skeleton placeholder */}
      {!loaded && (
        <div
          className="absolute inset-0 z-0 animate-pulse"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
        />
      )}
      <img
        src={currentSrc}
        alt=""
        className={className}
        style={{
          ...style,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.4s ease-in-out',
        }}
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}
