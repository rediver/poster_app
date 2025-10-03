import React from 'react';
import { logModule, useLogMount, logInfo, DEBUG_LOAD } from '../src/debug';
logModule('components/DataImportScreen.tsx module');
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Upload, Activity } from 'lucide-react';

type LatLng = [number, number];

interface DataImportScreenProps {
  onStravaSelected: () => void;
  onGpxImported: (points: LatLng[]) => void;
}

export function DataImportScreen({ onStravaSelected, onGpxImported }: DataImportScreenProps) {
  useLogMount('DataImportScreen');
  const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || '';
const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.gpx')) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'application/xml');
          const trkpts = Array.from(xml.getElementsByTagName('trkpt'));
          const points: LatLng[] = trkpts
            .map((el) => [
              parseFloat(el.getAttribute('lat') || '0'),
              parseFloat(el.getAttribute('lon') || '0'),
            ] as LatLng)
            .filter(([lat, lon]) => !Number.isNaN(lat) && !Number.isNaN(lon));
          if (points.length > 1) {
            onGpxImported(points);
          }
        } catch (e) {
          console.error('Failed to parse GPX', e);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleStravaClick = async () => {
    try {
      const baseRaw = BACKEND_URL || '';
      const base = baseRaw.replace(/\/$/, '');
      const target = base ? `${base}/strava/auth` : '/strava/auth';
      if (DEBUG_LOAD) logInfo('Strava clicked', { BACKEND_URL: baseRaw, target });
      
      // Add postMessage listener for OAuth callback
      const handleMessage = (event: MessageEvent) => {
        console.log('Received postMessage:', event.data);
        if (event.data && event.data.type === 'strava_oauth') {
          console.log('Strava OAuth successful:', event.data.athlete);
          window.removeEventListener('message', handleMessage);
          // Store OAuth data temporarily in localStorage
          const authData = {
            access_token: event.data.access_token,
            expires_at: event.data.expires_at,
            athlete: event.data.athlete
          };
          localStorage.setItem('strava_auth', JSON.stringify(authData));
          console.log('Stored Strava auth data, navigating to activities screen');
          // Call the callback to switch screens
          onStravaSelected();
        }
      };
      
      console.log('Adding postMessage listener for Strava OAuth');
      window.addEventListener('message', handleMessage);
      
      // Optional preflight when debugging
      if (DEBUG_LOAD && base) {
        try {
          const health = await fetch(`${base}/healthz`, { credentials: 'include' });
          logInfo('Backend health status', { status: health.status });
        } catch (e) {
          console.warn('Health check failed before OAuth', e);
        }
      } else if (DEBUG_LOAD && !base) {
        console.warn('VITE_BACKEND_URL not set; using relative /strava/auth. Ensure same-origin setup or a dev proxy.');
      }
      
      // Open as popup instead of full redirect
      console.log('Opening Strava OAuth popup:', target);
      const popup = window.open(target, 'strava_oauth', 'width=600,height=700,scrollbars=yes,resizable=yes');
      
      if (!popup) {
        alert('Popup blocked! Please allow popups for this site and try again.');
        window.removeEventListener('message', handleMessage);
        return;
      }
      
      // Fallback: remove listener after 5 minutes in case popup is manually closed
      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        console.log('Removed Strava postMessage listener (timeout)');
      }, 300000);
      
    } catch (e) {
      console.error('Failed to start Strava OAuth', e);
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

        {/* Right side - Import Options */}
        <div className="w-[480px] bg-white flex flex-col justify-center p-8">
          <div className="max-w-md mx-auto w-full space-y-8">
            <div className="space-y-4">
              <h1>Transform your memories into beautiful poster</h1>
              <p className="text-muted-foreground">
                Upload your strava routes and create a beautiful poster just for you
              </p>
            </div>

            <div className="space-y-4">
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={handleStravaClick}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center">
                      <Activity className="w-4 h-4 text-white" />
                    </div>
                    <span>Strava</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Connect your Strava account to import your activities
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
                      <Upload className="w-4 h-4 text-white" />
                    </div>
                    <span>GPX</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload a GPX file from your device
                  </p>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".gpx"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" className="w-full">
                      Choose GPX File
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}