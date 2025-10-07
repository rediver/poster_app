import React, { useState } from 'react';
import { logModule, useLogMount } from '../src/debug';
logModule('components/SummaryScreen.tsx module');
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';

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

type LatLng = [number, number];

interface SummaryScreenProps {
  config: PosterConfig;
  trackPoints: LatLng[];
  onBack: () => void;
}

export function SummaryScreen({ config, trackPoints, onBack }: SummaryScreenProps) {
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

  const handleCheckout = () => {
    alert('Checkout functionality would be implemented here');
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

  const alphabetText = "ABCD\nEFGHIJK\nLMNOP\nQRSTUV\nWXYZ";

  // Adjust font sizes for larger preview
  const getFontSizes = () => {
    const baseMultiplier = config.format === 'A3' ? 1.6 : 1.4;
    const orientationMultiplier = config.orientation === 'horizontal' ? 0.85 : 1;
    
    return {
      alphabet: Math.round(18 * baseMultiplier * orientationMultiplier),
      title: Math.round(28 * baseMultiplier * orientationMultiplier),
      subtitle: Math.round(12 * baseMultiplier * orientationMultiplier)
    };
  };

  const fontSizes = getFontSizes();
  
  const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || '';
  const mapZoom = config.mapZoom ?? 1.5;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content */}
      <div className="flex min-h-screen">
        {/* Left side - Large Poster Preview */}
        <div ref={previewContainerRef} className="flex-1 bg-white border-r border-gray-200 flex items-center justify-center p-12">
          <div className="relative">
            <div 
              className="relative border-2 border-gray-300 shadow-2xl"
              style={{ 
                backgroundColor: config.layout === 'map' ? '#ffffff' : config.backgroundColor,
                width: `${previewWidth}px`,
                height: `${previewHeight}px`
              }}
            >
              {/* Mapbox background for map layout */}
              {config.layout === 'map' && trackPoints.length > 1 && (() => {
                const lats = trackPoints.map(p => p[0]);
                const lons = trackPoints.map(p => p[1]);
                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);
                const minLon = Math.min(...lons);
                const maxLon = Math.max(...lons);
                const centerLat = (minLat + maxLat) / 2;
                const centerLon = (minLon + maxLon) / 2;
                
                const paddingFactor = 0.15 / mapZoom;
                const latPad = (maxLat - minLat) * paddingFactor || 0.001;
                const lonPad = (maxLon - minLon) * paddingFactor || 0.001;
                const minLatP = minLat - latPad;
                const maxLatP = maxLat + latPad;
                const minLonP = minLon - lonPad;
                const maxLonP = maxLon + lonPad;
                
                const dLat = (maxLatP - minLatP) || 0.01;
                const dLon = (maxLonP - minLonP) || 0.01;
                const latRadians = centerLat * Math.PI / 180;
                const mercatorAdjustment = Math.cos(latRadians);
                const latZoom = Math.log2(180 / dLat) - 1;
                const lonZoom = Math.log2(360 / (dLon / mercatorAdjustment)) - 1;
                
                const aspect = previewWidth / previewHeight;
                const bboxAspect = (dLon * mercatorAdjustment) / dLat;
                let zoom = bboxAspect > aspect ? lonZoom : latZoom;
                zoom = zoom + (mapZoom - 1.5) * 0.5;
                zoom = Math.max(1, Math.min(18, zoom));

                const isDark = config.backgroundColor === '#000000' || config.backgroundColor.toLowerCase() === '#111111';
                const styleId = isDark ? 'mapbox/dark-v11' : 'mapbox/light-v11';
                const sizeW = Math.round(previewWidth);
                const sizeH = Math.round(previewHeight);
                const center = `${centerLon},${centerLat}`;
                const url = `${BACKEND_URL}/api/mapbox/static?style=${encodeURIComponent(styleId)}&center=${encodeURIComponent(center)}&zoom=${encodeURIComponent(String(zoom))}&w=${sizeW}&h=${sizeH}`;
                console.log('Summary map image URL', { url, sizeW, sizeH, zoom, styleId });
                const filterStr = isDark 
                  ? 'grayscale(1) saturate(0) contrast(0.95) brightness(0.6)'
                  : 'grayscale(1) saturate(0) contrast(0.85) brightness(1.05)';
                const overlayColor = isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
                return (
                  <>
                    <img src={url} alt="map" className="absolute inset-0 w-full h-full object-fill z-0" style={{ filter: filterStr, opacity: 0.95 }} onError={(e) => console.error('Summary map image failed', url, e)} />
                    <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundColor: overlayColor }} />
                  </>
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
                    const points = trackPoints.map(([lat, lon]) => toXY(lat, lon));

                    // Build a gently smoothed path using Catmull–Rom converted to cubic Bézier
                    const buildSmoothPath = (pts: [number, number][], tension = 0.45) => {
                      if (pts.length <= 2) {
                        return pts
                          .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
                          .join(' ');
                      }

                      let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
                      for (let i = 0; i < pts.length - 1; i++) {
                        const p0 = i > 0 ? pts[i - 1] : pts[i];
                        const p1 = pts[i];
                        const p2 = pts[i + 1];
                        const p3 = i !== pts.length - 2 ? pts[i + 2] : pts[i + 1];

                        const c1x = p1[0] + (p2[0] - p0[0]) * (tension / 6);
                        const c1y = p1[1] + (p2[1] - p0[1]) * (tension / 6);
                        const c2x = p2[0] - (p3[0] - p1[0]) * (tension / 6);
                        const c2y = p2[1] - (p3[1] - p1[1]) * (tension / 6);

                        d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
                      }
                      return d;
                    };

                    const d = buildSmoothPath(points, 0.45);
                    const isDarkBg = config.backgroundColor === '#000000' || config.backgroundColor.toLowerCase() === '#111111';
                    const haloColor = isDarkBg ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.70)';
                    const coreColor = isDarkBg ? '#FFFFFF' : '#111111';
                    return (
                      <>
                        <path d={d} fill="none" stroke={haloColor} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" />
                        <path d={d} fill="none" stroke={coreColor} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" />
                        <path d={d} fill="none" stroke={config.accentColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" />
                      </>
                    );
                  })()}
                </svg>
              )}
              
              <div className={`relative z-20 h-full p-8 flex flex-col ${getLayoutClasses()}`}>
                {config.showAlphabet && (
                  <div className="mb-6">
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
            <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-sm text-gray-500 bg-white px-3 py-1 rounded shadow">
              {config.format} - {config.orientation}
            </div>
          </div>
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
                  disabled={!isReviewed}
                  className="flex-1 h-12 bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Checkout
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}