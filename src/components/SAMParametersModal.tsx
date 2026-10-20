import React, { useState } from 'react';
import { SAMConfig, RadarRing } from '../types/simulation';
import { decimalToDDMM, parseDDMM, formatMMSS } from '../utils/geo';
import { SAM_PRESETS, DEFAULT_SAM_CONFIG } from '../utils/presets';
import { triggerFileDownload } from '../utils/gpxExporter';
import {
  Settings,
  X,
  RotateCcw,
  Save,
  Upload,
  Plus,
  Trash2,
  Check,
  AlertCircle,
} from 'lucide-react';

interface SAMParametersModalProps {
  config: SAMConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newConfig: SAMConfig) => void;
}

export const SAMParametersModal: React.FC<SAMParametersModalProps> = ({
  config,
  isOpen,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<SAMConfig>({ ...config });
  const [latInput, setLatInput] = useState<string>(decimalToDDMM(config.baseLat, true));
  const [lonInput, setLonInput] = useState<string>(decimalToDDMM(config.baseLon, false));
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('ks1c');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyPreset = (key: string) => {
    const preset = SAM_PRESETS[key];
    if (preset) {
      setSelectedPresetKey(key);
      setFormData({ ...preset });
      setLatInput(decimalToDDMM(preset.baseLat, true));
      setLonInput(decimalToDDMM(preset.baseLon, false));
      setStatusMsg(`Loaded preset: ${preset.systemName}`);
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const handleResetToDefault = () => {
    setSelectedPresetKey('ks1c');
    setFormData({ ...DEFAULT_SAM_CONFIG });
    setLatInput(decimalToDDMM(DEFAULT_SAM_CONFIG.baseLat, true));
    setLonInput(decimalToDDMM(DEFAULT_SAM_CONFIG.baseLon, false));
    setStatusMsg('Reset to default system configuration.');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleSaveToFile = () => {
    const jsonStr = JSON.stringify(formData, null, 2);
    triggerFileDownload(jsonStr, `${formData.systemName.replace(/[\s/]/g, '_')}_config.json`, 'application/json');
  };

  const handleLoadFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const loaded = JSON.parse(evt.target?.result as string);
        if (loaded && loaded.systemName && Array.isArray(loaded.radarRings)) {
          setFormData(loaded);
          setLatInput(decimalToDDMM(loaded.baseLat, true));
          setLonInput(decimalToDDMM(loaded.baseLon, false));
          setStatusMsg(`Loaded config from ${file.name}`);
          setTimeout(() => setStatusMsg(null), 3000);
        }
      } catch (err) {
        alert('Invalid JSON configuration file');
      }
    };
    reader.readAsText(file);
  };

  const handleAddRing = () => {
    const nextRadius = (formData.radarRings[formData.radarRings.length - 1]?.radiusNM || 10) + 15;
    const newRing: RadarRing = {
      id: `ring_${Date.now()}`,
      name: `Outer Boundary Zone ${formData.radarRings.length + 1}`,
      radiusNM: nextRadius,
      color: '#06B6D4',
      fillAlpha: 0.04,
    };
    setFormData({
      ...formData,
      radarRings: [...formData.radarRings, newRing],
    });
  };

  const handleRemoveRing = (index: number) => {
    setFormData({
      ...formData,
      radarRings: formData.radarRings.filter((_, i) => i !== index),
    });
  };

  const handleUpdateRing = (index: number, updates: Partial<RadarRing>) => {
    const updated = [...formData.radarRings];
    updated[index] = { ...updated[index], ...updates };
    setFormData({ ...formData, radarRings: updated });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate coordinates
    const parsedLat = parseDDMM(latInput);
    const parsedLon = parseDDMM(lonInput);

    if (parsedLat === null || parsedLon === null) {
      alert("Invalid Coordinates format. Please use DD° MM.MMM' N/S/E/W (e.g. 15° 17.500' N)");
      return;
    }

    const finalConfig: SAMConfig = {
      ...formData,
      baseLat: parsedLat,
      baseLon: parsedLon,
    };

    onSave(finalConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-military">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden text-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold tracking-wide uppercase text-slate-100">
              SAM SYSTEM PARAMETERS & RADAR CONFIGURATION
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar: Presets & File Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-800/80 bg-slate-900/40 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">PRESETS:</span>
            <select
              value={selectedPresetKey}
              onChange={(e) => handleApplyPreset(e.target.value)}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-cyan-300 font-semibold focus:outline-hidden focus:border-cyan-500"
            >
              <option value="ks1c">RTAF KS-1C (HQ-12) Medium-Range</option>
              <option value="spada">RTAF Spada / Aspide-2000</option>
              <option value="long_range">RTAF Long-Range Area Defense</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>LOAD FILE</span>
              <input type="file" accept=".json" onChange={handleLoadFromFile} className="hidden" />
            </label>
            <button
              onClick={handleSaveToFile}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>SAVE TO FILE</span>
            </button>
            <button
              onClick={handleResetToDefault}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-rose-300 transition-colors"
              title="Reset to Factory Defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>RESET</span>
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="px-5 py-2 bg-cyan-950/50 border-b border-cyan-800/60 text-xs text-cyan-300 flex items-center gap-2">
            <Check className="w-3.5 h-3.5" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Section 1: System Identity & Base Coordinates */}
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              1. SYSTEM IDENTITY & SAM BASE LOCATION
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">System Name / Site Designation</label>
                <input
                  type="text"
                  value={formData.systemName}
                  onChange={(e) => setFormData({ ...formData, systemName: e.target.value })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-semibold focus:outline-hidden focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Base Elevation (ft MSL)</label>
                <input
                  type="number"
                  value={formData.baseElevationFt}
                  onChange={(e) => setFormData({ ...formData, baseElevationFt: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-telemetry focus:outline-hidden focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Latitude (DD° MM.MMM' N/S)</label>
                <input
                  type="text"
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  placeholder="15° 17.500' N"
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-cyan-300 font-telemetry focus:outline-hidden focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Longitude (DD° MM.MMM' E/W)</label>
                <input
                  type="text"
                  value={lonInput}
                  onChange={(e) => setLonInput(e.target.value)}
                  placeholder="100° 17.800' E"
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-cyan-300 font-telemetry focus:outline-hidden focus:border-cyan-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Launchers & Kinetic Parameters */}
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              2. LAUNCHER MATRIX & MISSILE KINEMATICS
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Number of Launchers</label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={formData.launcherCount}
                  onChange={(e) => setFormData({ ...formData, launcherCount: parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-telemetry"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Missiles per Launcher</label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={formData.missilesPerLauncher}
                  onChange={(e) => setFormData({ ...formData, missilesPerLauncher: parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-telemetry"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Missile Speed (Mach)</label>
                <input
                  type="number"
                  step={0.1}
                  min={0.5}
                  max={6.0}
                  value={formData.missileSpeedMach}
                  onChange={(e) => setFormData({ ...formData, missileSpeedMach: parseFloat(e.target.value) || 2.0 })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-amber-300 font-telemetry font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Time of Flight (TOF s)</label>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={formData.timeOfFlightSec}
                  onChange={(e) => setFormData({ ...formData, timeOfFlightSec: parseInt(e.target.value, 10) || 45 })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-amber-300 font-telemetry font-bold"
                />
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400">Launcher Reload Time (Max 10 min)</label>
                  <span className="text-amber-300 font-telemetry font-bold">
                    {formatMMSS(formData.launcherReloadTimeSec)} ({formData.launcherReloadTimeSec}s)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-700">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={Math.floor(formData.launcherReloadTimeSec / 60)}
                      onChange={(e) => {
                        const m = Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0));
                        const s = formData.launcherReloadTimeSec % 60;
                        const total = Math.min(600, m * 60 + s);
                        setFormData({ ...formData, launcherReloadTimeSec: total });
                      }}
                      className="w-10 text-center text-slate-100 font-telemetry font-bold bg-transparent focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 font-telemetry">min</span>
                    <span className="text-slate-600">:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={formData.launcherReloadTimeSec % 60}
                      onChange={(e) => {
                        const m = Math.floor(formData.launcherReloadTimeSec / 60);
                        const s = Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0));
                        const total = Math.min(600, m * 60 + s);
                        setFormData({ ...formData, launcherReloadTimeSec: total });
                      }}
                      className="w-10 text-center text-slate-100 font-telemetry font-bold bg-transparent focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 font-telemetry">sec</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={600}
                    step={5}
                    value={formData.launcherReloadTimeSec}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        launcherReloadTimeSec: parseInt(e.target.value, 10) || 5,
                      })
                    }
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Max Simultaneous Shots</label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={formData.maxSimultaneousEngagements}
                  onChange={(e) => setFormData({ ...formData, maxSimultaneousEngagements: parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-rose-300 font-telemetry font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Default Spawn Alt (ft)</label>
                <input
                  type="number"
                  step={1000}
                  min={1000}
                  max={60000}
                  value={formData.defaultSpawnAltitudeFt}
                  onChange={(e) => setFormData({ ...formData, defaultSpawnAltitudeFt: parseInt(e.target.value, 10) || 20000 })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-emerald-300 font-telemetry"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Default Spawn Speed (M)
                  <span className="text-amber-400 font-normal ml-2 text-xs">
                    (≈ {Math.round((formData.defaultSpawnSpeedMach || 0.85) * 661.47)} kts)
                  </span>
                </label>
                <input
                  type="number"
                  step={0.05}
                  min={0.2}
                  max={2.5}
                  value={formData.defaultSpawnSpeedMach}
                  onChange={(e) => setFormData({ ...formData, defaultSpawnSpeedMach: parseFloat(e.target.value) || 0.85 })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-telemetry"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Radar Tracking Range Rings */}
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                3. RADAR TRACKING RINGS & CAPABILITY ENVELOPES
              </div>
              <button
                type="button"
                onClick={handleAddRing}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-cyan-950 border border-cyan-600/50 text-cyan-300 hover:bg-cyan-900 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ADD RADAR RING</span>
              </button>
            </div>

            <div className="space-y-2">
              {formData.radarRings.map((ring, idx) => (
                <div
                  key={ring.id}
                  className="flex flex-wrap items-center gap-2 p-2 rounded bg-slate-950 border border-slate-800 text-xs"
                >
                  <span className="w-6 font-telemetry text-slate-500 font-bold">#{idx + 1}</span>
                  <div className="flex-1 min-w-[140px]">
                    <input
                      type="text"
                      value={ring.name}
                      onChange={(e) => handleUpdateRing(idx, { name: e.target.value })}
                      placeholder="Ring Name / Capability"
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200"
                    />
                  </div>
                  <div className="w-24">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={ring.radiusNM}
                        onChange={(e) => handleUpdateRing(idx, { radiusNM: parseFloat(e.target.value) || 1 })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-cyan-300 font-telemetry"
                      />
                      <span className="text-[10px] text-slate-400">NM</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={ring.color}
                      onChange={(e) => handleUpdateRing(idx, { color: e.target.value })}
                      className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveRing(idx)}
                    disabled={formData.radarRings.length <= 1}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove Ring"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-slate-950 transition-colors shadow-lg shadow-cyan-900/30"
            >
              <Check className="w-4 h-4" />
              <span>APPLY PARAMETERS</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
