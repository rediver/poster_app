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
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F1E8' }}>
      {/* Main content */}
      <div className="flex min-h-screen">
        {/* Left side - Poster Preview */}
        <div
          className="flex-1 flex items-center justify-center p-8"
          style={{ backgroundColor: '#EAE2D6' }}
        >
          <div className="relative">
            <div
              className="w-80 h-96 p-6 flex flex-col"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid rgba(34,39,51,0.08)',
                boxShadow: '0 22px 60px rgba(31,35,40,0.12)',
              }}
            >
              <div className="mb-4">
                <pre className="text-sm font-semibold leading-tight" style={{ color: '#1F2328' }}>
                  ABCD{'\n'}EFGHIJK{'\n'}LMNOP{'\n'}QRSTUV{'\n'}WXYZ
                </pre>
              </div>

              <div className="flex-1 flex flex-col justify-end">
                <h1 className="text-2xl font-bold mb-2" style={{ color: '#FC4C02' }}>Helvetica</h1>
                <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                  A neo-grotesque or realist design, one of the most popular typefaces in the world
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Import Options */}
        <div
          className="w-[480px] flex flex-col justify-center p-8"
          style={{ backgroundColor: '#FAF6EF', borderLeft: '1px solid #E3DBCF' }}
        >
          <div className="max-w-md mx-auto w-full space-y-8">
            <div className="space-y-4">
              <h1 className="text-3xl font-semibold tracking-tight leading-tight" style={{ color: '#1F2328' }}>
                Transform your memories into beautiful poster
              </h1>
            </div>

            <div className="space-y-4">
              <Card
                className="cursor-pointer transition-shadow"
                style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DED2' }}
                onClick={handleStravaClick}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(31,35,40,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3" style={{ color: '#1F2328' }}>
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center"
                      style={{ backgroundColor: '#FC4C02' }}
                    >
                      <Activity className="w-4 h-4 text-white" />
                    </div>
                    <span>Strava</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm" style={{ color: '#6B7280' }}>
                    Connect your Strava account to import your activities
                  </p>
                </CardContent>
              </Card>

              <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DED2' }}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3" style={{ color: '#1F2328' }}>
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center"
                      style={{ backgroundColor: '#6B7280' }}
                    >
                      <Upload className="w-4 h-4 text-white" />
                    </div>
                    <span>GPX</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-4" style={{ color: '#6B7280' }}>
                    Upload a GPX file from your device
                  </p>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".gpx"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" className="w-full" style={{ borderColor: '#E8DED2', color: '#6B7280' }}>
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
