import React from 'react';

type LatLng = [number, number];

interface TrackSvgProps {
  points: LatLng[];
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth?: number;
  padding?: number;
}

export function TrackSvg({
  points,
  width,
  height,
  strokeColor,
  strokeWidth = 3,
  padding = 0.08,
}: TrackSvgProps) {
  if (points.length < 2) return null;

  const toMercatorY = (lat: number) => {
    const latRad = (lat * Math.PI) / 180;
    return (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  };

  const lngs = points.map((p) => p[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minMercY = toMercatorY(Math.min(...points.map((p) => p[0])));
  const maxMercY = toMercatorY(Math.max(...points.map((p) => p[0])));

  const mercW = maxLng - minLng || 1e-10;
  const mercH = maxMercY - minMercY || 1e-10;

  const padX = width * padding;
  const padY = height * padding;
  const drawW = width - 2 * padX;
  const drawH = height - 2 * padY;

  const scale = Math.min(drawW / mercW, drawH / mercH);
  const offsetX = padX + (drawW - mercW * scale) / 2;
  const offsetY = padY + (drawH - mercH * scale) / 2;

  const svgPoints = points.map(([lat, lng]) => {
    const x = offsetX + (lng - minLng) * scale;
    const y = offsetY + (maxMercY - toMercatorY(lat)) * scale;
    return `${x},${y}`;
  });

  const pathD = `M ${svgPoints.join(' L ')}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
