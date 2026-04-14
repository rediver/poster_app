import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

const SHOPIFY_VARIANT_ID = '53104872849750';
import { logModule, useLogMount } from '../src/debug';
logModule('components/SummaryScreen.tsx module');
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { encodePolyline, smoothPoints, downsamplePoints } from './RoutePreview';
import { MapImage } from './MapImage';
import { DataOverlay } from './DataOverlay';
import { TrackSvg } from './TrackSvg';

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
}

type LatLng = [number, number];

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
      // 1) Ask backend to compose and store the poster image on S3
      const backgroundType = config.layout === 'map' ? 'map' : (config.layout === 'photo' ? 'image' : 'solid');
      const isDark =
        config.backgroundColor === '#000000' ||
        config.backgroundColor.toLowerCase() === '#111111';
      const styleId = isDark ? 'mapbox/dark-v11' : 'mapbox/light-v11';

      // Attach Strava token so backend can fetch activity streams
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const authData = JSON.parse(localStorage.getItem('strava_auth') || '{}');
        if (authData?.access_token) {
          headers['Authorization'] = `Bearer ${authData.access_token}`;
        }
      } catch (_e) { /* ignore */ }

      const genRes = await fetch(`${BACKEND_URL}/api/save_poster_composed`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          activity_id: activityId,
          title: config.title,
          line_color: config.accentColor,
          solid_color: config.backgroundColor,
          background_type: backgroundType,
          style_id: styleId,
        })
      });
      const genData = await genRes.json().catch(() => ({}));
      if (!genRes.ok || !genData.image_url) {
        throw new Error(genData.error || `Render failed (${genRes.status})`);
      }

      // 2) Redirect to Shopify cart with the poster image
      const cartUrl = `https://cycling-app.myshopify.com/cart/${SHOPIFY_VARIANT_ID}:1?properties[Poster Image]=${encodeURIComponent(genData.image_url)}&properties[Title]=${encodeURIComponent(config.title || '')}`;
      window.location.href = cartUrl;
    } catch (e: any) {
      console.error('Confirm/create product failed', e);
      setErrorMsg(e?.message || 'Failed to create product');
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

    // Downsample → smooth → re-downsample to keep URL under Mapbox limit
    let pts = downsamplePoints(trackPoints, 200);
    pts = smoothPoints(pts, 2);
    pts = downsamplePoints(pts, 350);

    const color = config.accentColor.replace('#', '');
    const encodedPoly = encodeURIComponent(encodePolyline(pts));
    const w = Math.min(1280, Math.round(previewWidth));
    const h = Math.min(1280, Math.round(mapSectionHeight));

    const isDark =
      config.backgroundColor === '#000000' ||
      config.backgroundColor.toLowerCase() === '#111111';
    const styleId = isDark ? 'dark-v11' : 'light-v11';

    const url =
      `https://api.mapbox.com/styles/v1/mapbox/${styleId}/static/` +
      `path-3+${color}(${encodedPoly})/auto/${w}x${h}@2x` +
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content */}
      <div className="flex min-h-screen">
        {/* Left side - Large Poster Preview */}
        <div ref={previewContainerRef} className="flex-1 bg-white border-r border-gray-200 flex items-center justify-center p-12">
          {config.layout === 'photo' && photoUrl ? (
            /* Photo poster composite */
            <div className="relative overflow-hidden rounded-lg shadow-2xl" style={{ width: previewWidth, height: previewHeight }}>
              <img src={photoUrl} alt="Poster photo" className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 0 }} />
              {smoothedTrack.length >= 2 && (
                <div className="absolute inset-0" style={{ zIndex: 1, opacity: 0.8 }}>
                  <TrackSvg
                    points={smoothedTrack}
                    width={previewWidth}
                    height={previewHeight}
                    strokeColor={config.accentColor}
                    strokeWidth={Math.max(3, Math.round(previewWidth / 120))}
                  />
                </div>
              )}
              {photoStatsVisible && (() => {
                const vs = photoVisibleStats || new Set(['distance', 'speed', 'date']);
                const statDefs = [
                  { key: 'distance', label: 'DISTANCE' },
                  { key: 'elevation', label: 'ELEVATION' },
                  { key: 'speed', label: 'PACE' },
                  { key: 'date', label: 'DATE' },
                  { key: 'duration', label: 'TIME' },
                ] as const;
                const active = statDefs.filter(s => vs.has(s.key) && (config.overlayData as any)[s.key]);
                if (!active.length) return null;
                const fs = Math.max(10, Math.round(previewWidth / 40));
                const vs2 = Math.max(14, Math.round(previewWidth / 24));
                const pad = Math.max(8, Math.round(previewHeight / 30));
                return (
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center" style={{ zIndex: 2, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: `${pad * 2}px ${pad}px ${pad}px` }}>
                    {active.map((stat, i) => (
                      <React.Fragment key={stat.key}>
                        {i > 0 && <div className="mx-3" style={{ width: 1, height: vs2 + fs, backgroundColor: 'rgba(255,255,255,0.3)' }} />}
                        <div className="flex flex-col items-center">
                          <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: fs, fontWeight: 600, letterSpacing: '0.08em', fontFamily: 'monospace' }}>{stat.label}</span>
                          <span style={{ color: '#fff', fontSize: vs2, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.3 }}>{(config.overlayData as any)[stat.key]}</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
          <div className="relative">
            <div 
              className="relative border-2 border-gray-300 shadow-2xl overflow-hidden"
              style={{ 
                backgroundColor: config.layout === 'map' ? '#ffffff' : config.backgroundColor,
                width: `${previewWidth}px`,
                height: `${previewHeight}px`,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Map section */}
              <div style={{
                position: 'relative',
                width: '100%',
                height: config.showDataOverlay ? `${mapSectionHeight}px` : '100%',
                overflow: 'hidden',
              }}>
                {summaryMapUrl && (
                  <MapImage
                    src={summaryMapUrl}
                    className="absolute inset-0 w-full h-full object-cover z-0"
                  />
                )}
                {config.layout === 'minimal' && smoothedTrack.length >= 2 && (
                  <div className="absolute inset-0 z-0 flex items-center justify-center">
                    <TrackSvg
                      points={smoothedTrack}
                      width={previewWidth}
                      height={trackAreaHeight}
                      strokeColor={config.accentColor}
                      strokeWidth={Math.max(2, Math.round(previewWidth / 150))}
                    />
                  </div>
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
                          lineHeight: '1.1'
                        }}
                      >
                        {config.title}
                      </h1>
                    </div>
                  </div>
                )}
              </div>

              {/* Data overlay */}
              {config.showDataOverlay && (
                <DataOverlay
                  title={config.title}
                  data={config.overlayData}
                  backgroundColor={config.backgroundColor}
                  textColor={config.textColor}
                  fontFamily={config.fontFamily}
                  width={previewWidth}
                  height={overlayHeight}
                />
              )}
            </div>
            
            {/* Format and orientation indicator */}
            <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-sm text-gray-500 bg-white px-3 py-1 rounded shadow">
              {config.format} - {config.orientation}
            </div>
          </div>
          )}
        </div>

        {/* Right side - Summary and Checkout */}
        <div className="w-[480px] bg-white flex flex-col justify-center p-8">
          <div className="max-w-md mx-auto w-full space-y-8">
            <div className="space-y-4">
              <h1>You made it!</h1>
              <p className="text-muted-foreground">
                congratulations on making a poster, it will definitely look beautiful! you have two last choices and it's ready
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="review"
                  checked={isReviewed}
                  onCheckedChange={(checked) => setIsReviewed(checked as boolean)}
                  className="mt-1"
                />
                <label 
                  htmlFor="review" 
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  I have review the file and am happy to print
                </label>
              </div>

              <div className="flex space-x-3">
                <Button 
                  onClick={onBack}
                  variant="outline"
                  className="flex-1 h-12"
                >
                  Back
                </Button>
                
                <Button 
                  onClick={handleCheckout}
                  disabled={!isReviewed || submitting}
                  className="flex-1 h-12 bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {submitting && (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    )}
                    {submitting ? 'Creating…' : 'Confirm'}
                  </span>
                </Button>
              </div>
            </div>

            {errorMsg && (
              <div className="text-sm text-red-600 mt-2">{errorMsg}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
