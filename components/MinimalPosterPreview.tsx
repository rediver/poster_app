/**
 * MinimalPosterPreview
 *
 * Scandinavian / Swiss editorial poster layout.
 *
 * Visual structure
 * ──────────────────────────────────────────────────────────────
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  [thin inset border – rgba(80,70,60,0.14)]               │
 *  │                                                          │
 *  │          ╭────────────── route ──────────────╮           │
 *  │          │  pure SVG path, no map, no markers│           │
 *  │          ╰──────────────────────────────────╯           │
 *  │                                                          │
 *  │                    Activity Title                        │
 *  │                    APRIL 26, 2026                        │
 *  │              8.90 km │ 53:58 │ 6:03 min/km              │
 *  │                                                          │
 *  └──────────────────────────────────────────────────────────┘
 *
 * Rules:
 *  - TrackSvg is used as-is (no changes to its scaling logic).
 *  - All layout values are proportional to (width, height)
 *    so the component is scale-independent.
 *  - Typography, colours, and inset border are the only styling
 *    applied here; TrackSvg owns the route geometry.
 */
import React, { useMemo } from 'react';
import { TrackSvg } from './TrackSvg';
import { downsamplePoints, smoothPoints } from './RoutePreview';

type LatLng = [number, number];

interface OverlayData {
  distance?: string;
  duration?: string;
  speed?: string;
  elevation?: string;
  date?: string;
}

interface MinimalPosterPreviewProps {
  /** Raw GPS points – smoothed internally so callers don't have to. */
  trackPoints: LatLng[];
  title: string;
  overlayData?: OverlayData;
  /** Route stroke + separator colour. Defaults to muted Strava orange. */
  accentColor?: string;
  /** Rendered pixel width (preview scale). */
  width: number;
  /** Rendered pixel height (preview scale). */
  height: number;
}

export function MinimalPosterPreview({
  trackPoints,
  title,
  overlayData,
  accentColor = '#FC5A1F',
  width,
  height,
}: MinimalPosterPreviewProps) {
  const strokeColor = accentColor || '#FC5A1F';

  /* ── smooth track ────────────────────────────────────────────── */
  const smoothed = useMemo(() => {
    if (trackPoints.length < 2) return [];
    let pts = downsamplePoints(trackPoints, 200);
    pts = smoothPoints(pts, 2);
    return pts;
  }, [trackPoints]);

  /* ── layout ──────────────────────────────────────────────────── */
  // Inset border: ~3.8 % of width (≈ 22 px at A3 landscape ~594 px wide)
  const bi = Math.max(12, Math.round(width * 0.038));

  // Route container – portrait gets a 6 % boost so the route feels more present
  // in the taller, narrower canvas. Landscape proportions stay as refined before.
  const isPortrait = height > width;
  const routeW = Math.round(width  * (isPortrait ? 0.66 : 0.62)); // portrait +6 %
  const routeH = Math.round(height * (isPortrait ? 0.58 : 0.55)); // portrait +5.5 %
  const routeTop = Math.round(height * 0.07);

  // Stroke – landscape gets a further ~12 % reduction so the line reads
  // more elegant at wider canvas width. Portrait keeps the existing value.
  // Fractional stroke widths are fine in SVG (no rounding needed here).
  const strokeW = Math.max(1.5, width * (isPortrait ? 0.0078 : 0.0069));

  /* ── typography sizes (proportional to width) ──────────────── */
  // Landscape values are slightly smaller so the wider, shallower composition
  // feels lighter. Portrait values are unchanged.
  const titlePx    = Math.max(22, Math.round(width * (isPortrait ? 0.060 : 0.055)));  // LS −9 %
  const datePx     = Math.max(8,  Math.round(width * (isPortrait ? 0.022 : 0.021)));  // LS −4 %
  const statsPx    = Math.max(9,  Math.round(width * (isPortrait ? 0.026 : 0.024)));  // LS −6 %
  const titleWeight = isPortrait ? 510 : 470;         // LS slightly lighter
  const dateLSpacing = isPortrait ? '0.16em' : '0.12em'; // LS less stretched
  const sepH     = Math.round(statsPx * 1.35);               // separator height
  const statGap  = Math.max(8,  Math.round(width * 0.020));  // gap between items

  /* ── spacing ─────────────────────────────────────────────────── */
  const dateMarginTop  = Math.max(8,  Math.round(height * 0.030));
  const statsMarginTop = Math.max(10, Math.round(height * 0.034));
  const textBottom     = Math.max(16, Math.round(height * 0.090)); // from bottom edge

  /* ── stat strings ───────────────────────────────────────────── */
  const statParts: string[] = [];
  if (overlayData?.distance) statParts.push(overlayData.distance);
  if (overlayData?.duration) statParts.push(overlayData.duration);
  if (overlayData?.speed)    statParts.push(overlayData.speed);

  return (
    <div
      style={{
        width,
        height,
        background: '#F7F3EC',      // warm paper tone, not pure white
        position: 'relative',
        overflow: 'hidden',
        // Inter variable font enables fractional weights (e.g. 560, 450)
        fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      }}
    >
      {/* ── inset border ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: bi,
          border: '1px solid rgba(80, 70, 60, 0.14)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* ── route SVG ── upper zone, centred horizontally ── */}
      <div
        style={{
          position: 'absolute',
          top: routeTop,
          left: '50%',
          transform: 'translateX(-50%)',
          width: routeW,
          height: routeH,
        }}
      >
        {smoothed.length >= 2 ? (
          /*
           * TrackSvg is unchanged – it already uses uniform scale:
           *   scale = min(drawW / mercW, drawH / mercH)
           * We pass a small padding (0.04) so the line never clips
           * against the container edge.
           */
          <TrackSvg
            points={smoothed}
            width={routeW}
            height={routeH}
            strokeColor={strokeColor}
            strokeWidth={strokeW}
            padding={0.04}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                color: 'rgba(80, 70, 60, 0.22)',
                fontSize: Math.max(9, Math.round(width * 0.018)),
                letterSpacing: '0.14em',
                fontWeight: 400,
              }}
            >
              SELECT AN ACTIVITY
            </span>
          </div>
        )}
      </div>

      {/* ── text block ── lower zone, centred ── */}
      <div
        style={{
          position: 'absolute',
          bottom: textBottom,
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          width: '80%',
          zIndex: 2,
        }}
      >
        {/* Title – editorial semi-bold */}
        <div
          style={{
            fontSize: titlePx,
            fontWeight: titleWeight,
            letterSpacing: '-0.030em',
            lineHeight: 1.05,
            color: '#242424',
          }}
        >
          {title || '—'}
        </div>

        {/* Date – spaced, muted */}
        {overlayData?.date && (
          <div
            style={{
              marginTop: dateMarginTop,
              fontSize: datePx,
              fontWeight: 400,
              letterSpacing: dateLSpacing,
              color: '#77736D',
              textTransform: 'uppercase',
            }}
          >
            {overlayData.date}
          </div>
        )}

        {/* Stats – thin orange separators */}
        {statParts.length > 0 && (
          <div
            style={{
              marginTop: statsMarginTop,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: statGap,
              fontSize: statsPx,
              fontWeight: 450,         // Inter variable → elegant, lighter than 500
              letterSpacing: '0.11em',
              color: '#242424',
            }}
          >
            {statParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 1.5,
                      height: sepH,
                      background: strokeColor,
                      flexShrink: 0,
                    }}
                  />
                )}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
