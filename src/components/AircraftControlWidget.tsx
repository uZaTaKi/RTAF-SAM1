import React, { useRef, useState } from 'react';
import { AircraftTarget, SAMConfig } from '../types/simulation';
import {
  getBearingDeg,
  getDistanceNM,
  getSlantRangeNM,
  formatAltitudeFL,
  formatFlightLevel,
  machToKnots,
  knotsToKmh,
  normalizeDegree360,
  formatDegree360,
} from '../utils/geo';
import {
  Compass,
  ArrowUpRight,
  Gauge,
  Navigation,
  Trash2,
  X,
  Flame,
} from 'lucide-react';

interface AircraftControlWidgetProps {
  target: AircraftTarget;
  samConfig: SAMConfig;
  isEngaged: boolean;
  onUpdateHeading: (deg: number) => void;
  onUpdateAltitude: (altFt: number) => void;
  onUpdateSpeed: (mach: number) => void;
  onFaceSAMSite: () => void;
  onDeleteTarget: () => void;
  onClose: () => void;
  onFireAtTarget: () => void;
  canFire: boolean;
  activeMissileCount: number;
}

export const AircraftControlWidget: React.FC<AircraftControlWidgetProps> = ({
  target,
  samConfig,
  isEngaged,
  onUpdateHeading,
  onUpdateAltitude,
  onUpdateSpeed,
  onFaceSAMSite,
  onDeleteTarget,
  onClose,
  onFireAtTarget,
  canFire,
  activeMissileCount,
}) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDraggingDial, setIsDraggingDial] = useState<boolean>(false);

  // Bullseye active state and reference coordinates for BRA
  const isBeActive = Boolean(
    samConfig.bullseyeEnabled &&
    samConfig.bullseyeLat !== undefined &&
    samConfig.bullseyeLon !== undefined
  );
  const refLat = isBeActive ? samConfig.bullseyeLat! : samConfig.baseLat;
  const refLon = isBeActive ? samConfig.bullseyeLon! : samConfig.baseLon;

  // Bearing, Range, and 3D Slant Range to reference (Bullseye if active, SAM Site if not)
  const bearing = getBearingDeg(refLat, refLon, target.lat, target.lon);
  const groundRangeNM = getDistanceNM(refLat, refLon, target.lat, target.lon);
  const slantRangeNM = getSlantRangeNM(groundRangeNM, samConfig.baseElevationFt, target.altitudeFt);

  const bbb = formatDegree360(bearing);
  const rngFmt = Math.round(groundRangeNM).toString();
  const flFmt = formatFlightLevel(target.altitudeFt);

  // Altitude in hundreds of feet
  const altHundreds = Math.round(target.altitudeFt / 100);

  // Interactive compass dial math
  const handleDialPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingDial || !dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;

    let angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    onUpdateHeading(normalizeDegree360(angleDeg));
  };

  const handleDialPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingDial(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    handleDialPointerMove(e);
  };

  const handleDialPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingDial(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  return (
    <div className="w-full bg-slate-950/95 px-4 py-2 font-military text-slate-200 select-none flex flex-wrap items-center justify-between gap-3">
      {/* 1. Target Identity & BBB/range & FL */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-sm font-extrabold tracking-wide text-rose-400">
            {target.id}
          </span>
          {isEngaged && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500/60 text-rose-300 font-bold">
              ENGAGED
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 font-telemetry text-xs">
          <div>
            <span className="text-slate-400 text-[10px] mr-1">
              {isBeActive ? 'POS (BE):' : 'POS:'}
            </span>
            <span className="font-bold text-cyan-300">{bbb}/{rngFmt}</span>
          </div>
          <span className="text-slate-700">|</span>
          <div>
            <span className="text-slate-400 text-[10px] mr-1">ALT:</span>
            <span className="font-bold text-emerald-400">{flFmt}</span>
          </div>
          <span className="text-slate-700">|</span>
          <div>
            <span className="text-slate-400 text-[10px] mr-1">SPD:</span>
            <span className="font-bold text-amber-400">M{target.speedMach.toFixed(2)}</span>
            <span className="text-[10px] text-slate-400 ml-1">({Math.round(machToKnots(target.speedMach))} kts)</span>
          </div>
          <span className="text-slate-700 hidden sm:inline">|</span>
          <div className="hidden sm:block">
            <span className="text-slate-400 text-[10px] mr-1">SLANT:</span>
            <span className="text-amber-300 font-semibold">{slantRangeNM.toFixed(1)} NM</span>
          </div>
        </div>
      </div>

      {/* 2. Controls Grid: Heading (with dial), Altitude, Speed */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {/* Heading Control & Compact Dial */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-800">
          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 font-semibold">HDG:</span>
          </div>

          {/* Interactive Dial Ring (Increased size by 50%: 48px x 48px, perfectly centered SVG) */}
          <div
            ref={dialRef}
            onPointerDown={handleDialPointerDown}
            onPointerMove={handleDialPointerMove}
            onPointerUp={handleDialPointerUp}
            className="relative w-12 h-12 rounded-full bg-slate-950 border border-slate-700 hover:border-cyan-500/60 shadow-inner cursor-grab active:cursor-grabbing flex items-center justify-center touch-none shrink-0 transition-colors"
            title="Drag around ring to adjust heading (001° - 360°)"
          >
            <svg className="w-full h-full pointer-events-none select-none" viewBox="0 0 48 48">
              {/* Outer decorative dashed track */}
              <circle cx="24" cy="24" r="22" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="1.5 2.5" />

              {/* Fixed Cardinal Marks */}
              <circle cx="24" cy="4" r="1.5" fill="#EF4444" />
              <circle cx="44" cy="24" r="1" fill="#64748B" />
              <circle cx="24" cy="44" r="1" fill="#64748B" />
              <circle cx="4" cy="24" r="1" fill="#64748B" />

              {/* Rotating Pointer Needle centered exactly at (24, 24) */}
              <g transform={`rotate(${normalizeDegree360(target.headingDeg)}, 24, 24)`}>
                {/* Pointer tip triangle */}
                <polygon points="24,3 20.5,10 27.5,10" fill="#67E8F9" />
                {/* Main needle shaft */}
                <line x1="24" y1="24" x2="24" y2="8" stroke="#22D3EE" strokeWidth="2.5" strokeLinecap="round" />
                {/* Counterweight tail */}
                <line x1="24" y1="24" x2="24" y2="34" stroke="#0E7490" strokeWidth="2" strokeLinecap="round" />
              </g>

              {/* Center Pivot Point strictly at (24, 24) */}
              <circle cx="24" cy="24" r="3" fill="#22D3EE" stroke="#020617" strokeWidth="1.5" />
            </svg>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdateHeading(normalizeDegree360(target.headingDeg - 5))}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-telemetry"
              title="Turn 5 degrees left"
            >
              -5°
            </button>
            <input
              type="number"
              min={1}
              max={360}
              value={normalizeDegree360(target.headingDeg)}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) onUpdateHeading(normalizeDegree360(val));
              }}
              className="w-12 text-center text-xs py-0.5 bg-slate-950 border border-slate-700 rounded text-cyan-300 font-telemetry font-bold"
            />
            <button
              onClick={() => onUpdateHeading(normalizeDegree360(target.headingDeg + 5))}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-telemetry"
              title="Turn 5 degrees right"
            >
              +5°
            </button>
          </div>

          <button
            onClick={onFaceSAMSite}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-600/50 text-cyan-300 text-[11px] transition-colors"
            title="Orient directly toward SAM site"
          >
            <Navigation className="w-3 h-3 rotate-45" />
            <span className="hidden md:inline">FACE SAM</span>
          </button>
        </div>

        {/* Altitude Control */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-800">
          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400 font-semibold">ALT:</span>
          <button
            onClick={() => onUpdateAltitude(Math.max(500, target.altitudeFt - 1000))}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-telemetry"
          >
            -10
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step={5}
              min={5}
              max={800}
              value={altHundreds}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) onUpdateAltitude(Math.max(500, val * 100));
              }}
              className="w-12 text-center text-xs py-0.5 bg-slate-950 border border-slate-700 rounded text-emerald-300 font-telemetry font-bold"
            />
            <span className="text-[10px] text-slate-500 font-telemetry">x100</span>
          </div>
          <button
            onClick={() => onUpdateAltitude(Math.min(80000, target.altitudeFt + 1000))}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-telemetry"
          >
            +10
          </button>
        </div>

        {/* Speed Control */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-800">
          <Gauge className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400 font-semibold">SPD:</span>
          <button
            onClick={() => onUpdateSpeed(Math.max(0.1, +(target.speedMach - 0.05).toFixed(2)))}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-telemetry"
          >
            -0.05
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step={0.05}
              min={0.1}
              max={3.5}
              value={target.speedMach}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) onUpdateSpeed(Math.max(0.1, Math.min(3.5, val)));
              }}
              className="w-14 text-center text-xs py-0.5 bg-slate-950 border border-slate-700 rounded text-amber-300 font-telemetry font-bold"
            />
            <span className="text-[10px] text-slate-500 font-telemetry">M</span>
          </div>
          <button
            onClick={() => onUpdateSpeed(Math.min(3.5, +(target.speedMach + 0.05).toFixed(2)))}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-telemetry"
          >
            +0.05
          </button>
          <div className="ml-1 pl-1.5 border-l border-slate-700/80 flex flex-col justify-center text-[10px] font-telemetry leading-tight text-right">
            <span className="text-amber-400 font-bold">{Math.round(machToKnots(target.speedMach))} kts</span>
            <span className="text-slate-400 text-[9px]">{Math.round(knotsToKmh(machToKnots(target.speedMach)))} km/h</span>
          </div>
        </div>
      </div>

      {/* 3. Actions: Fire, Delete, Close */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onFireAtTarget}
          disabled={!canFire}
          className={`flex items-center gap-1.5 py-1.5 px-3 rounded text-xs font-bold transition-all shadow-md ${
            canFire
              ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer active:scale-95'
              : 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>FIRE</span>
        </button>

        <button
          onClick={onDeleteTarget}
          className="p-1.5 rounded bg-slate-900 hover:bg-rose-950/80 border border-slate-800 hover:border-rose-600 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
          title="Delete Target (Del)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Deselect Target"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
