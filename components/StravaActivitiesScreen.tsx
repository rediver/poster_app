import React, { useEffect, useMemo, useState } from 'react';
import { logModule, useLogMount, logInfo, DEBUG_LOAD } from '../src/debug';
logModule('components/StravaActivitiesScreen.tsx module');
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { MapPin, Clock, Calendar } from 'lucide-react';
import { RoutePreview, decodePolyline, encodePolyline, smoothPoints, downsamplePoints } from './RoutePreview';
import { MapImage } from './MapImage';

interface ActivityApi {
  id: number;
  type: string; // 'Run' | 'Ride' | 'Walk' | ...
  name: string;
  distance: number; // meters
  moving_time?: number; // seconds
  elapsed_time?: number; // seconds
  start_date: string; // ISO
  total_elevation_gain?: number; // meters
  map?: { summary_polyline?: string };
}

interface ActivityItem {
  id: string;
  type: 'Run' | 'Ride' | 'Walk' | 'Hike' | string;
  name: string;
  distance: string;
  duration: string;
  date: string;
  elevation: string;
  polyline?: string;
  speed: string;
  fullDate: string;
}

interface StravaSelection {
  activityId: string;
  titleSuggestion: string;
  overlayData?: {
    distance?: string;
    duration?: string;
    speed?: string;
    elevation?: string;
    date?: string;
  };
}

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
  showDataOverlay: boolean;
  overlayData: {
    distance?: string;
    duration?: string;
    speed?: string;
    elevation?: string;
    date?: string;
  };
}

interface StravaActivitiesScreenProps {
  onActivitySelected: (selection: StravaSelection) => void;
  posterConfig: PosterConfig;
}

