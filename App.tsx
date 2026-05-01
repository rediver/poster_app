import React, { useMemo, useState, useCallback } from 'react';
import { DataImportScreen } from './components/DataImportScreen';
import { StravaActivitiesScreen } from './components/StravaActivitiesScreen';
import { PosterEditor } from './components/PosterEditor';
import { SummaryScreen } from './components/SummaryScreen';
import { PhotoUploadStep } from './components/PhotoUploadStep';
import { PhotoPosterPreview } from './components/PhotoPosterPreview';
import { encodePolyline, smoothPoints, downsamplePoints } from './components/RoutePreview';
import { MapImage } from './components/MapImage';
import { DataOverlay, OverlayData } from './components/DataOverlay';
import { TrackSvg } from './components/TrackSvg';
import { MinimalPosterPreview } from './components/MinimalPosterPreview';
import { logModule, useLogMount, logInfo, DEBUG_LOAD } from './src/debug';
logModule('App.tsx module');

type LatLng = [number, number];

interface PosterConfig {
  title: string;
  fontFamily: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  layout: 'map' | 'photo' | 'minimal';
  showAlphabet: boolean;
  format: 'A3' | 'A4';
  orientation: 'vertical' | 'horizontal';
  mapZoom?: number;
  showDataOverlay: boolean;
  overlayData: OverlayData;
  visibleStatKeys?: string[];
  // Photo-mode editorial settings
  photoTitleFont?: string;
  photoBrightness?: number;
  photoContrast?: number;
  photoSaturation?: number;
  photoTrackThickness?: number;
}

type AppScreen = 'import' | 'strava-activities' | 'editor' | 'summary';

export default function App() {
  useLogMount('App component');
const [currentScreen, setCurrentScreen] = useState<AppScreen>('import');
  const [trackPoints, setTrackPoints] = useState<LatLng[]>([]);
  const [activityId, setActivityId] = useState<string>('');
  // Photo layout state
  const [photoUrl, setPhotoUrl] = useState<string>('');
  // Preview container sizing
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
    // ResizeObserver when available for smoother updates
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    } else {
      window.addEventListener('resize', update);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', update);
    };
  }, [currentScreen]);
  // Detect auth callback from backend
  React.useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.includes('strava=authenticated')) {
      if (DEBUG_LOAD) logInfo('Detected Strava auth hash; switching to activities screen');
      setCurrentScreen('strava-activities');
      // Clean hash so refreshes don't re-trigger
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      if (DEBUG_LOAD) logInfo('No Strava auth hash on load', { hash });
    }
  }, []);
  const [config, setConfig] = useState<PosterConfig>({
    title: 'Helvetica',
    fontFamily: 'Helvetica, Arial, sans-serif',
    backgroundColor: '#ffffff',
    textColor: '#000000',
    accentColor: '#ff6b35',
    layout: 'map',
    showAlphabet: false,
    format: 'A3',
    orientation: 'vertical',
    showDataOverlay: true,
    overlayData: {},
    visibleStatKeys: ['distance', 'speed', 'date'],
    photoTitleFont: "'Cormorant Garamond', serif",
    photoBrightness: 0.87,
    photoContrast: 1.10,
    photoSaturation: 0.83,
  });

  const handleStravaSelected = () => {
    setCurrentScreen('strava-activities');
  };

