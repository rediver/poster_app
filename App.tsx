import React, { useMemo, useState } from 'react';
import { DataImportScreen } from './components/DataImportScreen';
import { StravaActivitiesScreen } from './components/StravaActivitiesScreen';
import { PosterEditor } from './components/PosterEditor';
import { SummaryScreen } from './components/SummaryScreen';
import { encodePolyline } from './components/RoutePreview';
import { MapImage } from './components/MapImage';
import { logModule, useLogMount, logInfo, DEBUG_LOAD } from './src/debug';
logModule('App.tsx module');

type LatLng = [number, number];

interface PosterConfig {
  title: string;
  subtitle: string;
  fontFamily: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  layout: 'map' | 'modern' | 'minimal';
  showAlphabet: boolean;
  format: 'A3' | 'A4';
  orientation: 'vertical' | 'horizontal';
  mapZoom?: number;
}

type AppScreen = 'import' | 'strava-activities' | 'editor' | 'summary';

export default function App() {
  useLogMount('App component');
const [currentScreen, setCurrentScreen] = useState<AppScreen>('import');
  const [trackPoints, setTrackPoints] = useState<LatLng[]>([]);
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
    subtitle: 'A neo-grotesque or realist design, one of the most popular typefaces in the world',
    fontFamily: 'Helvetica, Arial, sans-serif',
    backgroundColor: '#ffffff',
    textColor: '#000000',
    accentColor: '#ff6b35',
    layout: 'map',
    showAlphabet: false,
    format: 'A4',
    orientation: 'vertical',
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
      subtitle: '',
    }));
    setCurrentScreen('editor');
  };

  const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || '';

  type ActivitySelection = { titleSuggestion?: string; subtitleSuggestion?: string; activityId?: string | number };
  const handleActivitySelected = async (selection: ActivitySelection) => {
    // Prefill title/subtitle
    setConfig((prev) => ({
      ...prev,
      title: (selection && selection.titleSuggestion) || '',
      subtitle: (selection && selection.subtitleSuggestion) || '',
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

  // Layout classes for poster preview
  const getLayoutClasses = () => {
    switch (config.layout) {
      case 'modern':
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

  const alphabetText = "ABCD\nEFGHIJK\nLMNOP\nQRSTUV\nWXYZ";

  // Build Mapbox static URL with route drawn via path overlay (same as StravaActivitiesScreen)
  const mapboxToken = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || '';

  const editorMapUrl = useMemo(() => {
    if (config.layout !== 'map' || trackPoints.length < 2 || !mapboxToken) return '';

    // Downsample to keep URL under Mapbox's 8192-char limit
    let pts = trackPoints;
    const maxPts = 300;
    if (pts.length > maxPts) {
      const step = (pts.length - 1) / (maxPts - 1);
      pts = Array.from({ length: maxPts }, (_, i) =>
        trackPoints[Math.round(i * step)]
      );
      pts.push(trackPoints[trackPoints.length - 1]);
    }

    const color = config.accentColor.replace('#', '');
    const encodedPoly = encodeURIComponent(encodePolyline(pts));
    const w = Math.min(1280, Math.round(previewWidth));
    const h = Math.min(1280, Math.round(previewHeight));

    const isDark =
      config.backgroundColor === '#000000' ||
      config.backgroundColor.toLowerCase() === '#111111';
    const styleId = isDark ? 'dark-v11' : 'light-v11';

    return (
      `https://api.mapbox.com/styles/v1/mapbox/${styleId}/static/` +
      `path-3+${color}(${encodedPoly})/auto/${w}x${h}@2x` +
      `?access_token=${mapboxToken}&logo=false&attribution=false&padding=40`
    );
  }, [config.layout, trackPoints, mapboxToken, previewWidth, previewHeight, config.accentColor, config.backgroundColor]);

  // Adjust font sizes for editor preview
  const getFontSizes = () => {
    const baseMultiplier = config.format === 'A3' ? 1.4 : 1.2;
    const orientationMultiplier = config.orientation === 'horizontal' ? 0.85 : 1;
    
    return {
      alphabet: Math.round(18 * baseMultiplier * orientationMultiplier),
      title: Math.round(28 * baseMultiplier * orientationMultiplier),
      subtitle: Math.round(12 * baseMultiplier * orientationMultiplier)
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
    return <SummaryScreen config={config} trackPoints={trackPoints} onBack={handleBackToEditor} />;
  }

  // Show poster editor (default)
  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      {/* Main content */}
      <div className="flex h-full">
        {/* Left side - Large Poster Preview (fixed) */}
        <div ref={previewContainerRef} className="flex-1 h-full bg-white border-r border-gray-200 flex items-center justify-center p-8 overflow-hidden">
          <div className="relative">
            <div 
              className="relative border-2 border-gray-300 shadow-xl overflow-hidden"
              style={{ 
                backgroundColor: config.layout === 'map' ? '#ffffff' : config.backgroundColor,
                width: `${previewWidth}px`,
                height: `${previewHeight}px`
              }}
>
              {/* Map + route rendered by Mapbox as single image (same as activities screen) */}
              {editorMapUrl && (
                <MapImage
                  src={editorMapUrl}
                  className="absolute inset-0 w-full h-full object-cover z-0"
                />
              )}
              <div className={`relative z-20 h-full p-6 flex flex-col ${getLayoutClasses()}`}>
                <div className="flex-1 flex flex-col justify-end">
                  <h1 
                    className="mb-2"
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
                  
                  {config.subtitle && (
                    <p 
                      style={{ 
                        color: config.textColor,
                        fontFamily: config.fontFamily,
                        fontSize: `${fontSizes.subtitle}px`,
                        lineHeight: '1.3'
                      }}
                    >
                      {config.subtitle}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Format and orientation indicator */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
              {config.format} - {config.orientation}
            </div>
          </div>
        </div>

        {/* Right side - Editor (scrollable) */}
        <div className="w-[480px] bg-white h-full overflow-y-auto">
          <PosterEditor
            config={config}
            onConfigChange={setConfig}
            onSummary={handleSummary}
          />
        </div>
      </div>
    </div>
  );
}