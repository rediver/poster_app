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
  const [errorDetail, setErrorDetail] = useState('');
  const [currentSrc, setCurrentSrc] = useState(src);

  // Reset loaded/error state when src changes
  useEffect(() => {
    if (src !== currentSrc) {
      console.log('[MapImage] src changed, resetting state', { oldLen: currentSrc.length, newLen: src.length });
      setLoaded(false);
      setError(false);
      setErrorDetail('');
      setCurrentSrc(src);
    }
  }, [src, currentSrc]);

  // Probe the URL with fetch to get HTTP status on error
  useEffect(() => {
    if (!currentSrc) return;
    console.log('[MapImage] loading URL', {
      length: currentSrc.length,
      preview: currentSrc.slice(0, 150) + '...',
    });

    // Also do a HEAD fetch so we can log HTTP status if it fails
    fetch(currentSrc, { method: 'HEAD', mode: 'no-cors' }).then(res => {
      console.log('[MapImage] HEAD probe', { status: res.status, type: res.type, ok: res.ok });
    }).catch(err => {
      console.warn('[MapImage] HEAD probe failed', err?.message);
    });
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
          className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
        >
          <span className="text-xs text-gray-400">Map failed to load</span>
          {errorDetail && <span className="text-[10px] text-gray-300">{errorDetail}</span>}
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
          console.log('[MapImage] ✅ loaded OK', { w: (window as any).__lastImgNatW, srcLen: currentSrc.length });
          setLoaded(true);
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          const detail = `naturalSize=${target.naturalWidth}x${target.naturalHeight} srcLen=${currentSrc.length}`;
          console.error('[MapImage] ❌ failed to load', {
            detail,
            srcPreview: currentSrc.slice(0, 250),
          });
          setError(true);
          setErrorDetail(detail);
        }}
      />
    </>
  );
}
