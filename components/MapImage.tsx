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
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  // Reset loaded/error state when src changes
  useEffect(() => {
    if (src !== currentSrc) {
      setLoaded(false);
      setError(false);
      setCurrentSrc(src);
    }
  }, [src, currentSrc]);

  useEffect(() => {
    if (currentSrc) {
      console.log('[MapImage] loading URL', { length: currentSrc.length, preview: currentSrc.slice(0, 120) + '...' });
    }
  }, [currentSrc]);

  return (
    <>
      {/* Animated skeleton placeholder */}
      {!loaded && !error && (
        <div
          className="absolute inset-0 z-0 animate-pulse"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
        />
      )}
      {error && (
        <div
          className="absolute inset-0 z-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
        >
          <span className="text-xs text-gray-400">Map failed to load</span>
        </div>
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
        onLoad={() => {
          console.log('[MapImage] loaded OK');
          setLoaded(true);
        }}
        onError={(e) => {
          console.error('[MapImage] failed to load', { src: currentSrc.slice(0, 200), error: e });
          setError(true);
        }}
      />
    </>
  );
}
