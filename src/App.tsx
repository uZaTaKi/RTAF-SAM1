import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SAMConfig,
  LauncherState,
  AircraftTarget,
  ActiveMissile,
  VisualEffect,
  ShotLogEntry,
  TacticalOverlay,
  SimulationTelemetrySample,
} from './types/simulation';
import {
  getBearingDeg,
  getDistanceNM,
  getDestinationLatLon,
  getSlantRangeNM,
  decimalToDDMM,
  MACH_TO_NM_PER_SEC,
  normalizeDegree360,
  formatDegree360,
} from './utils/geo';
import { DEFAULT_SAM_CONFIG, SAM_PRESETS } from './utils/presets';
import {
  saveSAMConfigToStorage,
  loadSAMConfigFromStorage,
  saveShotLogsToStorage,
  saveTelemetryBufferToStorage,
  clearAllHistoryFromStorage,
} from './utils/storage';
import { parseOverlayFile } from './utils/kmlParser';
import {
  generateUnifiedGPX,
  generateAircraftGPX,
  generateBatteryMissilesGPX,
  triggerFileDownload,
} from './utils/gpxExporter';

import { TopHeader } from './components/TopHeader';
import { RadarScope } from './components/RadarScope';
import { FiringControlPanel } from './components/FiringControlPanel';
import { AircraftControlWidget } from './components/AircraftControlWidget';
import { ShotLogPanel } from './components/ShotLogPanel';
import { SAMParametersModal } from './components/SAMParametersModal';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Navigation,
  Plus,
  FileDown,
  Check,
  X,
  Plane,
  Layers,
  RotateCcw,
  Shield,
  AlertTriangle,
} from 'lucide-react';

