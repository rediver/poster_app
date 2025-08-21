import React, { useState } from 'react';
import { logModule, useLogMount } from '../src/debug';
logModule('components/StravaActivitiesScreen.tsx module');
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { MapPin, Clock, Calendar } from 'lucide-react';

interface Activity {
  id: string;
  type: 'Run' | 'Bike' | 'Hike';
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

  // Mock Strava activities data
  const activities: Activity[] = [
    {
      id: '1',
      type: 'Run',
      name: 'Morning run',
      distance: '6.18 km',
      duration: '32:15',
      date: 'Dec 15',
      elevation: '45m'
    },
    {
      id: '2',
      type: 'Run',
      name: 'Morning run',
      distance: '5.24 km',
      duration: '28:42',
      date: 'Dec 14',
      elevation: '32m'
    },
    {
      id: '3',
      type: 'Bike',
      name: 'Morning ride',
      distance: '52.24 km',
      duration: '1:45:30',
      date: 'Dec 13',
      elevation: '234m'
    },
    {
      id: '4',
      type: 'Run',
      name: 'Morning run',
      distance: '6.18 km',
      duration: '31:48',
      date: 'Dec 12',
      elevation: '41m'
    },
    {
      id: '5',
      type: 'Bike',
      name: 'Evening ride',
      distance: '31.23 km',
      duration: '1:12:20',
      date: 'Dec 11',
      elevation: '156m'
    }
  ];

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'Run':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Bike':
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
      {/* Browser-like header */}
      <div className="bg-white border-b border-gray-200 p-3">
        <div className="flex items-center space-x-2 max-w-lg">
          <div className="flex space-x-1">
            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
            <div className="w-3 h-3 rounded-full bg-green-400"></div>
          </div>
          <div className="flex-1 bg-gray-100 rounded px-3 py-1 text-sm text-gray-600">
            www.asf.com
          </div>
          <div className="w-6 h-6 bg-gray-200 rounded"></div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-[calc(100vh-60px)]">
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