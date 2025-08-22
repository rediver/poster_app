import React, { useState } from 'react';
import { DataImportScreen } from './components/DataImportScreen';
import { StravaActivitiesScreen } from './components/StravaActivitiesScreen';
import { PosterEditor } from './components/PosterEditor';
import { SummaryScreen } from './components/SummaryScreen';
import { logModule, useLogMount } from './src/debug';
logModule('App.tsx module');

type LatLng = [number, number];

interface PosterConfig {
  title: string;
  subtitle: string;
  fontFamily: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  layout: 'classic' | 'modern' | 'minimal';
  showAlphabet: boolean;
  format: 'A3' | 'A4';
  orientation: 'vertical' | 'horizontal';
}

type AppScreen = 'import' | 'strava-activities' | 'editor' | 'summary';

export default function App() {
  useLogMount('App component');
const [currentScreen, setCurrentScreen] = useState<AppScreen>('import');
  const [trackPoints, setTrackPoints] = useState<LatLng[]>([]);
  // Detect auth callback from backend
  React.useEffect(() => {
    if (window.location.hash.includes('strava=authenticated')) {
      setCurrentScreen('strava-activities');
      // Clean hash so refreshes don't re-trigger
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);
  const [config, setConfig] = useState<PosterConfig>({
    title: 'Helvetica',
    subtitle: 'A neo-grotesque or realist design, one of the most popular typefaces in the world',
    fontFamily: 'Helvetica, Arial, sans-serif',
    backgroundColor: '#ffffff',
    textColor: '#000000',
    accentColor: '#ff6b35',
    layout: 'classic',
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

  const handleActivitySelected = (selection) => {
    // Prefill title with activity name and subtitle with dynamic suggestion; both are editable by user
    setConfig((prev) => ({
      ...prev,
      title: (selection && selection.titleSuggestion) || '',
      subtitle: (selection && selection.subtitleSuggestion) || '',
    }));
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
      default:
        return 'justify-start';
    }
  };

  // Calculate poster dimensions for editor preview
  const getDimensions = () => {
    const isVertical = config.orientation === 'vertical';
    
    if (config.format === 'A3') {
      return {
        width: isVertical ? 420 : 594,
        height: isVertical ? 594 : 420,
        scale: 0.8 // Good size for editor
      };
    } else { // A4
      return {
        width: isVertical ? 297 : 420,
        height: isVertical ? 420 : 297,
        scale: 1.0 // Larger scale for A4 in editor
      };
    }
  };

  const dimensions = getDimensions();
  const previewWidth = dimensions.width * dimensions.scale;
  const previewHeight = dimensions.height * dimensions.scale;

  const alphabetText = "ABCD\nEFGHIJK\nLMNOP\nQRSTUV\nWXYZ";

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
    return <StravaActivitiesScreen onActivitySelected={handleActivitySelected} />;
  }

  // Show summary screen
  if (currentScreen === 'summary') {
    return <SummaryScreen config={config} onBack={handleBackToEditor} />;
  }

  // Show poster editor (default)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content */}
      <div className="flex min-h-screen">
        {/* Left side - Large Poster Preview */}
        <div className="flex-1 bg-white border-r border-gray-200 flex items-center justify-center p-8">
          <div className="relative">
            <div 
              className="relative border-2 border-gray-300 shadow-xl"
              style={{ 
                backgroundColor: config.backgroundColor,
                width: `${previewWidth}px`,
                height: `${previewHeight}px`
              }}
>
              {/* GPX track overlay */}
              {trackPoints.length > 1 && (
                <svg
                  className="absolute inset-0 pointer-events-none"
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
              <div className={`h-full p-6 flex flex-col ${getLayoutClasses()}`}>
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
            onConfigChange={setConfig}
            onSummary={handleSummary}
          />
        </div>
      </div>
    </div>
  );
}