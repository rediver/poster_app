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

interface PosterEditorProps {
  config: PosterConfig;
  onConfigChange: (config: PosterConfig) => void;
  onSummary: () => void;
}

export function PosterEditor({ config, onConfigChange, onSummary }: PosterEditorProps) {
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
        <h2>Transform your memories into beautiful poster</h2>
        <p className="text-muted-foreground">
          Upload your strava routes and create a beautiful poster just for you
        </p>
      </div>

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
          
          <div className="space-y-2">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input
              id="subtitle"
              value={config.subtitle}
              onChange={(e) => updateConfig({ subtitle: e.target.value })}
              placeholder="Enter subtitle (optional)"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="alphabet"
              checked={config.showAlphabet}
              onCheckedChange={(checked) => updateConfig({ showAlphabet: checked })}
            />
            <Label htmlFor="alphabet">Show alphabet</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Style & Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Format and Orientation */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Paper Size</Label>
                <ToggleGroup
                  type="single"
                  value={config.format}
                  onValueChange={(value) => value && updateConfig({ format: value as 'A3' | 'A4' })}
                  className="justify-start"
                >
                  <ToggleGroupItem value="A4" aria-label="A4 format">
                    A4
                  </ToggleGroupItem>
                  <ToggleGroupItem value="A3" aria-label="A3 format">
                    A3
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              
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
            </div>
          </div>

          <Separator />

          {/* Typography and Layout */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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

              <div className="space-y-2">
                <Label>Layout</Label>
                <Select
                  value={config.layout}
                  onValueChange={(value: 'map' | 'modern' | 'minimal') => updateConfig({ layout: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="map">Map</SelectItem>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

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

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bg-color">Background</Label>
                <input
                  id="bg-color"
                  type="color"
                  value={config.backgroundColor}
                  onChange={(e) => updateConfig({ backgroundColor: e.target.value })}
                  className="w-full h-9 rounded border border-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="text-color">Text</Label>
                <input
                  id="text-color"
                  type="color"
                  value={config.textColor}
                  onChange={(e) => updateConfig({ textColor: e.target.value })}
                  className="w-full h-9 rounded border border-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="accent-color">Accent</Label>
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