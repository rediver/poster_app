import React from 'react';

/**
 * Decode a Google Encoded Polyline string into an array of [lat, lng] pairs.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): [number, number][] {
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

/**
 * Compute a padded bounding box from a polyline string.
 * Returns { minLat, maxLat, minLng, maxLng } with padding applied,
 * or null if the polyline has fewer than 2 points.
 */
export function polylineBounds(polyline: string, padFraction = 0.08) {
  const pts = decodePolyline(polyline);
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const rawMinLat = Math.min(...lats);
  const rawMaxLat = Math.max(...lats);
  const rawMinLng = Math.min(...lngs);
  const rawMaxLng = Math.max(...lngs);
  const latPad = (rawMaxLat - rawMinLat) * padFraction || 0.002;
  const lngPad = (rawMaxLng - rawMinLng) * padFraction || 0.002;
  return {
    minLat: rawMinLat - latPad,
    maxLat: rawMaxLat + latPad,
    minLng: rawMinLng - lngPad,
    maxLng: rawMaxLng + lngPad,
  };
}

export type Bbox = NonNullable<ReturnType<typeof polylineBounds>>;

interface RoutePreviewProps {
  polyline: string;
  width: number;
  height: number;
  /** If provided, the route is projected to this exact bbox (must match map). */
  bbox?: Bbox;
  strokeColor?: string;
  strokeWidth?: number;
}

export function RoutePreview({
  polyline,
  width,
  height,
  bbox,
  strokeColor = '#ff6b35',
  strokeWidth = 2,
}: RoutePreviewProps) {
  const points = React.useMemo(() => decodePolyline(polyline), [polyline]);

  if (points.length < 2) return null;

  // Use explicit bbox when given (same as map), otherwise derive from points
  const bounds: Bbox = React.useMemo(() => {
    if (bbox) return bbox;
    return polylineBounds(polyline) as Bbox;
  }, [bbox, polyline]);

  // Web Mercator: convert latitude to Mercator y
  const toMercatorY = (lat: number) =>
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

  // Compute what Mapbox actually renders:
  // Mapbox fits the bbox into the image while preserving Mercator aspect ratio,
  // so the actual rendered extent may be larger than the requested bbox on one axis.
  const bboxMercW = bounds.maxLng - bounds.minLng || 1e-10;
  const bboxMercH = toMercatorY(bounds.maxLat) - toMercatorY(bounds.minLat) || 1e-10;
  const bboxAspect = bboxMercW / bboxMercH;
  const imgAspect = width / height;

  // Actual Mercator extent that Mapbox renders (centered, with letterboxing)
  let actualMinLng: number, actualMaxLng: number;
  let actualMinMercY: number, actualMaxMercY: number;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const centerMercY = (toMercatorY(bounds.minLat) + toMercatorY(bounds.maxLat)) / 2;

  if (imgAspect > bboxAspect) {
    // Image wider than bbox → extra horizontal space
    const actualMercW = bboxMercH * imgAspect;
    actualMinLng = centerLng - actualMercW / 2;
    actualMaxLng = centerLng + actualMercW / 2;
    actualMinMercY = toMercatorY(bounds.minLat);
    actualMaxMercY = toMercatorY(bounds.maxLat);
  } else {
    // Image taller than bbox → extra vertical space
    const actualMercH = bboxMercW / imgAspect;
    actualMinLng = bounds.minLng;
    actualMaxLng = bounds.maxLng;
    actualMinMercY = centerMercY - actualMercH / 2;
    actualMaxMercY = centerMercY + actualMercH / 2;
  }

  const actualLngRange = actualMaxLng - actualMinLng || 1e-10;
  const actualMercRange = actualMaxMercY - actualMinMercY || 1e-10;

  // Project points using the same extent Mapbox rendered
  const svgPoints = points.map(([lat, lng]) => {
    const x = ((lng - actualMinLng) / actualLngRange) * width;
    const y = (1 - (toMercatorY(lat) - actualMinMercY) / actualMercRange) * height;
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
