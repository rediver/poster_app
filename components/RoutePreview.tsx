import React from 'react';

/**
 * Decode a Google Encoded Polyline string into an array of [lat, lng] pairs.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

interface RoutePreviewProps {
  polyline: string;
  width: number;
  height: number;
  strokeColor?: string;
  strokeWidth?: number;
  padding?: number;
}

export function RoutePreview({
  polyline,
  width,
  height,
  strokeColor = '#ff6b35',
  strokeWidth = 2,
  padding = 20,
}: RoutePreviewProps) {
  const points = React.useMemo(() => decodePolyline(polyline), [polyline]);

  if (points.length < 2) return null;

  // Compute bounding box
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const drawW = width - padding * 2;
  const drawH = height - padding * 2;

  const latRange = maxLat - minLat || 1e-5;
  const lngRange = maxLng - minLng || 1e-5;

  // Maintain aspect ratio
  const scaleX = drawW / lngRange;
  const scaleY = drawH / latRange;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = padding + (drawW - lngRange * scale) / 2;
  const offsetY = padding + (drawH - latRange * scale) / 2;

  // Convert lat/lng to SVG coordinates (flip Y since lat increases upward)
  const svgPoints = points.map(([lat, lng]) => {
    const x = (lng - minLng) * scale + offsetX;
    const y = (maxLat - lat) * scale + offsetY;
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