export function StravaActivitiesScreen({ onActivitySelected, posterConfig }: StravaActivitiesScreenProps) {
  useLogMount('StravaActivitiesScreen');

  // Sync html+body so no white bleeds below the viewport
  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const prevHtmlOv = html.style.overflow;
    const prevBodyOv = body.style.overflow;
    html.style.backgroundColor = '#F6F1E8';
    body.style.backgroundColor = '#F6F1E8';
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
      html.style.overflow = prevHtmlOv;
      body.style.overflow = prevBodyOv;
    };
  }, []);

  const [selectedActivity, setSelectedActivity] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || '';

  // Dynamic poster preview sizing (match editor proportions)
  const previewContainerRef = React.useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };
    // Defer to next frame to ensure layout is ready
    const raf = requestAnimationFrame(update);
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const getDimensions = () => {
    const isVertical = posterConfig.orientation === 'vertical';
    const base = posterConfig.format === 'A3'
      ? { width: isVertical ? 420 : 594, height: isVertical ? 594 : 420 }
      : { width: isVertical ? 297 : 420, height: isVertical ? 420 : 297 };
    let scale = 1;
    if (containerSize.w && containerSize.h) {
      const availW = Math.max(100, containerSize.w - 48);
      const availH = Math.max(100, containerSize.h - 48);
      scale = Math.min(availW / base.width, availH / base.height) * 0.92;
    } else {
      scale = posterConfig.format === 'A3' ? 0.9 : 1.1;
    }
    return { width: base.width, height: base.height, scale };
  };

  const dims = getDimensions();
  const previewWidth = dims.width * dims.scale;
  const previewHeight = dims.height * dims.scale;

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get stored auth data
        const authDataStr = localStorage.getItem('strava_auth');
        if (!authDataStr) {
          console.error('No strava_auth in localStorage');
          throw new Error('No Strava authentication found. Please login again.');
        }
        
        const authData = JSON.parse(authDataStr);
        const { access_token } = authData;
        console.log('StravaActivities: token present?', Boolean(access_token));
        
        if (!access_token) {
          throw new Error('No access token found. Please login again.');
        }
        
        // Fetch activities directly from Strava API
        const url = 'https://www.strava.com/api/v3/athlete/activities?per_page=30';
        if (DEBUG_LOAD) logInfo('Fetching Strava activities', { url });
        console.log('Fetching Strava activities', { url });
        
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${access_token}`
          }
        });
        
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          if (DEBUG_LOAD) logInfo('Strava activities response not OK', { status: res.status, body: txt.slice(0, 300) });
          console.error('Strava activities fetch failed', { status: res.status, body: txt.slice(0, 300) });
          throw new Error(`Failed to fetch activities (${res.status})`);
        }
        
        const apiActs: ActivityApi[] = await res.json();
        console.log('Strava activities loaded', { count: apiActs?.length || 0 });
        // Only Run or Ride per requirements
        const filtered = apiActs.filter(a => a.type === 'Run' || a.type === 'Ride');
        const fmt = (m: number) => `${(m / 1000).toFixed(2)} km`;
        const fmtTime = (s: number | undefined) => {
          if (!s) return '';
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          const sec = s % 60;
          return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
        };
        const fmtSpeedOrPace = (type: string, dist_m: number, time_s: number | undefined) => {
          if (!time_s || !dist_m) return '';
          if (type === 'Run') {
            const paceS = time_s / (dist_m / 1000);
            const m = Math.floor(paceS / 60);
            const s = Math.floor(paceS % 60);
            return `${m}:${String(s).padStart(2, '0')} min/km`;
          }
          const kmh = (dist_m / 1000) / (time_s / 3600);
          return `${kmh.toFixed(2)}km/h`;
        };
        const items: ActivityItem[] = filtered.map(a => ({
          id: String(a.id),
          type: a.type,
          name: a.name,
          distance: fmt(a.distance || 0),
          duration: fmtTime(a.moving_time || a.elapsed_time),
          date: new Date(a.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          elevation: `${Math.round(a.total_elevation_gain || 0)} m`,
          polyline: a.map?.summary_polyline || undefined,
          speed: fmtSpeedOrPace(a.type, a.distance || 0, a.moving_time || a.elapsed_time),
          fullDate: new Date(a.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        }));
        setActivities(items);
        if (DEBUG_LOAD) logInfo('Activities loaded', { count: items.length });
      } catch (e: any) {
        setError(e.message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const selectedActivityData = useMemo(
    () => activities.find((a) => a.id === selectedActivity),
    [activities, selectedActivity]
  );
  const selectedPolyline = selectedActivityData?.polyline || '';

  // Build Mapbox static map URL with route drawn by Mapbox (path overlay)
  const mapboxToken = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || '';
  const mapWithRouteUrl = useMemo(() => {
    if (!selectedPolyline || !mapboxToken) return '';
    const w = Math.min(1280, Math.round(previewWidth));
    const h = Math.min(1280, Math.round(previewHeight));
    // Decode → smooth → re-encode for softer curves.
    // Route is rendered as 3 stacked path overlays (glow + dark border + main),
    // so polyline is repeated 3× in the URL — keep it tight.
    let pts = decodePolyline(selectedPolyline);
    pts = smoothPoints(pts, 2);
    pts = downsamplePoints(pts, 240);
    const color = posterConfig.accentColor.replace('#', '');
    const encodedPoly = encodeURIComponent(encodePolyline(pts));
    // Layered route: soft outer glow → dark stroke for contrast → bright main stroke.
    const overlay = [
      `path-10+${color}-0.18(${encodedPoly})`,
      `path-6+050505(${encodedPoly})`,
      `path-4+${color}(${encodedPoly})`,
    ].join(',');
    // "auto" lets Mapbox find the best center+zoom to fit the path
    return (
      `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/` +
      `${overlay}/auto/${w}x${h}@2x` +
      `?access_token=${mapboxToken}&logo=false&attribution=false&padding=40`
    );
  }, [selectedPolyline, mapboxToken, previewWidth, previewHeight, posterConfig.accentColor]);

const getActivityColor = (type: string) => {
    switch (type) {
      case 'Run':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Ride':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Hike':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleContinue = () => {
    if (selectedActivity) {
      const act = activities.find(a => a.id === selectedActivity);
      if (act) {
        const titleSuggestion = act.name || '';
        onActivitySelected({
          activityId: selectedActivity,
          titleSuggestion,
          overlayData: {
            distance: act.distance,
            duration: act.duration,
            speed: act.speed,
            elevation: act.elevation,
            date: act.fullDate,
          },
        });
      } else {
        onActivitySelected({ activityId: selectedActivity, titleSuggestion: '' });
      }
    }
  };

  return (
    <div className="h-screen flex overflow-hidden" style={{ fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif", backgroundColor: '#F6F1E8', padding: 24, gap: 24 }}>
          {/* ── Left: Premium Preview Stage ── */}
          <div
            ref={previewContainerRef}
            className="flex-1 flex items-center justify-center overflow-hidden"
            style={{
              backgroundColor: '#EFE7DB',
              borderRadius: 20,
              border: '1px solid #E5DED3',
              boxShadow: '0 8px 24px rgba(31,36,48,0.06)',
              padding: 40,
            }}
          >
            <div className="relative">
              <div
                style={{
                  width: `${previewWidth}px`,
                  height: `${previewHeight}px`,
                  backgroundColor: '#ffffff',
                  padding: Math.round(previewWidth * 0.04),
                  boxShadow: '0 25px 60px -15px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06)',
                }}
              >
                <div
                  className="relative p-6 flex flex-col overflow-hidden"
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: posterConfig.backgroundColor,
                  }}
                >
                  {mapWithRouteUrl ? (
                    <MapImage
                      src={mapWithRouteUrl}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ zIndex: 0 }}
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center" style={{ position: 'relative', zIndex: 1 }}>
                      <p style={{ fontSize: 13, color: posterConfig.textColor, opacity: 0.3, textAlign: 'center' }}>
                        Select an activity to preview the route
                      </p>
                    </div>
                  )}
                  {mapWithRouteUrl && <div className="flex-1" />}

                  <div className="flex flex-col" style={{ position: 'relative', zIndex: 1 }}>
                    <h1 className="mb-1" style={{
                      color: posterConfig.accentColor,
                      fontFamily: posterConfig.fontFamily,
                      fontSize: `${Math.round(22 * (posterConfig.format === 'A3' ? 1.3 : 1))}px`,
                      fontWeight: 800,
                      lineHeight: '1.1',
                      textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                    }}>
                      {selectedActivityData?.name || 'Your Activity'}
                    </h1>
                    <p style={{
                      color: posterConfig.accentColor,
                      fontFamily: posterConfig.fontFamily,
                      fontSize: `${Math.round(11 * (posterConfig.format === 'A3' ? 1.0 : 0.9))}px`,
                      fontWeight: 600,
                      lineHeight: '1.3',
                      textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                    }}>
                      {selectedActivityData ? `${selectedActivityData.distance} · ${selectedActivityData.duration}` : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Format pill */}
              <div style={{
                position: 'absolute',
                bottom: -14,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#FFFFFF',
                color: '#667085',
                fontSize: 11,
                fontWeight: 500,
                padding: '4px 14px',
                borderRadius: 20,
                boxShadow: '0 2px 8px rgba(31,36,48,0.08)',
                whiteSpace: 'nowrap',
              }}>
                {posterConfig.format} · {posterConfig.orientation}
              </div>
            </div>
          </div>

          {/* ── Right: Route Selection Panel ── */}
          <div
            className="flex flex-col"
            style={{
              flex: '0 0 400px',
              backgroundColor: '#FBF8F3',
              borderRadius: 20,
              border: '1px solid #E5DED3',
              boxShadow: '0 8px 24px rgba(31,36,48,0.06)',
              overflow: 'hidden',
            }}
          >
            {/* Panel heading */}
            <div style={{ padding: '28px 28px 0' }}>
              <h2 style={{
                fontSize: 28,
                fontWeight: 700,
                color: '#1F2430',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                marginBottom: 6,
              }}>
                Choose your route
              </h2>
              <p style={{ fontSize: 14, color: '#667085', lineHeight: 1.5 }}>
                Select an activity to create your poster
              </p>
            </div>

            {/* Route list */}
            <div className="premium-scrollbar flex-1 overflow-y-auto" style={{ padding: '20px 28px' }}>
              {loading && (
                <div style={{ fontSize: 14, color: '#98A2B3', padding: '20px 0' }}>Loading activities…</div>
              )}
              {error && !loading && (
                <div style={{ fontSize: 14, color: '#d4183d', padding: '20px 0' }}>{error}</div>
              )}

              {!loading && !error && (
                <RadioGroup value={selectedActivity} onValueChange={setSelectedActivity}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {activities.map((activity) => {
                      const isSelected = selectedActivity === activity.id;
                      const isRun = activity.type === 'Run';
                      return (
                        <div key={activity.id}>
                          <RadioGroupItem value={activity.id} id={activity.id} className="sr-only" />
                          <Label htmlFor={activity.id} className="block cursor-pointer">
                            <div className="premium-card" data-selected={isSelected || undefined}>
                              <div className="flex items-start justify-between">
                                <div style={{ flex: 1 }}>
                                  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      fontSize: 11,
                                      fontWeight: 600,
                                      letterSpacing: '0.02em',
                                      padding: '3px 8px',
                                      borderRadius: 6,
                                      backgroundColor: isRun ? '#FFF1E6' : '#EFF4FF',
                                      color: isRun ? '#FC5200' : '#3B82F6',
                                    }}>
                                      {activity.type}
                                    </span>
                                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1F2430', lineHeight: 1.3 }}>
                                      {activity.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center" style={{ gap: 14 }}>
                                    <div className="flex items-center gap-1">
                                      <MapPin style={{ width: 13, height: 13, color: '#98A2B3' }} />
                                      <span style={{ fontSize: 13, color: '#667085' }}>{activity.distance}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Clock style={{ width: 13, height: 13, color: '#98A2B3' }} />
                                      <span style={{ fontSize: 13, color: '#667085' }}>{activity.duration}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Calendar style={{ width: 13, height: 13, color: '#98A2B3' }} />
                                      <span style={{ fontSize: 13, color: '#667085' }}>{activity.date}</span>
                                    </div>
                                  </div>
                                </div>

                                {isSelected && (
                                  <div style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: '50%',
                                    backgroundColor: '#FC5200',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    marginLeft: 8,
                                    marginTop: 2,
                                  }}>
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            </div>
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </RadioGroup>
              )}
            </div>

            {/* CTA */}
            <div style={{ padding: '16px 28px 28px', borderTop: '1px solid #EFE8DD' }}>
              <p style={{ fontSize: 12, color: '#98A2B3', textAlign: 'center', marginBottom: 12 }}>
                {selectedActivity ? 'Continue to customize your poster' : 'Select a route to continue'}
              </p>
              <button
                onClick={handleContinue}
                disabled={!selectedActivity}
                className="premium-cta"
                style={{
                  width: '100%',
                  height: 48,
                  backgroundColor: selectedActivity ? '#FC5200' : '#E5DED3',
                  color: selectedActivity ? '#FFFFFF' : '#98A2B3',
                  fontSize: 15,
                  fontWeight: 600,
                  borderRadius: 12,
                  border: 'none',
                  cursor: selectedActivity ? 'pointer' : 'not-allowed',
                  boxShadow: selectedActivity ? '0 4px 12px rgba(252,82,0,0.3)' : 'none',
                  transition: 'all 0.2s ease',
                  letterSpacing: '0.01em',
                }}
              >
                Continue to Editor →
              </button>
            </div>
          </div>
    </div>
  );
}