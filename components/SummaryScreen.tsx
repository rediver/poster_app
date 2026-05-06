import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { logModule, useLogMount } from '../src/debug';
logModule('components/SummaryScreen.tsx module');
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { encodePolyline, smoothPoints, downsamplePoints } from './RoutePreview';
import { MapImage } from './MapImage';
import { DataOverlay } from './DataOverlay';
import { TrackSvg } from './TrackSvg';
import { MinimalPosterPreview } from './MinimalPosterPreview';
import { PhotoPosterPreview } from './PhotoPosterPreview';

interface PosterConfig {
  title: string;
  fontFamily: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  layout: 'map' | 'photo' | 'modern' | 'minimal';
  showAlphabet: boolean;
  format: 'A3' | 'A4';
  orientation: 'vertical' | 'horizontal';
  mapZoom?: number;
  showDataOverlay: boolean;
  overlayData: {
    distance?: string;
    duration?: string;
    speed?: string;
    elevation?: string;
    date?: string;
  };
  photoTitleFont?: string;
  photoBrightness?: number;
  photoContrast?: number;
  photoSaturation?: number;
  photoTrackThickness?: number;
}

type LatLng = [number, number];

interface GenerateAndCheckoutResponse {
  checkout_url?: string;
  error?: string;
}

interface SummaryScreenProps {
  config: PosterConfig;
  trackPoints: LatLng[];
  onBack: () => void;
  activityId: string;
  photoUrl?: string;
  photoStatsVisible?: boolean;
  photoVisibleStats?: Set<string>;
}

