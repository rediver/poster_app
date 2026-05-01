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
  title: string;
  trackPoints: LatLng[];
  overlayData: PhotoOverlayData;
  accentColor: string;
  labelColor: string;
  valueColor: string;
  fontFamily: string;
  width: number;
  height: number;
  statsVisible: boolean;
  visibleStats: Set<string>;
  /** Serif font for the large editorial title */
  titleFont?: string;
  /** Photo brightness (0.7–1.0). Default 0.87 */
  brightness?: number;
  /** Photo contrast (1.0–1.2). Default 1.10 */
  contrast?: number;
  /** Photo saturation (0.6–1.0). Default 0.83 */
  saturation?: number;
  /** Track thickness multiplier (0.3–3.0). Default 1.0 */
  trackThickness?: number;
}

/**
 * Unique ID counter for SVG filter instances so multiple previews
 * on the same page don't collide.
 */
let filterId = 0;

export function PhotoPosterPreview({
  photoUrl,
  title,
  trackPoints,
  overlayData,
  accentColor,
  fontFamily,
  width,
  height,
  statsVisible,
  visibleStats,
  titleFont = "'Cormorant Garamond', serif",
  brightness = 0.87,
  contrast = 1.10,
  saturation = 0.83,
  trackThickness = 1.0,
}: PhotoPosterPreviewProps) {
  const isPortrait = height > width;

  // Unique grain filter ID for this instance
  const grainId = useMemo(() => `grain-${++filterId}`, []);

  // ── Smooth track ──
  const smoothedTrack = useMemo(() => {
    if (trackPoints.length < 2) return [];
    let pts = downsamplePoints(trackPoints, 200);
    pts = smoothPoints(pts, 2);
    return pts;
  }, [trackPoints]);

  // ── Visible stats ──
  const activeStats = ALL_STATS.filter(
    (s) => visibleStats.has(s.key) && overlayData[s.key],
  );

  // ── Safe margins ──
  const margin = Math.round(width * (isPortrait ? 0.08 : 0.06));
  const bottomMargin = Math.round(height * 0.06);

  // ── Typography sizing (proportional) ──
  const titleSize = Math.max(24, Math.round(width * (isPortrait ? 0.125 : 0.095)));
  const kickerSize = Math.max(9, Math.round(width * (isPortrait ? 0.022 : 0.018)));
  const metricLabelSize = Math.max(8, Math.round(width * (isPortrait ? 0.018 : 0.015)));
  const metricValueSize = Math.max(12, Math.round(width * (isPortrait ? 0.032 : 0.026)));
  const metricGap = Math.max(12, Math.round(width * 0.04));

  // ── Track styling ──
  const trackStrokeWidth = Math.max(0.5, (width / 200) * trackThickness);
  const trackOpacity = 0.55;

  // ── CSS filter for color treatment ──
  const photoFilter = [
    `brightness(${brightness})`,
    `contrast(${contrast})`,
    `saturate(${saturation})`,
    'sepia(0.06)',
  ].join(' ');

  // ── Gradient definitions ──
  const leftGradient = `linear-gradient(to right, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.22) 35%, transparent 65%)`;
  const bottomGradient = `linear-gradient(to top, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.22) 40%, transparent 70%)`;
  const radialVignette = `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.32) 100%)`;

  // Kicker text: use date if available
  const kickerText = overlayData.date || '';

  // Separator height for metrics
  const sepH = Math.round(metricValueSize + metricLabelSize * 0.6);

  return (
    <div
      className="relative overflow-hidden"
      style={{ width, height }}
    >
      {/* ── L0: Photo background with color treatment ── */}
      <img
        src={photoUrl}
        alt="User photo"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          zIndex: 0,
          filter: photoFilter,
        }}
      />

      {/* ── L1: Left readability gradient ── */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 1,
          background: leftGradient,
          pointerEvents: 'none',
        }}
      />

      {/* ── L2: Bottom readability gradient ── */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 2,
          background: bottomGradient,
          pointerEvents: 'none',
        }}
      />

      {/* ── L3: Radial vignette ── */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 3,
          background: radialVignette,
          pointerEvents: 'none',
        }}
      />

      {/* ── L4: Grain texture (SVG noise) ── */}
      <svg
        className="absolute inset-0"
        width={width}
        height={height}
        style={{ zIndex: 4, pointerEvents: 'none', opacity: 0.045 }}
      >
        <filter id={grainId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
          />
        </filter>
        <rect
          width="100%"
          height="100%"
          filter={`url(#${grainId})`}
        />
      </svg>

      {/* ── L5: Route / Track ── */}
      {smoothedTrack.length >= 2 && (
        <div
          className="absolute inset-0"
          style={{
            zIndex: 5,
            opacity: trackOpacity,
          }}
        >
          <TrackSvg
            points={smoothedTrack}
            width={width}
            height={height}
            strokeColor={accentColor}
            strokeWidth={trackStrokeWidth}
          />
        </div>
      )}

      {/* ── L6: Title Block (upper-left) ── */}
      {title && (
        <div
          className="absolute"
          style={{
            zIndex: 6,
            top: margin,
            left: margin,
            right: isPortrait ? margin * 2 : '45%',
            pointerEvents: 'none',
          }}
        >
          {/* Kicker */}
          {kickerText && (
            <div
              style={{
                fontFamily: "'Inter', 'Helvetica Neue', Helvetica, sans-serif",
                fontSize: kickerSize,
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase' as const,
                color: 'rgba(245, 240, 232, 0.60)',
                marginBottom: Math.max(6, Math.round(height * 0.012)),
                lineHeight: 1.2,
              }}
            >
              {kickerText}
            </div>
          )}
          {/* Title */}
          <h1
            style={{
              fontFamily: titleFont,
              fontSize: titleSize,
              fontWeight: 300,
              letterSpacing: '-0.03em',
              lineHeight: 0.92,
              color: '#F5F0E8',
              margin: 0,
              padding: 0,
              textShadow: '0 2px 12px rgba(0,0,0,0.4)',
            }}
          >
            {title}
          </h1>
        </div>
      )}

      {/* ── L7: Metrics Row (bottom) ── */}
      {statsVisible && activeStats.length > 0 && (
        <div
          className="absolute"
          style={{
            zIndex: 7,
            bottom: bottomMargin,
            left: margin,
            right: margin,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: isPortrait ? 'center' : 'flex-start',
            gap: metricGap,
            pointerEvents: 'none',
          }}
        >
          {activeStats.map((stat, i) => (
            <React.Fragment key={stat.key}>
              {i > 0 && (
                <div
                  aria-hidden
                  style={{
                    width: 1,
                    height: sepH,
                    background: 'rgba(255,255,255,0.22)',
                    flexShrink: 0,
                    alignSelf: 'center',
                  }}
                />
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column' as const,
                  alignItems: isPortrait ? 'center' : 'flex-start',
                  gap: Math.max(2, Math.round(height * 0.004)),
                }}
              >
                <span
                  style={{
                    fontFamily: "'Inter', 'Helvetica Neue', Helvetica, sans-serif",
                    fontSize: metricLabelSize,
                    fontWeight: 500,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase' as const,
                    color: 'rgba(255,255,255,0.48)',
                    lineHeight: 1,
                  }}
                >
                  {stat.overlayLabel}
                </span>
                <span
                  style={{
                    fontFamily: "'Inter', 'Helvetica Neue', Helvetica, sans-serif",
                    fontSize: metricValueSize,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.88)',
                    lineHeight: 1.1,
                    letterSpacing: '-0.01em',
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
