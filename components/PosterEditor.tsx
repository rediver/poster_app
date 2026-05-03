import React from 'react';
import { logModule, useLogMount } from '../src/debug';
logModule('components/PosterEditor.tsx module');
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { mapThemes } from '../src/mapThemes';
import { Map, Image, Minus } from 'lucide-react';

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
  photoTrackThickness?: number;
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

  const mapColorPresets = mapThemes.map((t) => ({
    name: t.name,
    bg: t.bg,
    text: t.text,
    accent: t.road_primary || t.road_default || t.text,
  }));

  type TreatmentKey = 'photoBrightness' | 'photoContrast' | 'photoSaturation' | 'photoTrackThickness';
  const treatmentSliders: Array<{
    label: string;
    key: TreatmentKey;
    min: number; max: number; step: number; def: number;
    fmt: (v: number) => string;
  }> = [
    { label: 'Brightness', key: 'photoBrightness',     min: 0.70, max: 1.00, step: 0.01, def: 0.87, fmt: (v) => v.toFixed(2) },
    { label: 'Contrast',   key: 'photoContrast',       min: 1.00, max: 1.20, step: 0.01, def: 1.10, fmt: (v) => v.toFixed(2) },
    { label: 'Saturation', key: 'photoSaturation',     min: 0.60, max: 1.00, step: 0.01, def: 0.83, fmt: (v) => v.toFixed(2) },
    { label: 'Track',      key: 'photoTrackThickness', min: 0.3,  max: 3.0,  step: 0.1,  def: 1.0,  fmt: (v) => `${v.toFixed(1)}×` },
  ];

  return (
    <div className="editor-sidebar-wrap">

      {/* ── Scrollable sections ── */}
      <div className="editor-sidebar-scroll">

        {/* 1 · Layout */}
        <div className="editor-section">
          <span className="editor-section-title">Layout</span>
          <div className="editor-mode-grid">
            {([
              { value: 'map'     as const, Icon: Map,   label: 'Map'     },
              { value: 'photo'   as const, Icon: Image, label: 'Photo'   },
              { value: 'minimal' as const, Icon: Minus, label: 'Minimal' },
            ]).map(({ value, Icon, label }) => (
              <button
                key={value}
                className={`editor-mode-tile${config.layout === value ? ' active' : ''}`}
                onClick={() => {
                  const updates: Partial<PosterConfig> = { layout: value };
                  if (value === 'minimal') updates.orientation = 'horizontal';
                  updateConfig(updates);
                }}
                aria-pressed={config.layout === value}
              >
                <Icon className="editor-tile-icon" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2 · Content */}
        <div className="editor-section">
          <span className="editor-section-title">Content</span>
          <label className="editor-label" htmlFor="poster-title">Title</label>
          <input
            id="poster-title"
            className="editor-input"
            value={config.title}
            onChange={(e) => updateConfig({ title: e.target.value })}
            placeholder="Enter activity title"
          />
        </div>

        {/* 3 · Photo — photo mode only */}
        {config.layout === 'photo' && (
          <div className="editor-section">
            <span className="editor-section-title">Photo</span>
            {photoUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ width: '100%', height: 84, borderRadius: 12, overflow: 'hidden', border: '1px solid #E8DED2' }}>
                  <img src={photoUrl} alt="Uploaded" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <button className="editor-btn-secondary" onClick={() => onClearPhoto?.()}>Change photo</button>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
                Drop a photo on the preview area or click it to upload.
              </p>
            )}
          </div>
        )}

        {/* 4 · Data Overlay */}
        <div className="editor-section">
          <div className="editor-section-header">
            <span className="editor-section-title" style={{ marginBottom: 0 }}>Data Overlay</span>
            <Switch
              id="data-overlay"
              checked={config.showDataOverlay}
              onCheckedChange={(checked) => updateConfig({ showDataOverlay: checked as boolean })}
            />
          </div>

          {config.showDataOverlay && config.layout === 'photo' && (
            <div className="editor-pill-row">
              {[
                { key: 'distance',  label: 'Distance'  },
                { key: 'elevation', label: 'Elevation' },
                { key: 'speed',     label: 'Pace'      },
                { key: 'date',      label: 'Date'      },
                { key: 'duration',  label: 'Time'      },
              ].map(({ key, label }) => {
                const active = (config.visibleStatKeys || []).includes(key);
                return (
                  <button
                    key={key}
                    className={`editor-pill${active ? ' active' : ''}`}
                    aria-pressed={active}
                    onClick={() => {
                      const current = config.visibleStatKeys || [];
                      const next = active
                        ? current.filter((k) => k !== key)
                        : [...current, key];
                      updateConfig({ visibleStatKeys: next });
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {config.showDataOverlay && (
            <div className="editor-fields-grid">
              <div>
                <label className="editor-label" htmlFor="ov-dist">Distance</label>
                <input id="ov-dist" className="editor-input" value={config.overlayData?.distance || ''}
                  onChange={(e) => updateConfig({ overlayData: { ...config.overlayData, distance: e.target.value } })}
                  placeholder="49.96 km" />
              </div>
              <div>
                <label className="editor-label" htmlFor="ov-dur">Duration</label>
                <input id="ov-dur" className="editor-input" value={config.overlayData?.duration || ''}
                  onChange={(e) => updateConfig({ overlayData: { ...config.overlayData, duration: e.target.value } })}
                  placeholder="1:47:09" />
              </div>
              <div>
                <label className="editor-label" htmlFor="ov-spd">Pace / Speed</label>
                <input id="ov-spd" className="editor-input" value={config.overlayData?.speed || ''}
                  onChange={(e) => updateConfig({ overlayData: { ...config.overlayData, speed: e.target.value } })}
                  placeholder="27.98 km/h" />
              </div>
              <div>
                <label className="editor-label" htmlFor="ov-elev">Elevation</label>
                <input id="ov-elev" className="editor-input" value={config.overlayData?.elevation || ''}
                  onChange={(e) => updateConfig({ overlayData: { ...config.overlayData, elevation: e.target.value } })}
                  placeholder="740 m" />
              </div>
              <div className="editor-fields-full">
                <label className="editor-label" htmlFor="ov-date">Date</label>
                <input id="ov-date" className="editor-input" value={config.overlayData?.date || ''}
                  onChange={(e) => updateConfig({ overlayData: { ...config.overlayData, date: e.target.value } })}
                  placeholder="April 4th, 2026" />
              </div>
            </div>
          )}
        </div>

        {/* 5 · Style & Format */}
        <div className="editor-section">
          <span className="editor-section-title">Style & Format</span>

          <div style={{ marginBottom: 14 }}>
            <label className="editor-label">Orientation</label>
            <div className="editor-segment">
              {([
                { value: 'vertical'   as const, label: 'Portrait'  },
                { value: 'horizontal' as const, label: 'Landscape' },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  className={`editor-segment-btn${config.orientation === value ? ' active' : ''}`}
                  onClick={() => updateConfig({ orientation: value })}
                  aria-pressed={config.orientation === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: config.layout === 'photo' ? 14 : 0 }}>
            <label className="editor-label" htmlFor="font-select">
              {config.layout === 'photo' ? 'Title Font' : 'Font'}
            </label>
            <select
              id="font-select"
              className="editor-input editor-select"
              value={config.layout === 'photo'
                ? (config.photoTitleFont || "'Cormorant Garamond', serif")
                : config.fontFamily
              }
              onChange={(e) => {
                if (config.layout === 'photo') {
                  updateConfig({ photoTitleFont: e.target.value });
                } else {
                  updateConfig({ fontFamily: e.target.value });
                }
              }}
            >
              {(config.layout === 'photo' ? photoTitleFontOptions : fontOptions).map((font) => (
                <option key={font.value} value={font.value}>{font.label}</option>
              ))}
            </select>
          </div>

          {config.layout === 'photo' && (
            <div style={{ paddingTop: 14, borderTop: '1px solid #E8DED2' }}>
              <span className="editor-section-title" style={{ marginBottom: 12 }}>Photo Treatment</span>
              {treatmentSliders.map(({ label, key, min, max, step, def, fmt }) => {
                const val = (config[key] as number | undefined) ?? def;
                return (
                  <div key={key} className="editor-slider-row">
                    <div className="editor-slider-header">
                      <span className="editor-label" style={{ marginBottom: 0 }}>{label}</span>
                      <span className="editor-slider-val">{fmt(val)}</span>
                    </div>
                    <Slider
                      min={min} max={max} step={step}
                      value={[val]}
                      onValueChange={([v]) => updateConfig({ [key]: v } as Partial<PosterConfig>)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 6 · Style Color (map) / Color (photo, minimal) */}
        <div className="editor-section">
          <span className="editor-section-title">
            {config.layout === 'map' ? 'Style Color' : 'Color'}
          </span>

          <div className="editor-swatch-row">
            {(config.layout === 'map' ? mapColorPresets : colorPresets).map((preset, i) => {
              const isActive =
                config.backgroundColor === preset.bg &&
                config.accentColor === preset.accent;
              const name = 'name' in preset ? (preset as {name: string}).name : `Preset ${i + 1}`;
              return (
                <button
                  key={i}
                  className={`editor-swatch${isActive ? ' active' : ''}`}
                  style={{ backgroundColor: preset.bg }}
                  onClick={() => updateConfig({
                    backgroundColor: preset.bg,
                    textColor: preset.text,
                    accentColor: preset.accent,
                  })}
                  aria-label={name}
                  title={name}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: 6, backgroundColor: preset.accent,
                      borderRadius: '0 0 6px 6px',
                    }}
                  />
                </button>
              );
            })}
          </div>

          <div className="editor-color-pickers">
            <div>
              <label className="editor-label" htmlFor="col-bg">
                {config.layout === 'photo' ? 'Value' : 'Background'}
              </label>
              <input id="col-bg" type="color" value={config.backgroundColor}
                onChange={(e) => updateConfig({ backgroundColor: e.target.value })}
                className="editor-color-input" />
            </div>
            <div>
              <label className="editor-label" htmlFor="col-text">
                {config.layout === 'photo' ? 'Label' : 'Text'}
              </label>
              <input id="col-text" type="color" value={config.textColor}
                onChange={(e) => updateConfig({ textColor: e.target.value })}
                className="editor-color-input" />
            </div>
            <div>
              <label className="editor-label" htmlFor="col-accent">
                {config.layout === 'photo' ? 'Track' : 'Accent'}
              </label>
              <input id="col-accent" type="color" value={config.accentColor}
                onChange={(e) => updateConfig({ accentColor: e.target.value })}
                className="editor-color-input" />
            </div>
          </div>
        </div>

        <div style={{ height: 8 }} />
      </div>

      {/* ── CTA footer ── */}
      <div className="editor-cta-footer">
        <button className="editor-cta" onClick={onSummary}>
          Summary →
        </button>
      </div>

    </div>
  );
}