export function SummaryScreen({ config, trackPoints, onBack, activityId, photoUrl, photoStatsVisible = true, photoVisibleStats }: SummaryScreenProps) {
  useLogMount('SummaryScreen');
  const [isReviewed, setIsReviewed] = useState(false);

  // Dynamic left-pane sizing like editor
  const previewContainerRef = React.useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };
    update();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    } else {
      window.addEventListener('resize', update);
    }
    return () => { ro ? ro.disconnect() : window.removeEventListener('resize', update); };
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (submitting) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const authData = JSON.parse(localStorage.getItem('strava_auth') || '{}');
        if (authData?.access_token) {
          headers['Authorization'] = `Bearer ${authData.access_token}`;
        }
      } catch (_e) { /* ignore */ }

      const res = await fetch(`${BACKEND_URL}/apps/poster/generate-and-checkout`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          activity_name: config.title,
          activity_date: config.overlayData?.date ?? '',
          distance_km:   config.overlayData?.distance ?? '',
          map_style:     config.layout,
          activity_id:   activityId,
        }),
      });

      const data = await res.json().catch(() => ({})) as GenerateAndCheckoutResponse;
      const checkoutUrl = typeof data.checkout_url === 'string' ? data.checkout_url : '';
      if (!res.ok || !checkoutUrl) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      window.location.href = checkoutUrl;
    } catch (e: any) {
      console.error('Checkout failed', e);
      setErrorMsg(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getLayoutClasses = () => {
    switch (config.layout) {
      case 'modern':
        return 'justify-between';
      case 'minimal':
        return 'justify-center items-center';
      default:
        return 'justify-start';
    }
  };

  // Calculate poster dimensions dynamically to maximize left pane, keeping proportions
  const getDimensions = () => {
    const isVertical = config.orientation === 'vertical';
    const base = config.format === 'A3'
      ? { width: isVertical ? 420 : 594, height: isVertical ? 594 : 420 }
      : { width: isVertical ? 297 : 420, height: isVertical ? 420 : 297 };
    let scale = 1;
    if (containerSize.w && containerSize.h) {
      const availW = Math.max(100, containerSize.w - 64); // more padding in summary
      const availH = Math.max(100, containerSize.h - 64);
      scale = Math.min(availW / base.width, availH / base.height) * 0.95;
    } else {
      scale = config.format === 'A3' ? 1.1 : 1.3;
    }
    return { width: base.width, height: base.height, scale };
  };

  const dimensions = getDimensions();
  const previewWidth = dimensions.width * dimensions.scale;
  const previewHeight = dimensions.height * dimensions.scale;

  // Overlay dimensions
  const overlayFraction = config.showDataOverlay ? 0.22 : 0;
  const overlayHeight = Math.round(previewHeight * overlayFraction);
  const mapSectionHeight = Math.round(previewHeight - overlayHeight);

  const alphabetText = "ABCD\nEFGHIJK\nLMNOP\nQRSTUV\nWXYZ";

  // Adjust font sizes for larger preview (always A3 proportions)
  const getFontSizes = () => {
    const baseMultiplier = 1.6;
    const orientationMultiplier = config.orientation === 'horizontal' ? 0.85 : 1;
    
    return {
      title: Math.round(28 * baseMultiplier * orientationMultiplier),
    };
  };

  const fontSizes = getFontSizes();
  
  const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || '';
  const mapboxToken = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || '';

  const summaryMapUrl = useMemo(() => {
    if (config.layout !== 'map' || trackPoints.length < 2 || !mapboxToken) return '';

    // Downsample → smooth → re-downsample to keep URL under Mapbox limit.
    // Route is rendered as 3 stacked path overlays (glow + dark border + main),
    // so polyline is repeated 3× in the URL — keep it tight.
    let pts = downsamplePoints(trackPoints, 200);
    pts = smoothPoints(pts, 2);
    pts = downsamplePoints(pts, 240);

    const color = config.accentColor.replace('#', '');
    const encodedPoly = encodeURIComponent(encodePolyline(pts));
    const w = Math.min(1280, Math.round(previewWidth));
    const h = Math.min(1280, Math.round(mapSectionHeight));

    const bg = config.backgroundColor.toLowerCase();
    const isDark = bg === '#000000' || bg === '#111111' || bg === '#0a0a0a';
    const styleId = isDark ? 'dark-v11' : 'light-v11';

    // Layered route: soft outer glow → dark stroke for contrast → bright main stroke.
    const overlay = isDark
      ? [
          `path-10+${color}-0.18(${encodedPoly})`,
          `path-6+050505(${encodedPoly})`,
          `path-4+${color}(${encodedPoly})`,
        ].join(',')
      : `path-3+${color}(${encodedPoly})`;

    const url =
      `https://api.mapbox.com/styles/v1/mapbox/${styleId}/static/` +
      `${overlay}/auto/${w}x${h}@2x` +
      `?access_token=${mapboxToken}&logo=false&attribution=false&padding=40`;

    console.log('[summaryMapUrl]', { length: url.length, w, h, pts: pts.length, polyLen: encodedPoly.length });
    return url;
  }, [config.layout, trackPoints, mapboxToken, previewWidth, mapSectionHeight, config.accentColor, config.backgroundColor, config.showDataOverlay]);

  // Smoothed track for minimal layout
  const smoothedTrack = useMemo(() => {
    if (trackPoints.length < 2) return [];
    let pts = downsamplePoints(trackPoints, 200);
    pts = smoothPoints(pts, 2);
    return pts;
  }, [trackPoints]);

  const trackAreaHeight = config.showDataOverlay ? mapSectionHeight : previewHeight;

  // White poster border
  const posterBorder = Math.round(previewWidth * 0.04);
  const innerWidth = previewWidth - 2 * posterBorder;
  const innerHeight = previewHeight - 2 * posterBorder;
  const innerOverlayHeight = Math.round(innerHeight * overlayFraction);
  const innerMapSectionHeight = Math.round(innerHeight - innerOverlayHeight);

  // Shared poster mat style (mirrors App.tsx editor)
  const posterMatStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    width: previewWidth,
    height: previewHeight,
    padding: posterBorder,
    boxShadow: '0 22px 60px rgba(31,35,40,0.12)',
    border: '1px solid rgba(34,39,51,0.08)',
  };

  const formatBadge = (
    <div style={{
      position: 'absolute',
      bottom: -14,
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#FAF6EF',
      color: '#9CA3AF',
      fontSize: 11,
      fontWeight: 500,
      padding: '4px 14px',
      borderRadius: 999,
      border: '1px solid #E3DBCF',
      boxShadow: '0 1px 2px rgba(31,36,48,0.04)',
      whiteSpace: 'nowrap',
      zIndex: 10,
    }}>
      {config.format} · {config.orientation === 'vertical' ? 'Portrait' : 'Landscape'}
    </div>
  );

  return (
    <div style={{
      height: '100vh',
      backgroundColor: '#F7F1E8',
      overflow: 'hidden',
      display: 'flex',
      padding: '20px',
      gap: '20px',
      boxSizing: 'border-box',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* ── Submission overlay ──────────────────────────────────────────────────── */}
      {submitting && (
        <>
          {/* Subtle full-screen dimming */}
          <div
            className="fixed inset-0 z-40 pointer-events-none transition-opacity duration-300"
            style={{ background: 'rgba(255,255,255,0.30)' }}
          />
          {/* Indeterminate progress bar at top edge */}
          <div
            className="fixed top-0 left-0 right-0 z-50 overflow-hidden"
            style={{ height: 3 }}
          >
            {/* track */}
            <div className="absolute inset-0" style={{ background: 'rgba(249,115,22,0.18)' }} />
            {/* moving fill */}
            <div
              className="absolute top-0 h-full rounded-full"
              style={{
                width: '42%',
                background: 'rgb(249,115,22)',
                animation: 'poster-progress 1.5s cubic-bezier(0.4,0,0.2,1) infinite',
              }}
            />
          </div>
          <style>{`
            @keyframes poster-progress {
              0%   { left: -42%; }
              100% { left: 142%; }
            }
          `}</style>
        </>
      )}
      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, gap: 'inherit', overflow: 'hidden', height: '100%' }}>
        {/* Left: Poster Preview Stage */}
        <div
          ref={previewContainerRef}
          style={{
            flex: 1,
            height: '100%',
            backgroundColor: '#EAE2D6',
            borderRadius: 20,
            border: '1px solid #E3DBCF',
            boxShadow: '0 12px 30px rgba(31,36,48,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            overflow: 'hidden',
          }}
        >
          {config.layout === 'minimal' ? (
            <div className="relative">
              <div style={posterMatStyle}>
                <MinimalPosterPreview
                  trackPoints={trackPoints}
                  title={config.title}
                  overlayData={config.overlayData}
                  accentColor={config.accentColor}
                  width={innerWidth}
                  height={innerHeight}
                />
              </div>
              {formatBadge}
            </div>
          ) : config.layout === 'photo' && photoUrl ? (
            <div className="relative">
              <div style={posterMatStyle}>
                <PhotoPosterPreview
                  photoUrl={photoUrl}
                  title={config.title}
                  trackPoints={trackPoints}
                  overlayData={config.overlayData}
                  accentColor={config.accentColor}
                  labelColor={config.textColor}
                  valueColor={config.backgroundColor}
                  fontFamily={config.fontFamily}
                  width={innerWidth}
                  height={innerHeight}
                  statsVisible={photoStatsVisible}
                  visibleStats={photoVisibleStats || new Set(['distance', 'speed', 'date'])}
                  titleFont={config.photoTitleFont}
                  brightness={config.photoBrightness}
                  contrast={config.photoContrast}
                  saturation={config.photoSaturation}
                  trackThickness={config.photoTrackThickness}
                />
              </div>
              {formatBadge}
            </div>
          ) : (
            <div className="relative">
              <div style={posterMatStyle}>
                <div
                  className="relative overflow-hidden"
                  style={{
                    backgroundColor: config.backgroundColor,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    height: config.showDataOverlay ? `${innerMapSectionHeight}px` : '100%',
                    overflow: 'hidden',
                  }}>
                    {summaryMapUrl && (
                      <MapImage
                        src={summaryMapUrl}
                        className="absolute inset-0 w-full h-full object-cover z-0"
                      />
                    )}
                    {!config.showDataOverlay && (
                      <div className={`relative z-20 h-full p-8 flex flex-col ${getLayoutClasses()}`}>
                        <div className="flex-1 flex flex-col justify-end">
                          <h1
                            className="mb-3"
                            style={{
                              color: config.accentColor,
                              fontFamily: config.fontFamily,
                              fontSize: `${fontSizes.title}px`,
                              fontWeight: '700',
                              lineHeight: '1.1',
                            }}
                          >
                            {config.title}
                          </h1>
                        </div>
                      </div>
                    )}
                  </div>
                  {config.showDataOverlay && (
                    <DataOverlay
                      title={config.title}
                      data={config.overlayData}
                      backgroundColor={config.backgroundColor}
                      textColor={config.textColor}
                      fontFamily={config.fontFamily}
                      width={innerWidth}
                      height={innerOverlayHeight}
                      accentColor={config.accentColor}
                    />
                  )}
                </div>
              </div>
              {formatBadge}
            </div>
          )}
        </div>

        {/* Right: Summary & Checkout panel */}
        <div style={{
          width: 400,
          minWidth: 340,
          height: '100%',
          backgroundColor: '#FAF6EF',
          borderRadius: 20,
          border: '1px solid #E3DBCF',
          boxShadow: '0 12px 30px rgba(31,36,48,0.07)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Heading */}
            <div>
              <h1 style={{
                fontSize: 28,
                fontWeight: 700,
                color: '#1F2328',
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                marginBottom: 8,
              }}>
                You made it!
              </h1>
              <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.5, margin: 0 }}>
                Your poster looks beautiful. Confirm below to send it to print.
              </p>
            </div>

            {/* Review checkbox card */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '16px 18px',
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid #E8DED2',
            }}>
              <Checkbox
                id="review"
                checked={isReviewed}
                onCheckedChange={(checked) => setIsReviewed(checked as boolean)}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <label htmlFor="review" style={{
                fontSize: 13,
                color: '#1F2328',
                lineHeight: 1.5,
                cursor: 'pointer',
              }}>
                I have reviewed the file and am happy to print
              </label>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onBack}
                className="editor-btn-secondary"
                style={{ flex: 1, height: 48, fontSize: 14, fontWeight: 600 }}
              >
                ← Back
              </button>
              <button
                onClick={handleCheckout}
                disabled={!isReviewed || submitting}
                className="editor-cta"
                style={{
                  flex: 2,
                  opacity: (!isReviewed || submitting) ? 0.5 : 1,
                  cursor: (!isReviewed || submitting) ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                {submitting ? 'Creating…' : 'Confirm →'}
              </button>
            </div>

            {errorMsg && (
              <div style={{ fontSize: 13, color: '#d4183d' }}>{errorMsg}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
