import React from 'react';

export interface OverlayData {
  distance?: string;
  duration?: string;
  speed?: string;
  elevation?: string;
  date?: string;
}

interface DataOverlayProps {
  title: string;
  data: OverlayData;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  width: number;
  height: number;
  /** Strava-orange (or other) accent color for units & dividers. Optional. */
  accentColor?: string;
}

/**
 * Split a stat value like "8.90 km" or "6:03 min/km" into a numeric portion and
 * a trailing unit. The unit is the last whitespace-delimited token when it does
 * not contain digits (so "53:58" stays a single value with no unit).
 */
function splitValueUnit(raw?: string): { value: string; unit: string } {
  if (!raw) return { value: '', unit: '' };
  const s = raw.trim();
  const idx = s.lastIndexOf(' ');
  if (idx === -1) return { value: s, unit: '' };
  const tail = s.slice(idx + 1);
  // Treat as a unit if it has no digits (e.g. "km", "min/km", "m")
  if (!/\d/.test(tail)) {
    return { value: s.slice(0, idx).trim(), unit: tail };
  }
  return { value: s, unit: '' };
}

export function DataOverlay({
  title,
  data,
  backgroundColor,
  textColor,
  fontFamily,
  width,
  height,
  accentColor = '#FC4C02',
}: DataOverlayProps) {
  const scale = Math.min(width / 400, height / 110);

  const labelSize = Math.max(7, Math.round(9 * scale));
  const valueSize = Math.max(13, Math.round(20 * scale));
  const unitSize = Math.max(8, Math.round(11 * scale));
  const padding = Math.max(8, Math.round(14 * scale));

  // Premium 4-column layout: DISTANCE │ TIME │ PACE │ ELEVATION
  const stats = [
    { label: 'DISTANCE', raw: data.distance },
    { label: 'TIME', raw: data.duration },
    { label: 'PACE', raw: data.speed },
    { label: 'ELEVATION', raw: data.elevation },
  ];

  // Subtle divider tint based on background (works for both dark & light bg).
  const dividerColor = 'rgba(255,255,255,0.08)';

  return (
    <div
      style={{
        backgroundColor,
        width,
        height,
        fontFamily,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        padding: `${padding}px ${padding * 1.25}px`,
        boxSizing: 'border-box',
        // Hairline top accent line for editorial feel
        borderTop: `1px solid ${dividerColor}`,
      }}
    >
      {stats.map((stat, i) => {
        const { value, unit } = splitValueUnit(stat.raw);
        const isEmpty = !value;
        return (
          <React.Fragment key={stat.label}>
            {i > 0 && (
              <div
                aria-hidden
                style={{
                  width: 1,
                  alignSelf: 'stretch',
                  background: dividerColor,
                  margin: `0 ${Math.max(2, Math.round(padding * 0.4))}px`,
                }}
              />
            )}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                minWidth: 0,
                opacity: isEmpty ? 0.35 : 1,
              }}
            >
              <div
                style={{
                  color: textColor,
                  opacity: 0.55,
                  fontSize: labelSize,
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  marginBottom: Math.max(2, Math.round(scale * 4)),
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: Math.max(2, Math.round(scale * 3)),
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                }}
              >
                <span
                  style={{
                    color: textColor,
                    fontSize: valueSize,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {value || '—'}
                </span>
                {unit && (
                  <span
                    style={{
                      color: textColor,
                      opacity: 0.75,
                      fontSize: unitSize,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'lowercase',
                    }}
                  >
                    {unit}
                  </span>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
