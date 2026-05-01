import React from 'react';
import { logModule, useLogMount } from '../src/debug';
logModule('components/PosterEditor.tsx module');
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { mapThemes } from '../src/mapThemes';
import { Map, Image, Minus } from 'lucide-react';
import { Slider } from './ui/slider';

interface PosterConfig {
  title: string;
  fontFamily: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  layout: 'map' | 'photo' | 'minimal';
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
  visibleStatKeys?: string[];
  // Photo-mode editorial settings
  photoTitleFont?: string;
  photoBrightness?: number;
  photoContrast?: number;
  photoSaturation?: number;
}

interface PosterEditorProps {
  config: PosterConfig;
  onConfigChange: (config: PosterConfig) => void;
  onSummary: () => void;
  photoUrl?: string;
  onClearPhoto?: () => void;
}

export function PosterEditor({ config, onConfigChange, onSummary, photoUrl, onClearPhoto }: PosterEditorProps) {
  useLogMount('PosterEditor');
  const updateConfig = (updates: Partial<PosterConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const fontOptions = [
    { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: 'Inter, sans-serif', label: 'Inter' },
    { value: 'Playfair Display, serif', label: 'Playfair Display' },
    { value: 'Roboto, sans-serif', label: 'Roboto' },
  ];

  const photoTitleFontOptions = [
    { value: "'Cormorant Garamond', serif", label: 'Cormorant Garamond' },
    { value: "'Playfair Display', serif", label: 'Playfair Display' },
    { value: 'Georgia, serif', label: 'Georgia' },
  ];

  const colorPresets = [
    { bg: '#ffffff', text: '#000000', accent: '#ff6b35' },
    { bg: '#000000', text: '#ffffff', accent: '#00ff88' },
    { bg: '#f5f5f5', text: '#333333', accent: '#3b82f6' },
    { bg: '#fef7ed', text: '#9a3412', accent: '#ea580c' },
    { bg: '#ecfdf5', text: '#065f46', accent: '#10b981' },
  ];

  // Presety kolorów oparte na stylach z maptoposter
  const mapColorPresets = mapThemes.map((t) => ({
    name: t.name,
    bg: t.bg,
    text: t.text,
    accent: t.road_primary || t.road_default || t.text,
  }));

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="space-y-4">
<h2 className="text-2xl font-semibold tracking-tight leading-tight">Transform your memories into beautiful poster</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Layout</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'map' as const, icon: Map, label: 'Map' },
              { value: 'photo' as const, icon: Image, label: 'Photo' },
              { value: 'minimal' as const, icon: Minus, label: 'Minimal' },
            ].map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => {
                  const updates: Partial<PosterConfig> = { layout: value };
                  if (value === 'minimal') updates.orientation = 'horizontal';
                  updateConfig(updates);
                }}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  config.layout === value
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Photo upload button when photo layout is selected */}
      {config.layout === 'photo' && (
        <Card>
          <CardHeader>
            <CardTitle>Photo</CardTitle>
          </CardHeader>
          <CardContent>
            {photoUrl ? (
              <div className="space-y-3">
                <div className="w-full h-32 rounded-lg overflow-hidden bg-gray-100">
                  <img src={photoUrl} alt="Uploaded" className="w-full h-full object-cover" />
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onClearPhoto?.()}
                >
                  Change photo
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Drop a photo on the left panel or click it to upload.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={config.title}
              onChange={(e) => updateConfig({ title: e.target.value })}
              placeholder="Enter poster title"
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Label htmlFor="data-overlay">Data Overlay</Label>
            <Switch
              id="data-overlay"
              checked={config.showDataOverlay}
              onCheckedChange={(checked) => updateConfig({ showDataOverlay: checked as boolean })}
            />
          </div>

          {config.showDataOverlay && config.layout === 'photo' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { key: 'distance', label: 'Distance' },
                { key: 'elevation', label: 'Elevation' },
                { key: 'speed', label: 'Pace' },
                { key: 'date', label: 'Date' },
                { key: 'duration', label: 'Time' },
              ].map(({ key, label }) => {
                const active = (config.visibleStatKeys || []).includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => {
                      const current = config.visibleStatKeys || [];
                      const next = active
                        ? current.filter((k) => k !== key)
                        : [...current, key];
                      updateConfig({ visibleStatKeys: next });
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-white text-gray-900 border-gray-300 shadow-sm'
                        : 'bg-transparent text-gray-400 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {config.showDataOverlay && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="overlay-distance" className="text-xs">Distance</Label>
                  <Input
                    id="overlay-distance"
                    value={config.overlayData?.distance || ''}
                    onChange={(e) => updateConfig({
                      overlayData: { ...config.overlayData, distance: e.target.value }
                    })}
                    placeholder="e.g. 49.96 km"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="overlay-duration" className="text-xs">Duration</Label>
                  <Input
                    id="overlay-duration"
                    value={config.overlayData?.duration || ''}
                    onChange={(e) => updateConfig({
                      overlayData: { ...config.overlayData, duration: e.target.value }
                    })}
                    placeholder="e.g. 1:47:09"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="overlay-speed" className="text-xs">Speed / Pace</Label>
                  <Input
                    id="overlay-speed"
                    value={config.overlayData?.speed || ''}
                    onChange={(e) => updateConfig({
                      overlayData: { ...config.overlayData, speed: e.target.value }
                    })}
                    placeholder="e.g. 27.98 km/h"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="overlay-elevation" className="text-xs">Elevation</Label>
                  <Input
                    id="overlay-elevation"
                    value={config.overlayData?.elevation || ''}
                    onChange={(e) => updateConfig({
                      overlayData: { ...config.overlayData, elevation: e.target.value }
                    })}
                    placeholder="e.g. 740 m"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="overlay-date" className="text-xs">Date</Label>
                <Input
                  id="overlay-date"
                  value={config.overlayData?.date || ''}
                  onChange={(e) => updateConfig({
                    overlayData: { ...config.overlayData, date: e.target.value }
                  })}
                  placeholder="e.g. April 4th, 2026"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Style & Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Orientation */}
          <div className="space-y-2">
            <Label>Orientation</Label>
            <ToggleGroup
              type="single"
              value={config.orientation}
              onValueChange={(value) => value && updateConfig({ orientation: value as 'vertical' | 'horizontal' })}
              className="justify-start"
            >
              <ToggleGroupItem value="vertical" aria-label="Vertical orientation">
                Portrait
              </ToggleGroupItem>
              <ToggleGroupItem value="horizontal" aria-label="Horizontal orientation">
                Landscape
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Separator />

          {/* Typography */}
          {config.layout === 'photo' ? (
            <div className="space-y-2">
              <Label>Title Font</Label>
              <Select
                value={config.photoTitleFont || "'Cormorant Garamond', serif"}
                onValueChange={(value) => updateConfig({ photoTitleFont: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {photoTitleFontOptions.map((font) => (
                    <SelectItem key={font.value} value={font.value}>
                      <span style={{ fontFamily: font.value }}>{font.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Font Family</Label>
              <Select
                value={config.fontFamily}
                onValueChange={(value) => updateConfig({ fontFamily: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontOptions.map((font) => (
                    <SelectItem key={font.value} value={font.value}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Separator />

          {/* Photo Treatment (photo layout only) */}
          {config.layout === 'photo' && (
            <div className="space-y-4">
              <Label className="text-sm font-medium">Photo Treatment</Label>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground">Brightness</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{(config.photoBrightness ?? 0.87).toFixed(2)}</span>
                  </div>
                  <Slider
                    min={0.70}
                    max={1.00}
                    step={0.01}
                    value={[config.photoBrightness ?? 0.87]}
                    onValueChange={([v]) => updateConfig({ photoBrightness: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground">Contrast</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{(config.photoContrast ?? 1.10).toFixed(2)}</span>
                  </div>
                  <Slider
                    min={1.00}
                    max={1.20}
                    step={0.01}
                    value={[config.photoContrast ?? 1.10]}
                    onValueChange={([v]) => updateConfig({ photoContrast: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground">Saturation</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{(config.photoSaturation ?? 0.83).toFixed(2)}</span>
                  </div>
                  <Slider
                    min={0.60}
                    max={1.00}
                    step={0.01}
                    value={[config.photoSaturation ?? 0.83]}
                    onValueChange={([v]) => updateConfig({ photoSaturation: v })}
                  />
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Colors */}
          <div className="space-y-4">
            <div className="space-y-3">
              <Label>Color Presets</Label>
              <div className="grid grid-cols-5 gap-2">
                {colorPresets.map((preset, index) => (
                  <button
                    key={index}
                    className="w-8 h-8 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors"
                    style={{ backgroundColor: preset.bg }}
                    onClick={() => updateConfig({
                      backgroundColor: preset.bg,
                      textColor: preset.text,
                      accentColor: preset.accent
                    })}
                  >
                    <div 
                      className="w-full h-2"
                      style={{ backgroundColor: preset.accent }}
                    />
                  </button>
                ))}
              </div>
            </div>

            {config.layout !== 'photo' && (
            <div className="space-y-3">
              <Label>Map styles (z maptoposter)</Label>
              <div className="grid grid-cols-5 gap-2">
                {mapColorPresets.map((preset) => (
                  <div key={preset.name} className="flex flex-col items-center gap-1">
                    <button
                      className="w-8 h-8 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors"
                      style={{ backgroundColor: preset.bg }}
                      onClick={() => updateConfig({
                        backgroundColor: preset.bg,
                        textColor: preset.text,
                        accentColor: preset.accent,
                      })}
                      aria-label={`Map style ${preset.name}`}
                      title={preset.name}
                    >
                      <div className="w-full h-2" style={{ backgroundColor: preset.accent }} />
                    </button>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">{preset.name}</span>
                  </div>
                ))}
              </div>
            </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bg-color">{config.layout === 'photo' ? 'Value' : 'Background'}</Label>
                <input
                  id="bg-color"
                  type="color"
                  value={config.backgroundColor}
                  onChange={(e) => updateConfig({ backgroundColor: e.target.value })}
                  className="w-full h-9 rounded border border-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="text-color">{config.layout === 'photo' ? 'Label' : 'Text'}</Label>
                <input
                  id="text-color"
                  type="color"
                  value={config.textColor}
                  onChange={(e) => updateConfig({ textColor: e.target.value })}
                  className="w-full h-9 rounded border border-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="accent-color">{config.layout === 'photo' ? 'Track' : 'Accent'}</Label>
                <input
                  id="accent-color"
                  type="color"
                  value={config.accentColor}
                  onChange={(e) => updateConfig({ accentColor: e.target.value })}
                  className="w-full h-9 rounded border border-input"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      </div>

      <div className="p-6 pt-4 border-t border-gray-200">
        <Button 
          onClick={onSummary}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white"
        >
          Summary
        </Button>
      </div>
    </div>
  );
}