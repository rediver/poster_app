import React, { useEffect, useMemo, useState } from 'react';
import { logModule, useLogMount } from '../src/debug';
logModule('components/StravaActivitiesScreen.tsx module');
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { MapPin, Clock, Calendar } from 'lucide-react';

interface ActivityApi {
  id: number;
  type: string; // 'Run' | 'Ride' | 'Walk' | ...
  name: string;
  distance: number; // meters
  moving_time?: number; // seconds
  elapsed_time?: number; // seconds
  start_date: string; // ISO
  total_elevation_gain?: number; // meters
}

interface ActivityItem {
  id: string;
  type: 'Run' | 'Ride' | 'Walk' | 'Hike' | string;
  name: string;
  distance: string;
  duration: string;
  date: string;
  elevation: string;
}

interface StravaActivitiesScreenProps {
  onActivitySelected: () => void;
}

export function StravaActivitiesScreen({ onActivitySelected }: StravaActivitiesScreenProps) {
  useLogMount('StravaActivitiesScreen');
  const [selectedActivity, setSelectedActivity] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || '';

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${BACKEND_URL}/strava/activities`, {
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch activities (${res.status})`);
        }
        const data = await res.json();
        const apiActs: ActivityApi[] = data.activities || [];
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
        }));
        setActivities(items);
      } catch (e: any) {
        setError(e.message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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
      onActivitySelected();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content */}
      <div className="flex min-h-screen">
        {/* Left side - Poster Preview */}
        <div className="flex-1 bg-white border-r border-gray-200 flex items-center justify-center p-8">
          <div className="relative">
            <div className="w-80 h-96 bg-white border-2 border-gray-300 shadow-xl p-6 flex flex-col">
              <div className="mb-4">
                <pre className="text-sm font-semibold text-gray-800 leading-tight">
                  ABCD{'\n'}EFGHIJK{'\n'}LMNOP{'\n'}QRSTUV{'\n'}WXYZ
                </pre>
              </div>
              
              <div className="flex-1 flex flex-col justify-end">
                <h1 className="text-2xl font-bold text-orange-500 mb-2">Helvetica</h1>
                <p className="text-sm text-gray-600 leading-relaxed">
                  A neo-grotesque or realist design, one of the most popular typefaces in the world
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Activities List */}
        <div className="w-[480px] bg-white overflow-y-auto">
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