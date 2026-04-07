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
}

export function DataOverlay({
  title,
  data,
  backgroundColor,
  textColor,
  fontFamily,
  width,
  height,
}: DataOverlayProps) {
  const scale = Math.min(width / 400, height / 110);

  const titleSize = Math.max(10, Math.round(22 * scale));
  const metaSize = Math.max(7, Math.round(10 * scale));
  const statsSize = Math.max(8, Math.round(11 * scale));
  const gap = Math.max(2, Math.round(4 * scale));
  const padding = Math.max(6, Math.round(14 * scale));

  const statsLine = [data.distance, data.duration, data.speed]
    .filter(Boolean)
    .join(' | ');

  return (
    <div
      style={{
        backgroundColor,
        width,
        height,
        fontFamily,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: `${padding}px ${padding * 1.5}px`,
        boxSizing: 'border-box',
      }}
    >
      {title && (
        <div
          style={{
            color: textColor,
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.2,
            textAlign: 'center',
            marginBottom: gap,
          }}
        >
          {title}
        </div>
      )}

      {data.date && (
        <div
          style={{
            color: textColor,
            fontSize: metaSize,
            opacity: 0.6,
            textAlign: 'center',
            marginBottom: gap,
          }}
        >
          {data.date}
        </div>
      )}

      {statsLine && (
        <div
          style={{
            color: textColor,
            fontSize: statsSize,
            fontWeight: 600,
            textAlign: 'center',
            letterSpacing: '0.02em',
          }}
        >
          {statsLine}
        </div>
      )}
    </div>
  );
}