export default function App() {
  // 1. SAM System Configuration State
  const [samConfig, setSAMConfig] = useState<SAMConfig>(() => {
    return loadSAMConfigFromStorage() || DEFAULT_SAM_CONFIG;
  });

  // 2. Launchers State (with independent reload timers)
  const [launchers, setLaunchers] = useState<LauncherState[]>(() => {
    return Array.from({ length: samConfig.launcherCount }).map((_, idx) => ({
      id: idx + 1,
      missilesRemaining: samConfig.missilesPerLauncher,
      maxMissiles: samConfig.missilesPerLauncher,
      reloadTimeSec: samConfig.launcherReloadTimeSec,
      reloadRemainingSec: 0,
      isReloading: false,
    }));
  });

  const [nextLauncherIndex, setNextLauncherIndex] = useState<number>(0);

  // 3. Targets and Target Naming Sequence (T1, T2, T3...)
  const [targets, setTargets] = useState<AircraftTarget[]>([]);
  const targetCounterRef = useRef<number>(1);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // 4. Active Missiles & Visual Effects
  const [missiles, setMissiles] = useState<ActiveMissile[]>([]);
  const missileCounterRef = useRef<number>(1);
  const [selectedMissileId, setSelectedMissileId] = useState<string | null>(null);
  const [visualEffects, setVisualEffects] = useState<VisualEffect[]>([]);

  // 5. Shot Logs (Reset clean on every program start)
  const [shotLogs, setShotLogs] = useState<ShotLogEntry[]>([]);
  const shotCounterRef = useRef<number>(1);

  // 6. Tactical Overlays (KML / GeoJSON)
  const [tacticalOverlays, setTacticalOverlays] = useState<TacticalOverlay[]>([]);

  // Synchronized refs to decouple animation loop from React render cycle and ensure real-time accuracy
  const targetsRef = useRef<AircraftTarget[]>(targets);
  targetsRef.current = targets;

  const missilesRef = useRef<ActiveMissile[]>(missiles);
  missilesRef.current = missiles;

  const samConfigRef = useRef<SAMConfig>(samConfig);
  samConfigRef.current = samConfig;

  // 7. Simulation State & 10Hz Telemetry Recording (Reset clean on every program start)
  const [isSimRunning, setIsSimRunning] = useState<boolean>(false);
  const isSimRunningRef = useRef<boolean>(isSimRunning);
  isSimRunningRef.current = isSimRunning;
  const lastFrameTimeRef = useRef<number>(performance.now());
  const telemetryBufferRef = useRef<SimulationTelemetrySample[]>([]);
  const [sampleCount, setSampleCount] = useState<number>(0);
  const simStartTimeRef = useRef<number | null>(null);
  const lastSampleTimeRef = useRef<number>(0);

  // 8. UI Modals and Layout toggles
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isShotLogExpanded, setIsShotLogExpanded] = useState<boolean>(false);
  const [isFiringPanelOpen, setIsFiringPanelOpen] = useState<boolean>(true);
  const [isExportPromptOpen, setIsExportPromptOpen] = useState<boolean>(false);
  const [exportSelection, setExportSelection] = useState<'all' | 'aircraft' | 'battery'>('all');
  const [isResetPromptOpen, setIsResetPromptOpen] = useState<boolean>(false);

  // Reset all history data every time the program starts
  useEffect(() => {
    clearAllHistoryFromStorage();
  }, []);

  // Synchronize launchers state if config launcher count changes
  useEffect(() => {
    setLaunchers((prev) => {
      return Array.from({ length: samConfig.launcherCount }).map((_, idx) => {
        const existing = prev[idx];
        if (existing) {
          return {
            ...existing,
            maxMissiles: samConfig.missilesPerLauncher,
            reloadTimeSec: samConfig.launcherReloadTimeSec,
            missilesRemaining: Math.min(existing.missilesRemaining, samConfig.missilesPerLauncher),
          };
        }
        return {
          id: idx + 1,
          missilesRemaining: samConfig.missilesPerLauncher,
          maxMissiles: samConfig.missilesPerLauncher,
          reloadTimeSec: samConfig.launcherReloadTimeSec,
          reloadRemainingSec: 0,
          isReloading: false,
        };
      });
    });
  }, [samConfig.launcherCount, samConfig.missilesPerLauncher, samConfig.launcherReloadTimeSec]);

  // Persist config and logs changes
  useEffect(() => {
    saveSAMConfigToStorage(samConfig);
  }, [samConfig]);

  useEffect(() => {
    saveShotLogsToStorage(shotLogs);
  }, [shotLogs]);

  // Periodic telemetry backup every 15s to avoid main thread freeze
  useEffect(() => {
    const timer = setInterval(() => {
      if (telemetryBufferRef.current.length > 0) {
        saveTelemetryBufferToStorage(telemetryBufferRef.current);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Helper to determine radar zone at current range
  const getQualityOfShotZone = useCallback((rangeNM: number): string => {
    // Sort rings ascending by radius
    const sorted = [...samConfig.radarRings].sort((a, b) => a.radiusNM - b.radiusNM);
    for (const ring of sorted) {
      if (rangeNM <= ring.radiusNM) {
        return ring.name;
      }
    }
    return `Beyond Envelope (> ${sorted[sorted.length - 1]?.radiusNM || 50} NM)`;
  }, [samConfig.radarRings]);

  // Spawn New Target Aircraft
  const handleSpawnTarget = useCallback((lat: number, lon: number) => {
    const id = `T${targetCounterRef.current++}`;
    // Default orientation: faces directly toward the SAM base
    const bearingToSAM = getBearingDeg(lat, lon, samConfig.baseLat, samConfig.baseLon);

    const newTarget: AircraftTarget = {
      id,
      lat,
      lon,
      altitudeFt: samConfig.defaultSpawnAltitudeFt,
      headingDeg: normalizeDegree360(bearingToSAM),
      speedMach: samConfig.defaultSpawnSpeedMach,
      spawnTimeMs: Date.now(),
      isEngaged: false,
    };

    setTargets((prev) => {
      const updated = [...prev, newTarget];
      targetsRef.current = updated;
      return updated;
    });
    setSelectedTargetId(id);
  }, [samConfig]);

  // Quick Spawn Target at default range (~25 NM north-east)
  const handleQuickSpawnTarget = () => {
    const pos = getDestinationLatLon(samConfig.baseLat, samConfig.baseLon, 45, 25);
    handleSpawnTarget(pos.lat, pos.lon);
  };

  // Update Target Position (dragged on map)
  const handleUpdateTargetPosition = useCallback((id: string, lat: number, lon: number) => {
    setTargets((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, lat, lon } : t));
      targetsRef.current = updated;
      return updated;
    });
  }, []);

  // Delete Target
  const handleDeleteTarget = useCallback((id: string) => {
    setTargets((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      targetsRef.current = updated;
      return updated;
    });
    if (selectedTargetId === id) setSelectedTargetId(null);
  }, [selectedTargetId]);

  // Clear all targets
  const handleClearAllTargets = () => {
    setTargets([]);
    setSelectedTargetId(null);
  };

  // Master Reset: Clear all simulation state, targets, missiles, launchers, logs, and telemetry history to start fresh
  const handleResetAll = useCallback(() => {
    // 1. Stop simulation
    setIsSimRunning(false);
    isSimRunningRef.current = false;
    simStartTimeRef.current = null;
    lastSampleTimeRef.current = 0;

    // 2. Clear targets & selection
    setTargets([]);
    setSelectedTargetId(null);
    targetCounterRef.current = 1;

    // 3. Clear active missiles & visual effects
    setMissiles([]);
    setSelectedMissileId(null);
    missileCounterRef.current = 1;
    setVisualEffects([]);

    // 4. Reset launchers to full capacity and ready state
    setLaunchers(
      Array.from({ length: samConfig.launcherCount }).map((_, idx) => ({
        id: idx + 1,
        missilesRemaining: samConfig.missilesPerLauncher,
        maxMissiles: samConfig.missilesPerLauncher,
        reloadTimeSec: samConfig.launcherReloadTimeSec,
        reloadRemainingSec: 0,
        isReloading: false,
      }))
    );
    setNextLauncherIndex(0);

    // 5. Clear shot logs & telemetry buffers
    setShotLogs([]);
    shotCounterRef.current = 1;
    telemetryBufferRef.current = [];
    setSampleCount(0);
    clearAllHistoryFromStorage();

    // 6. Close reset confirmation modal
    setIsResetPromptOpen(false);
  }, [samConfig.launcherCount, samConfig.missilesPerLauncher, samConfig.launcherReloadTimeSec]);

  // Fire Action
  const handleFire = () => {
    if (!selectedTargetId) return;
    const target = targets.find((t) => t.id === selectedTargetId);
    if (!target) return;

    // Check active simultaneous limit
    const activeMissilesCount = missiles.filter((m) => m.status === 'IN_FLIGHT').length;
    if (activeMissilesCount >= samConfig.maxSimultaneousEngagements) return;

    // Pick active firing launcher: Fire from current launcher until depleted
    let chosenLauncherIdx = nextLauncherIndex;

    // If current launcher is empty or reloading, search for first available launcher
    if (
      !launchers[chosenLauncherIdx] ||
      launchers[chosenLauncherIdx].missilesRemaining <= 0 ||
      launchers[chosenLauncherIdx].isReloading
    ) {
      let found = -1;
      for (let i = 0; i < launchers.length; i++) {
        const idx = (nextLauncherIndex + i) % launchers.length;
        if (launchers[idx].missilesRemaining > 0 && !launchers[idx].isReloading) {
          found = idx;
          break;
        }
      }
      chosenLauncherIdx = found;
    }

    if (chosenLauncherIdx === -1) {
      alert('All launchers are currently depleted or reloading!');
      return;
    }

    const launcher = launchers[chosenLauncherIdx];
    const newRemaining = launcher.missilesRemaining - 1;
    const needsReload = newRemaining === 0;

    // Update launcher state
    setLaunchers((prev) =>
      prev.map((l, idx) => {
        if (idx === chosenLauncherIdx) {
          return {
            ...l,
            missilesRemaining: newRemaining,
            isReloading: needsReload,
            reloadRemainingSec: needsReload ? l.reloadTimeSec : 0,
          };
        }
        return l;
      })
    );

    // If launcher ran out of missiles, advance to next launcher; otherwise stay on this same launcher!
    if (needsReload) {
      let nextAvailable = -1;
      for (let i = 1; i <= launchers.length; i++) {
        const candidate = (chosenLauncherIdx + i) % launchers.length;
        if (launchers[candidate].missilesRemaining > 0 && !launchers[candidate].isReloading) {
          nextAvailable = candidate;
          break;
        }
      }
      setNextLauncherIndex(nextAvailable !== -1 ? nextAvailable : (chosenLauncherIdx + 1) % launchers.length);
    } else {
      setNextLauncherIndex(chosenLauncherIdx);
    }

    // Calculate initial engagement parameters
    const initBearing = getBearingDeg(samConfig.baseLat, samConfig.baseLon, target.lat, target.lon);
    const initRange = getDistanceNM(samConfig.baseLat, samConfig.baseLon, target.lat, target.lon);
    const initSlant = getSlantRangeNM(initRange, samConfig.baseElevationFt, target.altitudeFt);
    const zoneName = getQualityOfShotZone(initRange);

    const missileId = `M${missileCounterRef.current++}`;
    const shotId = `#S${shotCounterRef.current++}`;

    const now = new Date();
    const localTimeStr = now.toLocaleTimeString('en-US', { hour12: false });
    const zuluHours = now.getUTCHours().toString().padStart(2, '0');
    const zuluMins = now.getUTCMinutes().toString().padStart(2, '0');
    const zuluSecs = now.getUTCSeconds().toString().padStart(2, '0');
    const zuluTimeStr = `${zuluHours}:${zuluMins}:${zuluSecs}Z`;
    const targetInitialCoordsStr = `${decimalToDDMM(target.lat, true)}, ${decimalToDDMM(target.lon, false)}`;

    // Immediately record shot in log: every shot fired is counted!
    const newLogEntry: ShotLogEntry = {
      shotId,
      timestampLocal: localTimeStr,
      timestampZulu: zuluTimeStr,
      timestampIso: now.toISOString(),
      targetName: target.id,
      initialBearingDeg: initBearing,
      initialRangeNM: initRange,
      initialAltitudeFt: target.altitudeFt,
      initialLat: target.lat,
      initialLon: target.lon,
      initialCoordinates: targetInitialCoordsStr,
      qualityOfShot: zoneName,
      result: 'IN_FLIGHT',
      timeElapsedSec: 0,
      finalCoordinates: targetInitialCoordsStr,
      missileId: missileId,
      finalBearingDeg: initBearing,
      finalRangeNM: initRange,
      finalAltitudeFt: target.altitudeFt,
    };
    setShotLogs((prev) => [newLogEntry, ...prev]);

    const newMissile: ActiveMissile = {
      id: missileId,
      launcherId: launcher.id,
      targetId: target.id,
      startLat: samConfig.baseLat,
      startLon: samConfig.baseLon,
      startAltFt: samConfig.baseElevationFt,
      currentLat: samConfig.baseLat,
      currentLon: samConfig.baseLon,
      currentAltFt: samConfig.baseElevationFt,
      initialBearingDeg: initBearing,
      initialRangeNM: initRange,
      initialSlantRangeNM: initSlant,
      initialZoneName: zoneName,
      timeOfFlightRemainingSec: samConfig.timeOfFlightSec,
      totalTimeOfFlightSec: samConfig.timeOfFlightSec,
      elapsedSec: 0,
      speedMach: samConfig.missileSpeedMach,
      status: 'IN_FLIGHT',
      flightPath: [
        {
          lat: samConfig.baseLat,
          lon: samConfig.baseLon,
          altFt: samConfig.baseElevationFt,
          timestamp: Date.now(),
        },
      ],
    };

    setMissiles((prev) => [...prev, newMissile]);
    setSelectedMissileId(missileId);

    // Mark target as engaged
    setTargets((prev) =>
      prev.map((t) => (t.id === target.id ? { ...t, isEngaged: true } : t))
    );

    // If simulation is not started, automatically start simulation so the missile moves!
    if (!isSimRunning) {
      setIsSimRunning(true);
      isSimRunningRef.current = true;
      lastFrameTimeRef.current = performance.now();
      simStartTimeRef.current = performance.now();
      lastSampleTimeRef.current = performance.now();
    }
  };

  // Terminate Missile Action
  const handleTerminateMissile = (targetMissileId?: string) => {
    const missile = missiles.find(
      (m) =>
        m.status === 'IN_FLIGHT' &&
        (!targetMissileId || m.id === targetMissileId || m.targetId === selectedTargetId)
    );
    if (!missile) return;

    // Resolve missile
    resolveMissileEngagement(missile, 'TERMINATE');
  };

  // Resolution helper for HIT, MISS, or TERMINATE
  const resolveMissileEngagement = (missile: ActiveMissile, result: 'HIT' | 'MISS' | 'TERMINATE') => {
    const now = new Date();
    const localTimeStr = now.toLocaleTimeString('en-US', { hour12: false });
    const zuluHours = now.getUTCHours().toString().padStart(2, '0');
    const zuluMins = now.getUTCMinutes().toString().padStart(2, '0');
    const zuluSecs = now.getUTCSeconds().toString().padStart(2, '0');
    const resultZuluTimeStr = `${zuluHours}:${zuluMins}:${zuluSecs}Z`;

    const finalCoordsStr = `${decimalToDDMM(missile.currentLat, true)}, ${decimalToDDMM(missile.currentLon, false)}`;
    const finalBearing = getBearingDeg(samConfigRef.current.baseLat, samConfigRef.current.baseLon, missile.currentLat, missile.currentLon);
    const finalRange = getDistanceNM(samConfigRef.current.baseLat, samConfigRef.current.baseLon, missile.currentLat, missile.currentLon);

    // Update existing shot log entry for this missile, or add if missing
    setShotLogs((prev) => {
      const exists = prev.some((l) => l.missileId === missile.id);
      if (exists) {
        return prev.map((log) => {
          if (log.missileId === missile.id) {
            return {
              ...log,
              result,
              timeElapsedSec: missile.elapsedSec,
              finalCoordinates: finalCoordsStr,
              finalBearingDeg: finalBearing,
              finalRangeNM: finalRange,
              interceptLat: missile.currentLat,
              interceptLon: missile.currentLon,
              interceptAltFt: missile.currentAltFt,
              finalAltitudeFt: missile.currentAltFt,
              resultTimeLocal: localTimeStr,
              resultTimeZulu: resultZuluTimeStr,
              interceptTimestampIso: now.toISOString(),
            };
          }
          return log;
        });
      }
      return [
        {
          shotId: `#S${shotCounterRef.current++}`,
          timestampLocal: localTimeStr,
          timestampZulu: resultZuluTimeStr,
          timestampIso: now.toISOString(),
          targetName: missile.targetId,
          initialBearingDeg: missile.initialBearingDeg,
          initialRangeNM: missile.initialRangeNM,
          initialAltitudeFt: missile.startAltFt,
          qualityOfShot: missile.initialZoneName,
          result,
          timeElapsedSec: missile.elapsedSec,
          finalCoordinates: finalCoordsStr,
          finalBearingDeg: finalBearing,
          finalRangeNM: finalRange,
          missileId: missile.id,
          interceptLat: missile.currentLat,
          interceptLon: missile.currentLon,
          interceptAltFt: missile.currentAltFt,
          finalAltitudeFt: missile.currentAltFt,
          resultTimeLocal: localTimeStr,
          resultTimeZulu: resultZuluTimeStr,
          interceptTimestampIso: now.toISOString(),
        },
        ...prev,
      ];
    });

    // Add visual effect
    const effectColor = result === 'HIT' ? '#EF4444' : result === 'MISS' ? '#94A3B8' : '#F97316';
    setVisualEffects((prev) => [
      ...prev,
      {
        id: `eff_${Date.now()}`,
        lat: missile.currentLat,
        lon: missile.currentLon,
        type: result,
        timestamp: Date.now(),
        durationMs: 3000,
        color: effectColor,
      },
    ]);

    // Update missile status
    setMissiles((prev) =>
      prev.map((m) => (m.id === missile.id ? { ...m, status: result } : m))
    );

    // If HIT, automatically destroy and remove the aircraft target from the map!
    // Also, if other missiles were tracking this same target, terminate them with status 'TERMINATE'
    if (result === 'HIT') {
      targetsRef.current = targetsRef.current.filter((t) => t.id !== missile.targetId);
      setTargets((prev) => prev.filter((t) => t.id !== missile.targetId));
      if (selectedTargetId === missile.targetId) setSelectedTargetId(null);

      // Find any other in-flight missiles tracking the same aircraft
      const otherMissiles = missilesRef.current.filter(
        (om) => om.id !== missile.id && om.targetId === missile.targetId && om.status === 'IN_FLIGHT'
      );

      if (otherMissiles.length > 0) {
        // 1. Terminate other missiles in state
        setMissiles((prev) =>
          prev.map((m) => {
            if (otherMissiles.some((om) => om.id === m.id)) {
              return { ...m, status: 'TERMINATE', timeOfFlightRemainingSec: 0 };
            }
            return m;
          })
        );

        // 2. Update shot log entries for other missiles to TERMINATE
        setShotLogs((prev) =>
          prev.map((log) => {
            const om = otherMissiles.find((o) => o.id === log.missileId);
            if (om) {
              const omCoordsStr = `${decimalToDDMM(om.currentLat, true)}, ${decimalToDDMM(om.currentLon, false)}`;
              const omBrg = getBearingDeg(samConfigRef.current.baseLat, samConfigRef.current.baseLon, om.currentLat, om.currentLon);
              const omRng = getDistanceNM(samConfigRef.current.baseLat, samConfigRef.current.baseLon, om.currentLat, om.currentLon);
              return {
                ...log,
                result: 'TERMINATE',
                timeElapsedSec: om.elapsedSec,
                finalCoordinates: omCoordsStr,
                finalBearingDeg: omBrg,
                finalRangeNM: omRng,
                interceptLat: om.currentLat,
                interceptLon: om.currentLon,
                interceptAltFt: om.currentAltFt,
                finalAltitudeFt: om.currentAltFt,
                resultTimeLocal: localTimeStr,
                resultTimeZulu: resultZuluTimeStr,
              };
            }
            return log;
          })
        );

        // 3. Visual effects for terminated missiles
        const termEffects: VisualEffect[] = otherMissiles.map((om) => ({
          id: `eff_term_${om.id}_${Date.now()}`,
          lat: om.currentLat,
          lon: om.currentLon,
          type: 'TERMINATE',
          timestamp: Date.now(),
          durationMs: 3000,
          color: '#F97316',
        }));
        setVisualEffects((prev) => [...prev, ...termEffects]);
      }
    } else {
      // Check if other active missiles are still targeting this aircraft
      setTargets((prev) =>
        prev.map((t) => {
          if (t.id === missile.targetId) {
            const hasOtherMissiles = missilesRef.current.some(
              (m) => m.id !== missile.id && m.targetId === t.id && m.status === 'IN_FLIGHT'
            );
            return { ...t, isEngaged: hasOtherMissiles };
          }
          return t;
        })
      );
    }

    if (selectedMissileId === missile.id) {
      setSelectedMissileId(null);
    }
  };

  // Main Simulation & Kinematics Frame Loop (60 FPS, real-time synchronized)
  useEffect(() => {
    let animId: number;
    lastFrameTimeRef.current = performance.now();

    const loop = () => {
      const now = performance.now();
      const deltaMs = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      // Calculate true real seconds elapsed between frames, clamped to max 100ms against background spikes
      const dt = Math.max(0, Math.min(deltaMs / 1000, 0.1));

      // 1. Tick Launcher Independent Reload Timers (only if any launcher is reloading)
      if (dt > 0) {
        setLaunchers((prev) => {
          if (!prev.some((l) => l.isReloading)) return prev;
          return prev.map((l) => {
            if (!l.isReloading) return l;
            const newRemaining = Math.max(0, l.reloadRemainingSec - dt);
            if (newRemaining <= 0) {
              return {
                ...l,
                isReloading: false,
                reloadRemainingSec: 0,
                missilesRemaining: l.maxMissiles,
              };
            }
            return {
              ...l,
              reloadRemainingSec: newRemaining,
            };
          });
        });
      }

      // Clean up old visual effects (only if active effects exist)
      const nowMs = Date.now();
      setVisualEffects((prev) => {
        if (prev.length === 0) return prev;
        const filtered = prev.filter((e) => nowMs - e.timestamp < e.durationMs);
        return filtered.length === prev.length ? prev : filtered;
      });

      // If simulation is running and dt > 0, update aircraft positions and active missiles
      if (isSimRunningRef.current && dt > 0) {
        // A. Move active aircraft targets along their heading and speed
        setTargets((prevTargets) => {
          if (prevTargets.length === 0) return prevTargets;
          const nextTargets = prevTargets.map((t) => {
            const distanceNM = t.speedMach * MACH_TO_NM_PER_SEC * dt;
            const newPos = getDestinationLatLon(t.lat, t.lon, t.headingDeg, distanceNM);
            return {
              ...t,
              lat: newPos.lat,
              lon: newPos.lon,
            };
          });
          targetsRef.current = nextTargets;
          return nextTargets;
        });

        // B. Guide active missiles toward their target
        setMissiles((prevMissiles) => {
          if (prevMissiles.length === 0 || !prevMissiles.some((m) => m.status === 'IN_FLIGHT')) {
            return prevMissiles;
          }
          const newlyHitTargetIds = new Set<string>();

          const nextMissiles: ActiveMissile[] = prevMissiles.map((m): ActiveMissile => {
            if (m.status !== 'IN_FLIGHT') return m;

            const target = targetsRef.current.find((t) => t.id === m.targetId);
            const newElapsed = m.elapsedSec + dt;
            const newRemainingTOF = Math.max(0, m.timeOfFlightRemainingSec - dt);

            // If target is no longer present (or another missile already hit it in this frame),
            // terminate this missile immediately!
            if (!target || newlyHitTargetIds.has(m.targetId)) {
              setTimeout(() => {
                resolveMissileEngagement({ ...m, elapsedSec: newElapsed }, 'TERMINATE');
              }, 0);
              return {
                ...m,
                elapsedSec: newElapsed,
                timeOfFlightRemainingSec: 0,
                status: 'TERMINATE' as const,
              };
            }

            const brgToTarget = getBearingDeg(m.currentLat, m.currentLon, target.lat, target.lon);
            const distToTargetNM = getDistanceNM(m.currentLat, m.currentLon, target.lat, target.lon);
            const slantRangeNM = getSlantRangeNM(distToTargetNM, m.currentAltFt, target.altitudeFt);

            const missileStepNM = m.speedMach * MACH_TO_NM_PER_SEC * dt;

            // Check HIT Condition: missile arrives at target within TOF
            if (slantRangeNM <= Math.max(missileStepNM * 1.5, 0.15) && newRemainingTOF > 0) {
              newlyHitTargetIds.add(m.targetId);
              targetsRef.current = targetsRef.current.filter((t) => t.id !== m.targetId);
              setTimeout(() => {
                resolveMissileEngagement({ ...m, elapsedSec: newElapsed }, 'HIT');
              }, 0);
              return {
                ...m,
                elapsedSec: newElapsed,
                timeOfFlightRemainingSec: 0,
                status: 'HIT' as const,
              };
            }

            // Check MISS Condition: TOF expired before reaching target
            if (newRemainingTOF <= 0) {
              setTimeout(() => {
                resolveMissileEngagement({ ...m, elapsedSec: newElapsed }, 'MISS');
              }, 0);
              return {
                ...m,
                elapsedSec: newElapsed,
                timeOfFlightRemainingSec: 0,
                status: 'MISS' as const,
              };
            }

            // Move missile towards target
            const nextCoords = getDestinationLatLon(m.currentLat, m.currentLon, brgToTarget, missileStepNM);

            // Interpolate altitude toward target altitude
            const altStep = (target.altitudeFt - m.currentAltFt) * Math.min(dt * 2, 1);
            const nextAltFt = m.currentAltFt + altStep;

            // Sample flight path points at 10 Hz to prevent allocating 60 arrays/sec
            const lastPt = m.flightPath[m.flightPath.length - 1];
            const shouldAddPt = !lastPt || (Date.now() - lastPt.timestamp >= 100);
            const newFlightPath = shouldAddPt
              ? [
                  ...m.flightPath,
                  {
                    lat: nextCoords.lat,
                    lon: nextCoords.lon,
                    altFt: nextAltFt,
                    timestamp: Date.now(),
                  },
                ]
              : m.flightPath;

            return {
              ...m,
              currentLat: nextCoords.lat,
              currentLon: nextCoords.lon,
              currentAltFt: nextAltFt,
              elapsedSec: newElapsed,
              timeOfFlightRemainingSec: newRemainingTOF,
              flightPath: newFlightPath,
            };
          });
          missilesRef.current = nextMissiles;
          return nextMissiles;
        });

        // C. 10 Hz Telemetry Sampling (10 times/sec, every 100ms)
        const nowTime = performance.now();
        if (nowTime - lastSampleTimeRef.current >= 100) {
          lastSampleTimeRef.current = nowTime;
          const elapsedMs = simStartTimeRef.current ? Math.round(nowTime - simStartTimeRef.current) : 0;
          const currentSamCfg = samConfigRef.current;

          const sample: SimulationTelemetrySample = {
            timestampIso: new Date().toISOString(),
            elapsedMs,
            samSite: {
              lat: currentSamCfg.baseLat,
              lon: currentSamCfg.baseLon,
              elevationFt: currentSamCfg.baseElevationFt,
            },
            targets: targetsRef.current.map((t) => ({
              id: t.id,
              lat: t.lat,
              lon: t.lon,
              altitudeFt: t.altitudeFt,
              headingDeg: t.headingDeg,
              speedMach: t.speedMach,
            })),
            missiles: missilesRef.current
              .filter((m) => m.status === 'IN_FLIGHT')
              .map((m) => ({
                id: m.id,
                targetId: m.targetId,
                lat: m.currentLat,
                lon: m.currentLon,
                altitudeFt: m.currentAltFt,
                status: m.status,
              })),
          };

          telemetryBufferRef.current.push(sample);
          if (telemetryBufferRef.current.length % 10 === 0) {
            setSampleCount(telemetryBufferRef.current.length);
          }
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Start Simulation
  const handleStartSim = () => {
    setIsSimRunning(true);
    isSimRunningRef.current = true;
    lastFrameTimeRef.current = performance.now();
    simStartTimeRef.current = performance.now();
    lastSampleTimeRef.current = performance.now();
  };

  // Stop Simulation & Prompt GPX Export
  const handleStopSim = () => {
    setIsSimRunning(false);
    isSimRunningRef.current = false;
    setSampleCount(telemetryBufferRef.current.length);
    if (telemetryBufferRef.current.length === 0) {
      alert('Simulation stopped. No telemetry data recorded.');
      return;
    }

    // Open confirmation popup asking whether to save/export GPX instead of automatic download
    setIsExportPromptOpen(true);
  };

  // Confirm Save GPX File based on user selection: 'all' | 'aircraft' | 'battery'
  const handleConfirmExportGPX = (modeOverride?: 'all' | 'aircraft' | 'battery') => {
    const mode = modeOverride || exportSelection;
    const timestamp = Date.now();
    const samples = telemetryBufferRef.current;

    if (mode === 'aircraft') {
      const aircraftGpx = generateAircraftGPX(samples, shotLogs);
      triggerFileDownload(aircraftGpx, `RTAF_SAM1_Aircraft_Targets_${timestamp}.gpx`, 'application/gpx+xml');
    } else if (mode === 'battery') {
      const batteryGpx = generateBatteryMissilesGPX(samples, samConfig);
      triggerFileDownload(batteryGpx, `RTAF_SAM1_Battery_Missiles_${timestamp}.gpx`, 'application/gpx+xml');
    } else {
      const unifiedGpx = generateUnifiedGPX(samples, shotLogs, samConfig);
      triggerFileDownload(unifiedGpx, `RTAF_SAM1_Telemetry_${timestamp}.gpx`, 'application/gpx+xml');
    }
    setIsExportPromptOpen(false);
  };

  // Google Earth KML / KMZ Upload Handler
  const handleUploadKml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        const overlay = parseOverlayFile(content, file.name);
        setTacticalOverlays((prev) => [...prev, overlay]);
        console.log(`Successfully ingested tactical overlay: "${file.name}" with ${overlay.features.length} features.`);
      }
    };
    reader.readAsText(file);
  };

  // Currently selected target object
  const selectedTarget = targets.find((t) => t.id === selectedTargetId) || null;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#06090e] text-slate-200 overflow-hidden select-none">
      {/* Top Tactical Command Header */}
      <TopHeader
        systemName={samConfig.systemName}
        isSimRunning={isSimRunning}
        sampleCount={sampleCount}
        onStartSim={handleStartSim}
        onStopSim={handleStopSim}
        onExportGpx={() => setIsExportPromptOpen(true)}
        onResetAll={() => {
          if (
            isSimRunning ||
            targets.length > 0 ||
            missiles.length > 0 ||
            shotLogs.length > 0 ||
            sampleCount > 0 ||
            telemetryBufferRef.current.length > 0
          ) {
            setIsResetPromptOpen(true);
          } else {
            handleResetAll();
          }
        }}
        onClearKmlOverlays={() => setTacticalOverlays([])}
        overlayCount={tacticalOverlays.length}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onUploadKml={handleUploadKml}
        onQuickSpawnTarget={handleQuickSpawnTarget}
        onClearTargets={handleClearAllTargets}
        targetCount={targets.length}
      />

      {/* Main Tactical Split Workspace */}
      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        {/* Center / Primary Stage: 2D Radar Canvas */}
        <div className="flex-1 h-full relative">
          <RadarScope
            samConfig={samConfig}
            targets={targets}
            missiles={missiles}
            visualEffects={visualEffects}
            tacticalOverlays={tacticalOverlays}
            selectedTargetId={selectedTargetId}
            layoutKey={`${isFiringPanelOpen}-${isShotLogExpanded}-${Boolean(selectedTargetId)}`}
            onSelectTarget={(id) => setSelectedTargetId(id)}
            onSpawnTarget={handleSpawnTarget}
            onUpdateTargetPosition={handleUpdateTargetPosition}
            onDeleteTarget={handleDeleteTarget}
          />

          {/* Collapsed Firing Panel Right Toggle Button */}
          {!isFiringPanelOpen && (
            <button
              onClick={() => setIsFiringPanelOpen(true)}
              className="absolute top-1/2 -translate-y-1/2 right-0 z-30 flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-l-md bg-slate-950/90 hover:bg-slate-900 border-l border-t border-b border-rose-500/50 text-rose-400 shadow-xl cursor-pointer transition-all"
              title="Open Firing Operations Panel"
            >
              <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" />
              <span className="[writing-mode:vertical-rl] text-[9px] font-military font-bold tracking-wider uppercase text-slate-300">
                FIRING PANEL
              </span>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>

        {/* Right / Side Panel: Firing Operations & Launcher Matrix (Collapsible & Compact for Tablets) */}
        {isFiringPanelOpen && (
          <div className="w-full md:w-64 lg:w-72 p-2 flex flex-col gap-2 bg-slate-950/95 border-t md:border-t-0 md:border-l border-slate-800 overflow-y-auto shrink-0 transition-all duration-300">
            <FiringControlPanel
              samConfig={samConfig}
              launchers={launchers}
              missiles={missiles}
              selectedTargetId={selectedTargetId}
              selectedMissileId={selectedMissileId}
              nextLauncherIndex={nextLauncherIndex}
              onFire={handleFire}
              onTerminate={handleTerminateMissile}
              onSelectMissile={(id) => setSelectedMissileId(id)}
              onToggleCollapse={() => setIsFiringPanelOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Bottom Area: 1. Target Control Panel, 2. Shot Logging Table (Collapsible) */}
      <div className="bg-slate-950 border-t border-slate-800 flex flex-col z-30 shrink-0">
        {/* Target Control Panel at Bottom Bar */}
        {selectedTarget ? (
          <AircraftControlWidget
            target={selectedTarget}
            samConfig={samConfig}
            isEngaged={Boolean(selectedTarget.isEngaged)}
            onUpdateHeading={(hdg) =>
              setTargets((prev) => {
                const updated = prev.map((t) => (t.id === selectedTarget.id ? { ...t, headingDeg: hdg } : t));
                targetsRef.current = updated;
                return updated;
              })
            }
            onUpdateAltitude={(altFt) =>
              setTargets((prev) => {
                const updated = prev.map((t) => (t.id === selectedTarget.id ? { ...t, altitudeFt: altFt } : t));
                targetsRef.current = updated;
                return updated;
              })
            }
            onUpdateSpeed={(mach) =>
              setTargets((prev) => {
                const updated = prev.map((t) => (t.id === selectedTarget.id ? { ...t, speedMach: mach } : t));
                targetsRef.current = updated;
                return updated;
              })
            }
            onFaceSAMSite={() => {
              const brg = getBearingDeg(
                selectedTarget.lat,
                selectedTarget.lon,
                samConfig.baseLat,
                samConfig.baseLon
              );
              setTargets((prev) => {
                const updated = prev.map((t) =>
                  t.id === selectedTarget.id ? { ...t, headingDeg: normalizeDegree360(brg) } : t
                );
                targetsRef.current = updated;
                return updated;
              });
            }}
            onDeleteTarget={() => handleDeleteTarget(selectedTarget.id)}
            onClose={() => setSelectedTargetId(null)}
            onFireAtTarget={handleFire}
            canFire={
              launchers.some((l) => l.missilesRemaining > 0 && !l.isReloading) &&
              missiles.filter((m) => m.status === 'IN_FLIGHT').length < samConfig.maxSimultaneousEngagements
            }
            activeMissileCount={missiles.filter((m) => m.status === 'IN_FLIGHT').length}
          />
        ) : (
          <div className="px-4 py-2 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3 font-military text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Navigation className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-bold text-slate-300">TARGET CONTROL:</span>
              <span className="text-slate-500 text-[11px] hidden sm:inline">
                No target selected. Double-click radar to deploy aircraft, or click any target on radar to control.
              </span>
              <span className="text-slate-500 text-[11px] sm:hidden">
                No target selected.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleQuickSpawnTarget}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-xs font-telemetry cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>SPAWN TARGET</span>
              </button>
            </div>
          </div>
        )}

        {/* Shot Logging Table Tray (Collapsible - Slim 50% height when collapsed) */}
        <div
          onClick={() => setIsShotLogExpanded((p) => !p)}
          className={`flex items-center justify-between px-4 sm:px-6 transition-colors select-none group cursor-pointer border-t border-slate-800 ${
            isShotLogExpanded
              ? 'py-2 bg-slate-900/95 hover:bg-slate-900'
              : 'py-1 bg-slate-900/90 hover:bg-slate-850'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`rounded bg-slate-800 border border-slate-700/80 text-cyan-400 ${isShotLogExpanded ? 'p-1.5' : 'p-1'}`}>
              <Shield className={isShotLogExpanded ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-extrabold tracking-wider text-slate-200 uppercase ${isShotLogExpanded ? 'text-xs sm:text-sm' : 'text-[11px] sm:text-xs'}`}>
                SHOT LOGGING TABLE & ENGAGEMENT HISTORY
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 text-[10px] font-telemetry font-bold">
                {shotLogs.length} {shotLogs.length === 1 ? 'SHOT' : 'SHOTS'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Slim, elegant Expand/Collapse Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsShotLogExpanded((p) => !p);
              }}
              className={`flex items-center gap-1.5 rounded-md font-bold tracking-wider font-military transition-all cursor-pointer shadow-xs ${
                isShotLogExpanded
                  ? 'px-3 py-1 text-xs bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-cyan-500/60 shadow-cyan-950/50 hover:scale-[1.01] active:scale-95'
                  : 'px-2.5 py-0.5 text-[11px] bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black border border-cyan-300 shadow-cyan-950/60 hover:scale-[1.01] active:scale-95'
              }`}
              title={isShotLogExpanded ? 'Collapse Shot Logging Panel' : 'Expand Shot Logging Panel'}
            >
              <span>{isShotLogExpanded ? 'COLLAPSE LOG' : 'EXPAND LOG'}</span>
              {isShotLogExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>

        {isShotLogExpanded && (
          <div className="h-[352px] max-h-[60vh] overflow-hidden p-2 bg-slate-950 border-t border-slate-800 shadow-2xl">
            <ShotLogPanel
              logs={shotLogs}
              onClearLogs={() => setShotLogs([])}
              samSite={{ lat: samConfig.baseLat, lon: samConfig.baseLon }}
            />
          </div>
        )}
      </div>

      {/* Parameters & Configuration Modal */}
      <SAMParametersModal
        config={samConfig}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(newCfg) => setSAMConfig(newCfg)}
      />

      {/* Simulation Stop & Export Confirmation Modal */}
      {isExportPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-military select-none">
          <div className="w-full max-w-lg rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-5 text-slate-200 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
                  <FileDown className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold tracking-wide uppercase text-slate-100">
                    SAVE GPX TELEMETRY (บันทึกข้อมูลการบิน)
                  </h3>
                  <p className="text-[11px] text-slate-400 font-telemetry">
                    เลือกรูปแบบการบันทึก GPX: เครื่องบิน, จรวด หรือรวมกัน
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsExportPromptOpen(false)}
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 font-telemetry text-center text-xs">
              <div className="flex flex-col">
                <span className="text-slate-500 text-[10px]">10HZ SAMPLES</span>
                <span className="text-cyan-300 font-bold text-sm">{sampleCount}</span>
              </div>
              <div className="flex flex-col border-x border-slate-800">
                <span className="text-slate-500 text-[10px]">SHOTS COUNTED</span>
                <span className="text-rose-400 font-bold text-sm">{shotLogs.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-[10px]">AIRCRAFT</span>
                <span className="text-emerald-400 font-bold text-sm">{targets.length}</span>
              </div>
            </div>

            {/* 3 Selectable Export Modes */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                เลือกข้อมูลที่ต้องการบันทึก (SELECT TRACK EXPORT):
              </label>

              {/* Option 1: รวมกัน (Unified All in One) */}
              <div
                onClick={() => setExportSelection('all')}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  exportSelection === 'all'
                    ? 'bg-cyan-950/50 border-cyan-400 shadow-md shadow-cyan-950/50 ring-1 ring-cyan-400/40'
                    : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  exportSelection === 'all' ? 'border-cyan-400 bg-cyan-500' : 'border-slate-600 bg-slate-950'
                }`}>
                  {exportSelection === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                </div>
                <div className="flex-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-100">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>รวมกัน (เครื่องบิน + ฐานยิง + จรวด)</span>
                    <span className="text-[10px] px-1 rounded bg-cyan-950 border border-cyan-500/50 text-cyan-300 font-telemetry">
                      UNIFIED ALL-IN-ONE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-telemetry mt-0.5">
                    รวมแทร็กการบินของเครื่องบินทั้งหมด, จุดพิกัดฐานยิง SAM, และวิถีจรวดมิสไซล์ไว้ในไฟล์เดียว
                  </p>
                </div>
              </div>

              {/* Option 2: เครื่องบิน (Aircraft Only) */}
              <div
                onClick={() => setExportSelection('aircraft')}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  exportSelection === 'aircraft'
                    ? 'bg-rose-950/40 border-rose-400 shadow-md shadow-rose-950/50 ring-1 ring-rose-400/40'
                    : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  exportSelection === 'aircraft' ? 'border-rose-400 bg-rose-500' : 'border-slate-600 bg-slate-950'
                }`}>
                  {exportSelection === 'aircraft' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                </div>
                <div className="flex-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-100">
                    <Plane className="w-3.5 h-3.5 text-rose-400" />
                    <span>เฉพาะเครื่องบิน (Aircraft Targets)</span>
                    <span className="text-[10px] px-1 rounded bg-rose-950 border border-rose-500/50 text-rose-300 font-telemetry">
                      AIRCRAFT ONLY
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-telemetry mt-0.5">
                    บันทึกเฉพาะแทร็กพิกัดการบินของเครื่องบิน และจุดตัดพิกัดเมื่อถูกจรวดยิงทำลาย
                  </p>
                </div>
              </div>

              {/* Option 3: ฐานยิงและจรวด (SAM Base & Missiles Only) */}
              <div
                onClick={() => setExportSelection('battery')}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  exportSelection === 'battery'
                    ? 'bg-amber-950/40 border-amber-400 shadow-md shadow-amber-950/50 ring-1 ring-amber-400/40'
                    : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  exportSelection === 'battery' ? 'border-amber-400 bg-amber-500' : 'border-slate-600 bg-slate-950'
                }`}>
                  {exportSelection === 'battery' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                </div>
                <div className="flex-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-100">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>เฉพาะฐานยิงและจรวดที่ยิง (SAM Base & Missiles)</span>
                    <span className="text-[10px] px-1 rounded bg-amber-950 border border-amber-500/50 text-amber-300 font-telemetry">
                      BATTERY & MISSILES
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-telemetry mt-0.5">
                    บันทึกพิกัดฐานยิง SAM Site พร้อมคุณลักษณะแท่นยิง และวิถีการบินของจรวดมิสไซล์ทั้งหมด
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsExportPromptOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
              >
                ไม่บันทึก (DON'T SAVE)
              </button>
              <button
                onClick={() => handleConfirmExportGPX()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-extrabold shadow-md shadow-emerald-950/40 transition-all cursor-pointer active:scale-95"
              >
                <FileDown className="w-4 h-4" />
                <span>บันทึกไฟล์ GPX (SAVE GPX)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Reset Confirmation Modal */}
      {isResetPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm font-military select-none">
          <div className="w-full max-w-md rounded-xl bg-slate-950 border border-rose-900/60 shadow-2xl shadow-rose-950/50 p-5 text-slate-200 flex flex-col gap-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-950/80 border border-rose-500/50 flex items-center justify-center text-rose-400">
                  <RotateCcw className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold tracking-wide uppercase text-slate-100">
                    CONFIRM RESET (ยืนยันเคลียข้อมูลเริ่มใหม่)
                  </h3>
                  <p className="text-[11px] text-slate-400 font-telemetry">
                    RESET ALL TARGETS, MISSILES & HISTORY
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsResetPromptOpen(false)}
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-950/20 border border-rose-900/40 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-slate-300 leading-relaxed">
                ต้องการล้างข้อมูลเพื่อเริ่มจำลองใหม่ทั้งหมดหรือไม่?
                <ul className="mt-2 list-disc list-inside text-[11px] text-slate-400 space-y-1 font-telemetry">
                  <li>หยุดการทำงานของการจำลอง (Stop simulation)</li>
                  <li>ล้างเป้าหมายเครื่องบินและจรวดทั้งหมด ({targets.length} targets, {missiles.length} missiles)</li>
                  <li>รีเซ็ตแท่นยิงขีปนาวุธกลับเต็มจำนวนพร้อมยิง</li>
                  <li>ล้างประวัติบันทึกการยิงทั้งหมด ({shotLogs.length} logs)</li>
                  <li>ล้างข้อมูลบัฟเฟอร์ GPX telemetry ({sampleCount} pts)</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsResetPromptOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
              >
                ยกเลิก (CANCEL)
              </button>
              <button
                onClick={handleResetAll}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-md shadow-rose-950/40 transition-all cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                <span>ยืนยันเคลียข้อมูล (RESET ALL)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
