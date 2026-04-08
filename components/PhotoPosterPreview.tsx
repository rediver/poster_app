import React, { useMemo } from 'react';
import { TrackSvg } from './TrackSvg';
import { smoothPoints, downsamplePoints } from './RoutePreview';

type LatLng = [number, number];

export interface PhotoOverlayData {
  distance?: string;
  duration?: string;
  speed?: string;
  elevation?: string;
  date?: string;
}

interface StatDef {
  key: keyof PhotoOverlayData;
  label: string;
  /** Label shown in the overlay bar */
  overlayLabel: string;
}

const ALL_STATS: StatDef[] = [
  { key: 'distance', label: 'Distance', overlayLabel: 'DISTANCE' },
  { key: 'elevation', label: 'Elevation', overlayLabel: 'ELEVATION' },
  { key: 'speed', label: 'Pace', overlayLabel: 'PACE' },
  { key: 'date', label: 'Date', overlayLabel: 'DATE' },
  { key: 'duration', label: 'Time', overlayLabel: 'TIME' },
];

interface PhotoPosterPreviewProps {
  photoUrl: string;
  trackPoints: LatLng[];
  overlayData: PhotoOverlayData;
  accentColor: string;
  width: number;
  height: number;
  statsVisible: boolean;
  visibleStats: Set<string>;
}

export function PhotoPosterPreview({
  photoUrl,
  trackPoints,
  overlayData,
  accentColor,
  width,
  height,
  statsVisible,
  visibleStats,
}: PhotoPosterPreviewProps) {
  // Smooth track for overlay
  const smoothedTrack = useMemo(() => {
    if (trackPoints.length < 2) return [];
    let pts = downsamplePoints(trackPoints, 200);
    pts = smoothPoints(pts, 2);
    return pts;
  }, [trackPoints]);

  // Collect visible stat entries for the overlay bar
  const activeStats = ALL_STATS.filter(
    (s) => visibleStats.has(s.key) && overlayData[s.key],
  );

  const barFontSize = Math.max(10, Math.round(width / 40));
  const barValueSize = Math.max(14, Math.round(width / 24));
  const barPadding = Math.max(8, Math.round(height / 30));

  const textShadow = '0 1px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.5)';

  return (
      <div
        className="relative overflow-hidden rounded-lg shadow-xl"
        style={{ width, height }}
      >
        {/* Photo background */}
        <img
          src={photoUrl}
          alt="User photo"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 0 }}
        />

        {/* GPX track overlay */}
        {smoothedTrack.length >= 2 && (
          <div className="absolute inset-0" style={{ zIndex: 1, opacity: 0.8 }}>
            <TrackSvg
              points={smoothedTrack}
              width={width}
              height={height}
              strokeColor={accentColor}
              strokeWidth={Math.max(3, Math.round(width / 120))}
            />
          </div>
        )}

        {/* Stats bar */}
        {statsVisible && activeStats.length > 0 && (
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0"
            style={{
              zIndex: 2,
              padding: `${barPadding}px`,
            }}
          >
            {activeStats.map((stat, i) => (
              <React.Fragment key={stat.key}>
                {i > 0 && (
                  <div
                    className="mx-3"
                    style={{
                      width: 1,
                      height: barValueSize + barFontSize,
                      backgroundColor: 'rgba(255,255,255,0.4)',
                      filter: `drop-shadow(0 0 2px rgba(0,0,0,0.5))`,
                    }}
                  />
                )}
                <div className="flex flex-col items-center">
                  <span
                    style={{
                      color: 'rgba(255,255,255,0.8)',
                      fontSize: barFontSize,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      fontFamily: 'monospace',
                      textShadow,
                    }}
                  >
                    {stat.overlayLabel}
                  </span>
                  <span
                    style={{
                      color: '#ffffff',
                      fontSize: barValueSize,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      lineHeight: 1.3,
                      textShadow,
                    }}
                  >
                    {overlayData[stat.key]}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
  );
}
