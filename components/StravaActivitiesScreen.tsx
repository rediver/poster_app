import React, { useEffect, useMemo, useState } from 'react';
import { logModule, useLogMount, logInfo, DEBUG_LOAD } from '../src/debug';
logModule('components/StravaActivitiesScreen.tsx module');
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { MapPin, Clock, Calendar } from 'lucide-react';
import { RoutePreview } from './RoutePreview';

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
}

interface StravaSelection {
  activityId: string;
  titleSuggestion: string;
  subtitleSuggestion: string;
}

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
}

interface StravaActivitiesScreenProps {
  onActivitySelected: (selection: StravaSelection) => void;
  posterConfig: PosterConfig;
}

export function StravaActivitiesScreen({ onActivitySelected, posterConfig }: StravaActivitiesScreenProps) {
  useLogMount('StravaActivitiesScreen');
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
        const items: ActivityItem[] = filtered.map(a => ({
          id: String(a.id),
          type: a.type,
          name: a.name,
          distance: fmt(a.distance || 0),
          duration: fmtTime(a.moving_time || a.elapsed_time),
          date: new Date(a.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          elevation: `${Math.round(a.total_elevation_gain || 0)} m`,
          polyline: a.map?.summary_polyline || undefined,
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
        const parts = [act.distance, act.duration, act.elevation].filter(Boolean);
        const subtitleSuggestion = parts.join(' · ');
        const titleSuggestion = act.name || '';
        onActivitySelected({ activityId: selectedActivity, titleSuggestion, subtitleSuggestion });
      } else {
        onActivitySelected({ activityId: selectedActivity, titleSuggestion: '', subtitleSuggestion: '' });
      }
    }
  };

  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      {/* Main content */}
      <div className="flex h-full">
        {/* Left side - Poster Preview */}
        <div ref={previewContainerRef} className="flex-1 h-full bg-white border-r border-gray-200 flex items-center justify-center p-8 overflow-hidden">
          <div className="relative">
            <div 
              className="relative bg-white border-2 border-gray-300 shadow-xl p-6 flex flex-col"
              style={{ width: `${previewWidth}px`, height: `${previewHeight}px`, backgroundColor: posterConfig.backgroundColor }}
            >
              {/* Route preview or placeholder */}
              <div className="flex-1 flex items-center justify-center">
                {selectedPolyline ? (
                  <RoutePreview
                    polyline={selectedPolyline}
                    width={previewWidth - 48}
                    height={previewHeight - 120}
                    strokeColor={posterConfig.accentColor}
                    strokeWidth={2}
                  />
                ) : (
                  <p className="text-sm text-center" style={{ color: posterConfig.textColor, opacity: 0.3 }}>
                    Select an activity to preview the route
                  </p>
                )}
              </div>
              
              <div className="flex flex-col">
                <h1 className="mb-1" style={{ color: posterConfig.accentColor, fontFamily: posterConfig.fontFamily, fontSize: `${Math.round(20 * (posterConfig.format === 'A3' ? 1.3 : 1))}px`, fontWeight: 700, lineHeight: '1.1' }}>
                  {selectedActivityData?.name || 'Your Activity'}
                </h1>
                <p style={{ color: posterConfig.textColor, fontFamily: posterConfig.fontFamily, fontSize: `${Math.round(10 * (posterConfig.format === 'A3' ? 1.0 : 0.9))}px`, lineHeight: '1.3', opacity: 0.6 }}>
                  {selectedActivityData ? `${selectedActivityData.distance} · ${selectedActivityData.duration}` : ''}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Activities List */}
        <div className="w-[480px] bg-white h-full overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <h1>Your strava routes</h1>
              <p className="text-muted-foreground">
                Select an activity to create your poster
              </p>
            </div>

            {loading && <div className="text-sm text-muted-foreground">Loading activities...</div>}
            {error && !loading && <div className="text-sm text-red-500">{error}</div>}

            {!loading && !error && (
              <RadioGroup value={selectedActivity} onValueChange={setSelectedActivity}>
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div key={activity.id} className="relative">
                    <RadioGroupItem
                      value={activity.id}
                      id={activity.id}
                      className="absolute top-4 left-4 z-10"
                    />
                    <Label
                      htmlFor={activity.id}
                      className="block cursor-pointer"
                    >
                      <Card className={`hover:shadow-md transition-shadow ${
                        selectedActivity === activity.id ? 'ring-2 ring-orange-500' : ''
                      }`}>
                        <CardContent className="p-4 pl-12">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant="outline" 
                                  className={getActivityColor(activity.type)}
                                >
                                  {activity.type}
                                </Badge>
                                <span className="font-medium">{activity.name}</span>
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  <span>{activity.distance}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{activity.duration}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  <span>{activity.date}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Label>
                  </div>
                ))}
              </div>
              </RadioGroup>
            )}

            <Button 
              onClick={handleContinue}
              disabled={!selectedActivity}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
            >
              Go to Editor
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}