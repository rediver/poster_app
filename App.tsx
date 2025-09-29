import React, { useState } from 'react';
import { DataImportScreen } from './components/DataImportScreen';
import { StravaActivitiesScreen } from './components/StravaActivitiesScreen';
import { PosterEditor } from './components/PosterEditor';
import { SummaryScreen } from './components/SummaryScreen';
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
  }, []);
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
    showAlphabet: true,
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

  const handleActivitySelected = async (selection) => {
    // Prefill title/subtitle
    setConfig((prev) => ({
      ...prev,
      title: (selection && selection.titleSuggestion) || '',
      subtitle: (selection && selection.subtitleSuggestion) || '',
    }));

    // Try to fetch GPX for the activity, parse to trackPoints
    if (selection && selection.activityId) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/strava/download_gpx/${selection.activityId}`, {
          credentials: 'include'
        });
        if (res.ok) {
          const gpxText = await res.text();
          const parser = new DOMParser();
          const xml = parser.parseFromString(gpxText, 'application/xml');
          const trkpts = Array.from(xml.getElementsByTagName('trkpt'));
          const points: LatLng[] = trkpts.map((el) => [
            parseFloat(el.getAttribute('lat') || '0'),
            parseFloat(el.getAttribute('lon') || '0'),
          ]).filter(([lat, lon]) => !Number.isNaN(lat) && !Number.isNaN(lon));
          if (points.length > 1) setTrackPoints(points);
        }
      } catch (e) {
        console.warn('Failed to fetch/parse GPX:', e);
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

  // Simple zoom factor for map layout (1 = bbox w/ 5% padding). Higher => more zoomed-in (less padding)
  const [mapZoom, setMapZoom] = useState<number>((config as any).mapZoom ?? 1.5);

  // Sync mapZoom with config.mapZoom so slider in editor controls it
  React.useEffect(() => {
    const v = (config as any).mapZoom;
    if (typeof v === 'number') setMapZoom(v);
  }, [config]);

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
    <div className="min-h-screen bg-gray-50">
      {/* Main content */}
      <div className="flex min-h-screen">
        {/* Left side - Large Poster Preview */}
        <div ref={previewContainerRef} className="flex-1 bg-white border-r border-gray-200 flex items-center justify-center p-8">
          <div className="relative">
            <div 
              className="relative border-2 border-gray-300 shadow-xl"
              style={{ 
                backgroundColor: config.layout === 'map' ? '#ffffff' : config.backgroundColor,
                width: `${previewWidth}px`,
                height: `${previewHeight}px`
              }}
>
              {/* Mapbox background for map layout; center map dynamically on route centroid */}
              {config.layout === 'map' && trackPoints.length > 1 && (() => {
                const lats = trackPoints.map(p => p[0]);
                const lons = trackPoints.map(p => p[1]);
                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);
                const minLon = Math.min(...lons);
                const maxLon = Math.max(...lons);
                // Center of route
                const centerLat = (minLat + maxLat) / 2;
                const centerLon = (minLon + maxLon) / 2;
                // Calculate proper padding based on the mapZoom slider
                // mapZoom controls how much padding around the track (1.5 = default, 3 = tight, 0.5 = loose)
                const paddingFactor = 0.15 / mapZoom; // More zoom = less padding
                const latPad = (maxLat - minLat) * paddingFactor || 0.001;
                const lonPad = (maxLon - minLon) * paddingFactor || 0.001;
                const minLatP = minLat - latPad;
                const maxLatP = maxLat + latPad;
                const minLonP = minLon - lonPad;
                const maxLonP = maxLon + lonPad;
                
                // Calculate zoom level that fits the padded bounds
                // Mapbox zoom calculation: zoom = log2(360 / degrees_span) - adjustment
                const dLat = (maxLatP - minLatP) || 0.01;
                const dLon = (maxLonP - minLonP) || 0.01;
                
                // Account for Web Mercator projection distortion at this latitude
                const avgLat = centerLat;
                const latRadians = avgLat * Math.PI / 180;
                const mercatorAdjustment = Math.cos(latRadians);
                
                // Calculate zoom for each dimension
                // Subtract 1 to add margin for better framing
                const latZoom = Math.log2(180 / dLat) - 1;
                const lonZoom = Math.log2(360 / (dLon / mercatorAdjustment)) - 1;
                
                // Use the more restrictive zoom to ensure track fits
                const aspect = previewWidth / previewHeight;
                const bboxAspect = (dLon * mercatorAdjustment) / dLat;
                
                let zoom: number;
                if (bboxAspect > aspect) {
                  // Track is wider than canvas aspect - constrain by longitude
                  zoom = lonZoom;
                } else {
                  // Track is taller than canvas aspect - constrain by latitude  
                  zoom = latZoom;
                }
                
                // Apply final adjustment based on mapZoom slider
                zoom = zoom + (mapZoom - 1.5) * 0.5; // Slider affects zoom level
                
                // Clamp to reasonable Mapbox zoom range
                zoom = Math.max(1, Math.min(18, zoom));

                // Use a monochromatic style that matches the current color scheme
                // Use light style for light backgrounds, dark style for dark backgrounds
                const isDark = config.backgroundColor === '#000000' || config.backgroundColor.toLowerCase() === '#111111';
                const styleId = isDark ? 'mapbox/dark-v11' : 'mapbox/light-v11';
                const sizeW = Math.round(previewWidth);
                const sizeH = Math.round(previewHeight);
                const center = `${centerLon},${centerLat}`;
                const url = `${BACKEND_URL}/api/mapbox/static?style=${encodeURIComponent(styleId)}&center=${encodeURIComponent(center)}&zoom=${encodeURIComponent(String(zoom))}&w=${sizeW}&h=${sizeH}`;
                return (
                  <img src={url} alt="map" className="absolute inset-0 w-full h-full object-fill z-0" />
                );
              })()}

              {/* GPX track overlay */}
              {trackPoints.length > 1 && (
                <svg
                  className="absolute inset-0 pointer-events-none z-10"
                  width={previewWidth}
                  height={previewHeight}
                  viewBox={`0 0 ${previewWidth} ${previewHeight}`}
                >
                  {(() => {
                    const lats = trackPoints.map(p => p[0]);
                    const lons = trackPoints.map(p => p[1]);
                    const minLat = Math.min(...lats);
                    const maxLat = Math.max(...lats);
                    const minLon = Math.min(...lons);
                    const maxLon = Math.max(...lons);
                    const padLat = (maxLat - minLat) * 0.05 || 0.001;
                    const padLon = (maxLon - minLon) * 0.05 || 0.001;
                    const minLatP = minLat - padLat;
                    const maxLatP = maxLat + padLat;
                    const minLonP = minLon - padLon;
                    const maxLonP = maxLon + padLon;
                    const toXY = (lat: number, lon: number) => {
                      const x = (lon - minLonP) / (maxLonP - minLonP) * (previewWidth - 1);
                      const y = (maxLatP - lat) / (maxLatP - minLatP) * (previewHeight - 1);
                      return [x, y] as [number, number];
                    };
                    const d = trackPoints.map(([lat, lon], i) => {
                      const [x, y] = toXY(lat, lon);
                      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(' ');
                    return (
                      <path d={d} fill="none" stroke={config.accentColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    );
                  })()}
                </svg>
              )}
              <div className={`relative z-20 h-full p-6 flex flex-col ${getLayoutClasses()}`}>
                {config.showAlphabet && (
                  <div className="mb-4">
                    <pre 
                      className="whitespace-pre-wrap"
                      style={{ 
                        color: config.textColor,
                        fontFamily: config.fontFamily,
                        fontSize: `${fontSizes.alphabet}px`,
                        lineHeight: '1.1',
                        fontWeight: '600'
                      }}
                    >
                      {alphabetText}
                    </pre>
                  </div>
                )}
                
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

        {/* Right side - Editor */}
        <div className="w-[480px] bg-white overflow-y-auto">
          <PosterEditor
            config={config}
            onConfigChange={(c) => {
              setConfig(c);
              if (typeof (c as any).mapZoom === 'number') setMapZoom((c as any).mapZoom);
            }}
            onSummary={handleSummary}
          />
        </div>
      </div>
    </div>
  );
}