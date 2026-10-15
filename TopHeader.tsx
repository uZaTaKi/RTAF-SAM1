import React, { useState, useEffect } from 'react';
import {
  Play,
  Square,
  Crosshair,
  Settings,
  Upload,
  Plus,
  Trash2,
  Clock,
  Radio,
  FileDown,
} from 'lucide-react';

interface TopHeaderProps {
  systemName: string;
  isSimRunning: boolean;
  sampleCount: number;
  onStartSim: () => void;
  onStopSim: () => void;
  onRecenter: () => void;
  onOpenSettings: () => void;
  onUploadKml: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onQuickSpawnTarget: () => void;
  onClearTargets: () => void;
  targetCount: number;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  systemName,
  isSimRunning,
  sampleCount,
  onStartSim,
  onStopSim,
  onRecenter,
  onOpenSettings,
  onUploadKml,
  onQuickSpawnTarget,
  onClearTargets,
  targetCount,
}) => {
  const [currentTime, setCurrentTime] = useState<{ local: string; zulu: string }>({
    local: '',
    zulu: '',
  });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const localStr = now.toLocaleTimeString('en-US', { hour12: false });
      const zuluHours = now.getUTCHours().toString().padStart(2, '0');
      const zuluMins = now.getUTCMinutes().toString().padStart(2, '0');
      const zuluSecs = now.getUTCSeconds().toString().padStart(2, '0');
      setCurrentTime({
        local: localStr,
        zulu: `${zuluHours}:${zuluMins}:${zuluSecs}Z`,
      });
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-slate-200 font-military shadow-md select-none">
      {/* Brand & C2 System Title */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 font-bold shadow-xs shadow-cyan-500/30">
          <Crosshair className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm md:text-base font-extrabold tracking-wider text-slate-100 uppercase">
              RTAF SAM-1 - SAM Simulation System
            </h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-telemetry">
              {systemName}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-telemetry">
            FLIGHT OPERATIONS SUPPORT · 4 HZ GPX TELEMETRY RECORDER
          </div>
        </div>
      </div>

      {/* Clocks & 4Hz Status */}
      <div className="flex items-center gap-4 bg-slate-900/60 px-3 py-1.5 rounded border border-slate-800 font-telemetry text-xs">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">LOC:</span>
          <span className="text-slate-200 font-semibold">{currentTime.local}</span>
        </div>
        <div className="w-[1px] h-3.5 bg-slate-800" />
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">ZULU:</span>
          <span className="text-cyan-400 font-bold">{currentTime.zulu}</span>
        </div>

        {isSimRunning && (
          <>
            <div className="w-[1px] h-3.5 bg-slate-800" />
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <Radio className="w-3.5 h-3.5 animate-pulse text-rose-500" />
              <span>REC 4Hz ({sampleCount} pts)</span>
            </div>
          </>
        )}
      </div>

      {/* Primary Action Controls */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Simulation Run / Stop Recording Button */}
        {!isSimRunning ? (
          <button
            onClick={onStartSim}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-all shadow-md shadow-emerald-950/40 cursor-pointer active:scale-95"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>START SIMULATION</span>
          </button>
        ) : (
          <button
            onClick={onStopSim}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-950/40 cursor-pointer active:scale-95 animate-pulse"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>STOP & EXPORT GPX</span>
          </button>
        )}

        <div className="w-[1px] h-4 bg-slate-800 hidden sm:block" />

        {/* Quick Spawn Target */}
        <button
          onClick={onQuickSpawnTarget}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors"
          title="Spawn target facing SAM site"
        >
          <Plus className="w-3.5 h-3.5 text-cyan-400" />
          <span>+ TARGET</span>
        </button>

        {/* Upload KML / KMZ Overlay */}
        <label
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer transition-colors"
          title="Upload Google Earth KML / KMZ or GeoJSON drawings"
        >
          <Upload className="w-3.5 h-3.5 text-sky-400" />
          <span>KML/KMZ</span>
          <input
            type="file"
            accept=".kml,.kmz,.geojson,.json"
            onChange={onUploadKml}
            className="hidden"
          />
        </label>

        {/* Recenter SAM Button */}
        <button
          onClick={onRecenter}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors"
          title="Recenter Map on SAM Site"
        >
          <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden md:inline">RECENTER</span>
        </button>

        {/* System Settings Button */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 transition-colors"
          title="Configure SAM System Parameters & Radar Rings"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>PARAMS</span>
        </button>

        {/* Clear Targets */}
        {targetCount > 0 && (
          <button
            onClick={onClearTargets}
            className="p-1.5 rounded bg-slate-900 hover:bg-rose-950/50 border border-slate-800 hover:border-rose-700 text-slate-500 hover:text-rose-300 transition-colors"
            title="Clear All Aircraft Targets"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </header>
  );
};
