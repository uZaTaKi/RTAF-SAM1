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
} from './utils/geo';
import { DEFAULT_SAM_CONFIG, SAM_PRESETS } from './utils/presets';
import {
  saveSAMConfigToStorage,
  loadSAMConfigFromStorage,
  saveShotLogsToStorage,
  loadShotLogsFromStorage,
  saveTelemetryBufferToStorage,
  loadTelemetryBufferFromStorage,
} from './utils/storage';
import { parseOverlayFile } from './utils/kmlParser';
import {
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

  // 5. Shot Logs
  const [shotLogs, setShotLogs] = useState<ShotLogEntry[]>(() => loadShotLogsFromStorage());
  const shotCounterRef = useRef<number>(shotLogs.length + 1);

  // 6. Tactical Overlays (KML / GeoJSON)
  const [tacticalOverlays, setTacticalOverlays] = useState<TacticalOverlay[]>([]);

  // 7. Simulation State & 4Hz Telemetry Recording
  const [isSimRunning, setIsSimRunning] = useState<boolean>(false);
  const [telemetryBuffer, setTelemetryBuffer] = useState<SimulationTelemetrySample[]>(() => loadTelemetryBufferFromStorage());
  const simStartTimeRef = useRef<number | null>(null);
  const lastSampleTimeRef = useRef<number>(0);

  // 8. UI Modals and Layout toggles
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isShotLogExpanded, setIsShotLogExpanded] = useState<boolean>(false);
  const [isFiringPanelOpen, setIsFiringPanelOpen] = useState<boolean>(true);

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

  // Save telemetry buffer periodically
  useEffect(() => {
    if (telemetryBuffer.length > 0 && telemetryBuffer.length % 20 === 0) {
      saveTelemetryBufferToStorage(telemetryBuffer);
    }
  }, [telemetryBuffer]);

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
      headingDeg: Math.round(bearingToSAM),
      speedMach: samConfig.defaultSpawnSpeedMach,
      spawnTimeMs: Date.now(),
      isEngaged: false,
    };

    setTargets((prev) => [...prev, newTarget]);
    setSelectedTargetId(id);
  }, [samConfig]);

  // Quick Spawn Target at default range (~25 NM north-east)
  const handleQuickSpawnTarget = () => {
    const pos = getDestinationLatLon(samConfig.baseLat, samConfig.baseLon, 45, 25);
    handleSpawnTarget(pos.lat, pos.lon);
  };

  // Update Target Position (dragged on map)
  const handleUpdateTargetPosition = useCallback((id: string, lat: number, lon: number) => {
    setTargets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, lat, lon } : t))
    );
  }, []);

  // Delete Target
  const handleDeleteTarget = useCallback((id: string) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
    if (selectedTargetId === id) setSelectedTargetId(null);
  }, [selectedTargetId]);

  // Clear all targets
  const handleClearAllTargets = () => {
    setTargets([]);
    setSelectedTargetId(null);
  };

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
      simStartTimeRef.current = performance.now();
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
    const zuluTimeStr = `${zuluHours}:${zuluMins}:${zuluSecs}Z`;

    const finalCoordsStr = `${decimalToDDMM(missile.currentLat, true)}, ${decimalToDDMM(missile.currentLon, false)}`;

    const newLogEntry: ShotLogEntry = {
      shotId: `#S${shotCounterRef.current++}`,
      timestampLocal: localTimeStr,
      timestampZulu: zuluTimeStr,
      timestampIso: now.toISOString(),
      targetName: missile.targetId,
      initialBearingDeg: missile.initialBearingDeg,
      initialRangeNM: missile.initialRangeNM,
      initialAltitudeFt: missile.startAltFt,
      qualityOfShot: missile.initialZoneName,
      result,
      timeElapsedSec: missile.elapsedSec,
      finalCoordinates: finalCoordsStr,
      missileId: missile.id,
      interceptLat: missile.currentLat,
      interceptLon: missile.currentLon,
      interceptAltFt: missile.currentAltFt,
    };

    setShotLogs((prev) => [newLogEntry, ...prev]);

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
    if (result === 'HIT') {
      setTargets((prev) => prev.filter((t) => t.id !== missile.targetId));
      if (selectedTargetId === missile.targetId) setSelectedTargetId(null);
    } else {
      // Check if other active missiles are still targeting this aircraft
      setTargets((prev) =>
        prev.map((t) => {
          if (t.id === missile.targetId) {
            const hasOtherMissiles = missiles.some(
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

  // Main Simulation & Kinematics Frame Loop (60 FPS)
  useEffect(() => {
    let animId: number;
    let lastTimestamp = performance.now();

    const loop = (currentTimestamp: number) => {
      const dt = Math.min((currentTimestamp - lastTimestamp) / 1000, 0.1); // clamp to 100ms max
      lastTimestamp = currentTimestamp;

      // 1. Tick Launcher Independent Reload Timers (even if simulation movement is paused)
      setLaunchers((prev) =>
        prev.map((l) => {
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
        })
      );

      // Clean up old visual effects
      const nowMs = Date.now();
      setVisualEffects((prev) => prev.filter((e) => nowMs - e.timestamp < e.durationMs));

      // If simulation is running, update aircraft positions and active missiles
      if (isSimRunning) {
        // A. Move active aircraft targets along their heading and speed
        setTargets((prevTargets) => {
          return prevTargets.map((t) => {
            // Speed in Mach converted to distance traveled in NM per second
            const distanceNM = t.speedMach * MACH_TO_NM_PER_SEC * dt;
            const newPos = getDestinationLatLon(t.lat, t.lon, t.headingDeg, distanceNM);
            return {
              ...t,
              lat: newPos.lat,
              lon: newPos.lon,
            };
          });
        });

        // B. Guide active missiles toward their target
        setMissiles((prevMissiles) => {
          return prevMissiles.map((m) => {
            if (m.status !== 'IN_FLIGHT') return m;

            const target = targets.find((t) => t.id === m.targetId);
            const newElapsed = m.elapsedSec + dt;
            const newRemainingTOF = Math.max(0, m.timeOfFlightRemainingSec - dt);

            // If target is no longer present (already destroyed by another missile), continue straight
            let targetLat = m.currentLat;
            let targetLon = m.currentLon;
            let targetAltFt = m.currentAltFt;

            if (target) {
              targetLat = target.lat;
              targetLon = target.lon;
              targetAltFt = target.altitudeFt;
            }

            const brgToTarget = getBearingDeg(m.currentLat, m.currentLon, targetLat, targetLon);
            const distToTargetNM = getDistanceNM(m.currentLat, m.currentLon, targetLat, targetLon);
            const slantRangeNM = getSlantRangeNM(distToTargetNM, m.currentAltFt, targetAltFt);

            const missileStepNM = m.speedMach * MACH_TO_NM_PER_SEC * dt;

            // Check HIT Condition: missile arrives at target within TOF
            if (slantRangeNM <= Math.max(missileStepNM * 1.5, 0.15) && newRemainingTOF > 0) {
              // Delayed resolution to avoid state mutation inside reducer
              setTimeout(() => {
                resolveMissileEngagement({ ...m, elapsedSec: newElapsed }, 'HIT');
              }, 0);
              return {
                ...m,
                elapsedSec: newElapsed,
                timeOfFlightRemainingSec: 0,
                status: 'HIT',
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
                status: 'MISS',
              };
            }

            // Move missile towards target
            const nextCoords = getDestinationLatLon(m.currentLat, m.currentLon, brgToTarget, missileStepNM);

            // Interpolate altitude toward target altitude
            const altStep = (targetAltFt - m.currentAltFt) * Math.min(dt * 2, 1);
            const nextAltFt = m.currentAltFt + altStep;

            const newFlightPath = [
              ...m.flightPath,
              {
                lat: nextCoords.lat,
                lon: nextCoords.lon,
                altFt: nextAltFt,
                timestamp: Date.now(),
              },
            ];

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
        });

        // C. 4 Hz Telemetry Sampling (every 250ms)
        const nowTime = performance.now();
        if (nowTime - lastSampleTimeRef.current >= 250) {
          lastSampleTimeRef.current = nowTime;
          const elapsedMs = simStartTimeRef.current ? Math.round(nowTime - simStartTimeRef.current) : 0;

          const sample: SimulationTelemetrySample = {
            timestampIso: new Date().toISOString(),
            elapsedMs,
            samSite: {
              lat: samConfig.baseLat,
              lon: samConfig.baseLon,
              elevationFt: samConfig.baseElevationFt,
            },
            targets: targets.map((t) => ({
              id: t.id,
              lat: t.lat,
              lon: t.lon,
              altitudeFt: t.altitudeFt,
              headingDeg: t.headingDeg,
              speedMach: t.speedMach,
            })),
            missiles: missiles
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

          setTelemetryBuffer((prev) => [...prev, sample]);
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isSimRunning, samConfig, targets, missiles, getQualityOfShotZone]);

  // Start Simulation
  const handleStartSim = () => {
    setIsSimRunning(true);
    simStartTimeRef.current = performance.now();
    lastSampleTimeRef.current = performance.now();
  };

  // Stop Simulation & Export 2 Separate GPX Files (1. Aircraft, 2. SAM Battery & Missiles)
  const handleStopSim = () => {
    setIsSimRunning(false);
    if (telemetryBuffer.length === 0) {
      alert('Simulation stopped. No telemetry data recorded.');
      return;
    }

    const timestamp = Date.now();
    // 1. Aircraft Targets GPX (with destroyed tracks cut off and destruction event waypoints)
    const aircraftGpx = generateAircraftGPX(telemetryBuffer, shotLogs);
    triggerFileDownload(aircraftGpx, `RTAF_SAM1_Aircraft_Targets_${timestamp}.gpx`, 'application/gpx+xml');

    // 2. Battery & Missiles GPX
    setTimeout(() => {
      const batteryGpx = generateBatteryMissilesGPX(telemetryBuffer, samConfig);
      triggerFileDownload(batteryGpx, `RTAF_SAM1_Battery_Missiles_${timestamp}.gpx`, 'application/gpx+xml');
    }, 250);
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
        alert(`Successfully ingested tactical overlay: "${file.name}" with ${overlay.features.length} features.`);
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
        sampleCount={telemetryBuffer.length}
        onStartSim={handleStartSim}
        onStopSim={handleStopSim}
        onRecenter={() => {
          // Trigger custom event or ref to radar
          const ev = new CustomEvent('recenter-sam');
          window.dispatchEvent(ev);
        }}
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
              setTargets((prev) =>
                prev.map((t) => (t.id === selectedTarget.id ? { ...t, headingDeg: hdg } : t))
              )
            }
            onUpdateAltitude={(altFt) =>
              setTargets((prev) =>
                prev.map((t) => (t.id === selectedTarget.id ? { ...t, altitudeFt: altFt } : t))
              )
            }
            onUpdateSpeed={(mach) =>
              setTargets((prev) =>
                prev.map((t) => (t.id === selectedTarget.id ? { ...t, speedMach: mach } : t))
              )
            }
            onFaceSAMSite={() => {
              const brg = getBearingDeg(
                selectedTarget.lat,
                selectedTarget.lon,
                samConfig.baseLat,
                samConfig.baseLon
              );
              setTargets((prev) =>
                prev.map((t) =>
                  t.id === selectedTarget.id ? { ...t, headingDeg: Math.round(brg) } : t
                )
              );
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

        {/* Shot Logging Table Tray (Collapsible) */}
        <div
          onClick={() => setIsShotLogExpanded((p) => !p)}
          className="flex items-center justify-between px-4 py-1.5 bg-slate-900/90 hover:bg-slate-900 cursor-pointer text-xs font-military font-bold text-slate-300 border-t border-slate-800 select-none"
        >
          <div className="flex items-center gap-2">
            <span>SHOT LOGGING TABLE & ENGAGEMENT HISTORY ({shotLogs.length})</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-[10px] font-telemetry">
              {isShotLogExpanded ? 'COLLAPSE' : 'EXPAND'}
            </span>
            {isShotLogExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </div>
        </div>

        {isShotLogExpanded && (
          <div className="h-44 overflow-hidden p-2 bg-slate-950 border-t border-slate-800">
            <ShotLogPanel logs={shotLogs} onClearLogs={() => setShotLogs([])} />
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
    </div>
  );
}