const handleGpxImported = (points: LatLng[]) => {
    setTrackPoints(points);
    // Clear sample text when user brings real data into the editor
    setConfig((prev) => ({
      ...prev,
      title: '',
    }));
    setCurrentScreen('editor');
  };

  const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || '';

  type ActivitySelection = { titleSuggestion?: string; activityId?: string | number; overlayData?: OverlayData };
  const handleActivitySelected = async (selection: ActivitySelection) => {
    if (selection?.activityId) {
      setActivityId(String(selection.activityId));
    }
    setConfig((prev) => ({
      ...prev,
      title: (selection && selection.titleSuggestion) || '',
      overlayData: (selection && selection.overlayData) || {},
    }));

    // Try to fetch GPX for the activity, parse to trackPoints
    if (selection && selection.activityId) {
      try {
        const headers: Record<string, string> = {};
        try {
          const authDataStr = localStorage.getItem('strava_auth');
          if (authDataStr) {
            const authData = JSON.parse(authDataStr);
            if (authData && authData.access_token) {
              headers['Authorization'] = `Bearer ${authData.access_token}`;
            }
          }
        } catch (e) {
          console.warn('Failed to parse strava_auth from localStorage:', e);
        }
        const url = `${BACKEND_URL}/api/strava/download_gpx/${selection.activityId}`;
        const hasToken = Boolean(headers['Authorization']);
        console.log('GPX fetch start', { url, hasToken, BACKEND_URL });
        const res = await fetch(url, {
          credentials: 'include',
          headers
        });
        if (res.ok) {
          const gpxText = await res.text();
          const parser = new DOMParser();
          const xml = parser.parseFromString(gpxText, 'application/xml');
          const trkpts = Array.from(xml.getElementsByTagName('trkpt'));
          const points: LatLng[] = trkpts
            .map((el) => [
              parseFloat(el.getAttribute('lat') || '0'),
              parseFloat(el.getAttribute('lon') || '0'),
            ] as LatLng)
            .filter(([lat, lon]) => !Number.isNaN(lat) && !Number.isNaN(lon));
          console.log('GPX fetched & parsed', { count: points.length });
          if (points.length > 1) setTrackPoints(points);
        } else {
          const body = await res.text().catch(() => '');
          console.error('GPX fetch failed', { status: res.status, body: body.slice(0, 300) });
        }
      } catch (e) {
        console.error('Failed to fetch/parse GPX:', e);
      }
    }

    setCurrentScreen('editor');
  };

  const handleSummary = () => {
    setCurrentScreen('summary');
  };

  const handleBackToEditor = () => {
    setCurrentScreen('editor');
  };

  // Photo layout handlers
  const handlePhotoUploaded = useCallback((url: string) => {
    setPhotoUrl(url);
  }, []);

  // Layout classes for poster preview
  const getLayoutClasses = () => {
    switch (config.layout) {
      case 'photo':
        return 'justify-between';
      case 'minimal':
        return 'justify-center items-center';
      case 'map':
        return 'justify-start';
      default:
        return 'justify-start';
    }
  };

  // Calculate poster dimensions for editor preview (dynamic scale to maximize area)
  const getDimensions = () => {
    const isVertical = config.orientation === 'vertical';
    const base = config.format === 'A3'
      ? { width: isVertical ? 420 : 594, height: isVertical ? 594 : 420 }
      : { width: isVertical ? 297 : 420, height: isVertical ? 420 : 297 };

    // Compute scale to fit within available container while keeping aspect ratio
    let scale = 1;
    if (containerSize.w && containerSize.h) {
      const availW = Math.max(100, containerSize.w - 48); // account for padding
      const availH = Math.max(100, containerSize.h - 48);
      scale = Math.min(availW / base.width, availH / base.height) * 0.92; // small margin
    } else {
      // Fallback reasonable scales
      scale = config.format === 'A3' ? 1.2 : 1.4;
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

  // White poster border
  const posterBorder = Math.round(previewWidth * 0.04);
  const innerWidth = previewWidth - 2 * posterBorder;
  const innerHeight = previewHeight - 2 * posterBorder;
  const innerOverlayHeight = Math.round(innerHeight * overlayFraction);
  const innerMapSectionHeight = Math.round(innerHeight - innerOverlayHeight);

  const alphabetText = "ABCD\nEFGHIJK\nLMNOP\nQRSTUV\nWXYZ";

  // Build Mapbox static URL with route drawn via path overlay (same as StravaActivitiesScreen)
  const mapboxToken = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || '';

  console.log('[MAP DEBUG] render state', {
    layout: config.layout,
    trackPointsCount: trackPoints.length,
    hasToken: !!mapboxToken,
    tokenPreview: mapboxToken ? mapboxToken.slice(0, 10) + '...' : '(empty)',
    previewWidth: Math.round(previewWidth),
    mapSectionHeight,
    showDataOverlay: config.showDataOverlay,
    currentScreen,
  });

  const editorMapUrl = useMemo(() => {
    // Log each guard condition separately
    if (config.layout !== 'map') {
      console.log('[MAP DEBUG] editorMapUrl skipped: layout is', config.layout, '(not map)');
      return '';
    }
    if (trackPoints.length < 2) {
      console.log('[MAP DEBUG] editorMapUrl skipped: trackPoints.length =', trackPoints.length);
      return '';
    }
    if (!mapboxToken) {
      console.log('[MAP DEBUG] editorMapUrl skipped: mapboxToken is empty');
      return '';
    }

    // Downsample → smooth → re-downsample to keep URL under Mapbox limit.
    // We render the route as 3 stacked path overlays (glow + dark border + main),
    // so polyline is repeated 3× in the URL — keep it tight.
    let pts = downsamplePoints(trackPoints, 200);
    pts = smoothPoints(pts, 2);
    pts = downsamplePoints(pts, 240);

    const color = config.accentColor.replace('#', '');
    const rawPoly = encodePolyline(pts);
    const encodedPoly = encodeURIComponent(rawPoly);
    const w = Math.min(1280, Math.round(previewWidth));
    const h = Math.min(1280, Math.round(mapSectionHeight));

    const bg = config.backgroundColor.toLowerCase();
    const isDark = bg === '#000000' || bg === '#111111' || bg === '#0a0a0a';
    const styleId = isDark ? 'dark-v11' : 'light-v11';

    // Layered route: soft outer glow → dark stroke for contrast → bright main stroke.
    // Mapbox path overlay: path-{strokeWidth}+{color}-{opacity}(polyline)
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

    console.log('[MAP DEBUG] editorMapUrl BUILT', {
      urlLength: url.length,
      imgSize: `${w}x${h}`,
      style: styleId,
      ptsIn: trackPoints.length,
      ptsOut: pts.length,
      rawPolyLen: rawPoly.length,
      encodedPolyLen: encodedPoly.length,
      sampleCoords: trackPoints.slice(0, 3),
      urlStart: url.slice(0, 150),
    });
    return url;
  }, [config.layout, trackPoints, mapboxToken, previewWidth, mapSectionHeight, config.accentColor, config.backgroundColor, config.showDataOverlay]);

  // Smoothed track for minimal layout (no map, SVG only)
  const smoothedTrack = useMemo(() => {
    if (trackPoints.length < 2) return [];
    let pts = downsamplePoints(trackPoints, 200);
    pts = smoothPoints(pts, 2);
    return pts;
  }, [trackPoints]);

  const trackAreaHeight = config.showDataOverlay ? mapSectionHeight : previewHeight;

  // Adjust font sizes
  const getFontSizes = () => {
    const baseMultiplier = 1.4;
    const orientationMultiplier = config.orientation === 'horizontal' ? 0.85 : 1;
    
    return {
      title: Math.round(28 * baseMultiplier * orientationMultiplier),
    };
  };

  const fontSizes = getFontSizes();

  // Show data import screen
  if (currentScreen === 'import') {
    return (
      <DataImportScreen 
        onStravaSelected={handleStravaSelected}
        onGpxImported={handleGpxImported}
      />
    );
  }

  // Show Strava activities screen
  if (currentScreen === 'strava-activities') {
    return <StravaActivitiesScreen posterConfig={config} onActivitySelected={handleActivitySelected} />;
  }


  // Show summary screen
  if (currentScreen === 'summary') {
    return (
      <SummaryScreen
        config={config}
        trackPoints={trackPoints}
        onBack={handleBackToEditor}
        activityId={activityId}
        photoUrl={config.layout === 'photo' ? photoUrl : undefined}
        photoStatsVisible={config.showDataOverlay}
        photoVisibleStats={new Set(config.visibleStatKeys || [])}
      />
    );
  }

  // Show poster editor (default)
  const isPhotoLayout = config.layout === 'photo';

  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      {/* Main content */}
      <div className="flex h-full">
        {/* Left side - Large Poster Preview (fixed) */}
        <div ref={previewContainerRef} className="flex-1 h-full bg-white border-r border-gray-200 flex items-center justify-center p-8 overflow-hidden">
          {isPhotoLayout && photoUrl ? (
            /* Photo poster composite preview */
            <div style={{
              width: previewWidth,
              height: previewHeight,
              backgroundColor: '#ffffff',
              padding: posterBorder,
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06)',
            }}>
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
                statsVisible={config.showDataOverlay}
                visibleStats={new Set(config.visibleStatKeys || [])}
                titleFont={config.photoTitleFont}
                brightness={config.photoBrightness}
                contrast={config.photoContrast}
                saturation={config.photoSaturation}
                trackThickness={config.photoTrackThickness}
              />
            </div>
          ) : isPhotoLayout && !photoUrl ? (
            /* Inline photo upload drop zone */
            <PhotoUploadStep
              activityName={config.title || undefined}
              activityDate={config.overlayData?.date || undefined}
              onPhotoUploaded={handlePhotoUploaded}
              onBack={() => setConfig((prev) => ({ ...prev, layout: 'map' }))}
              inline
            />
          ) : config.layout === 'minimal' ? (
          /* ── Minimal: Scandinavian editorial ── */
          <div className="relative">
            <div style={{
              width: previewWidth,
              height: previewHeight,
              backgroundColor: '#ffffff',
              padding: posterBorder,
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06)',
            }}>
              <MinimalPosterPreview
                trackPoints={trackPoints}
                title={config.title}
                overlayData={config.overlayData}
                accentColor={config.accentColor}
                width={innerWidth}
                height={innerHeight}
              />
            </div>
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
              {config.format} – {config.orientation}
            </div>
          </div>
          ) : (
          /* ── Map layout ── */
          <div className="relative">
            <div 
              style={{ 
                backgroundColor: '#ffffff',
                width: `${previewWidth}px`,
                height: `${previewHeight}px`,
                padding: posterBorder,
                boxShadow: '0 25px 60px -15px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06)',
              }}
            >
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
                {editorMapUrl ? (
                  <MapImage
                    src={editorMapUrl}
                    className="absolute inset-0 w-full h-full object-cover z-0"
                  />
                ) : (
                  <div className="absolute inset-0 z-0 flex items-center justify-center">
                    <span className="text-xs text-gray-300">
                      {`No map URL (track: ${trackPoints.length} pts, token: ${mapboxToken ? 'yes' : 'NO'})`}
                    </span>
                  </div>
                )}
                {!config.showDataOverlay && (
                  <div className={`relative z-20 h-full p-6 flex flex-col ${getLayoutClasses()}`}>
                    <div className="flex-1 flex flex-col justify-end">
                      <h1
                        className="mb-2"
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
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
              {config.format} - {config.orientation}
            </div>
          </div>
          )}
        </div>

        {/* Right side - Editor (scrollable) */}
        <div className="w-[480px] bg-white h-full overflow-y-auto">
          <PosterEditor
            config={config}
            onConfigChange={setConfig}
            onSummary={handleSummary}
            photoUrl={photoUrl}
            onClearPhoto={() => setPhotoUrl('')}
          />
        </div>
      </div>
    </div>
  );
}
