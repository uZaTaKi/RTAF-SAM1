// ========================================================================================
// ไฟล์: src/App.tsx
// หน้าที่: คอมโพเนนต์หลักศูนย์บัญชาการยุทธวิธี C2 และระบบจำลองฟิสิกส์การสกัดกั้น (Main Application Root)
// คำอธิบาย: บริหารจัดการสถานะของระบบ SAM, การนำเข้าและประมวลผลข้อมูลเป้าบิน, การคำนวณการยิงขีปนาวุธแบบ 60FPS,
//          การบันทึกเทเลเมทรี 10Hz, ตารางบันทึกการยิง, และหน้าต่างโมดัลสั่งการต่างๆ
// ========================================================================================

// นำเข้า React hooks สำหรับบริหารจัดการ State, Lifecycle, DOM Refs และ Memoized Callbacks
import React, { useState, useEffect, useRef, useCallback } from 'react';
// นำเข้าอินเทอร์เฟซโครงสร้างข้อมูลหลักของระบบจำลอง
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
// นำเข้าฟังก์ชันคำนวณทางภูมิศาสตร์ ระยะทาง แบริ่ง และความเร็วการบิน
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
// นำเข้าค่าคอนฟิกเริ่มต้นและพรีเซ็ตระบบขีปนาวุธ (KS-1C, Spada, Long-Range)
import { DEFAULT_SAM_CONFIG, SAM_PRESETS } from './utils/presets';
// นำเข้าฟังก์ชันบันทึกและอ่านข้อมูลจาก LocalStorage
import {
  saveSAMConfigToStorage,
  loadSAMConfigFromStorage,
  saveShotLogsToStorage,
  saveTelemetryBufferToStorage,
  clearAllHistoryFromStorage,
} from './utils/storage';
// นำเข้าตัวแยกวิเคราะห์เลเยอร์แผนที่ KML/KMZ หรือ GeoJSON
import { parseOverlayFile } from './utils/kmlParser';
// นำเข้าโมดูลสร้างไฟล์ GPX 1.1 สำหรับนำไปเปิดใน Tacview / ACMI
import {
  generateUnifiedGPX,
  generateAircraftGPX,
  generateBatteryMissilesGPX,
  triggerFileDownload,
} from './utils/gpxExporter';

// นำเข้าคอมโพเนนต์ย่อยในระบบ
import { TopHeader } from './components/TopHeader';
import { RadarScope } from './components/RadarScope';
import { FiringControlPanel } from './components/FiringControlPanel';
import { AircraftControlWidget } from './components/AircraftControlWidget';
import { ShotLogPanel } from './components/ShotLogPanel';
import { SAMParametersModal } from './components/SAMParametersModal';
// นำเข้าไอคอนจาก lucide-react
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
  // 1. สเตตเก็บค่าพารามิเตอร์การตั้งค่าระบบ SAM (พิกัดฐานยิง, ความเร็ว, วงแหวนเรดาร์, Bullseye)
  const [samConfig, setSAMConfig] = useState<SAMConfig>(() => {
    return loadSAMConfigFromStorage() || DEFAULT_SAM_CONFIG;
  });

  // 2. สเตตเก็บรายการแท่นยิงขีปนาวุธแต่ละแท่น พร้อมเวลานับถอยหลังการโหลดลูกใหม่ (Launcher Matrix)
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

  // ดัชนีของแท่นยิงถัดไปที่จะเป็นคิวยิง (เริ่มจากแท่นแรก)
  const [nextLauncherIndex, setNextLauncherIndex] = useState<number>(0);

  // 3. สเตตเก็บรายการเป้าหมายเครื่องบิน (Aircraft Targets) และตัวนับลำดับเป้าหมาย (T1, T2...)
  const [targets, setTargets] = useState<AircraftTarget[]>([]);
  const targetCounterRef = useRef<number>(1);
  // รหัสเครื่องบินที่กำลังถูกคลิกเลือกอยู่บนจอเรดาร์
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // 4. สเตตเก็บรายการลูกจรวดขีปนาวุธที่กำลังบิน (Active Missiles) และเอฟเฟกต์ภาพระเบิด
  const [missiles, setMissiles] = useState<ActiveMissile[]>([]);
  const missileCounterRef = useRef<number>(1);
  const [selectedMissileId, setSelectedMissileId] = useState<string | null>(null);
  const [visualEffects, setVisualEffects] = useState<VisualEffect[]>([]);

  // 5. สเตตเก็บประวัติตารางบันทึกการยิงทั้งหมด (Shot Logs)
  const [shotLogs, setShotLogs] = useState<ShotLogEntry[]>([]);
  const shotCounterRef = useRef<number>(1);

  // 6. สเตตเก็บชั้นข้อมูลแผนที่ยุทธวิธีที่นำเข้า (Tactical Overlays จาก KML / GeoJSON)
  const [tacticalOverlays, setTacticalOverlays] = useState<TacticalOverlay[]>([]);

  // ใช้ Refs ซิงค์ข้อมูลกับลูปคำนวณ 60FPS เพื่อให้เข้าถึงค่าล่าสุดได้ทันทีโดยไม่ติด Render Cycle
  const targetsRef = useRef<AircraftTarget[]>(targets);
  targetsRef.current = targets;

  const missilesRef = useRef<ActiveMissile[]>(missiles);
  missilesRef.current = missiles;

  const samConfigRef = useRef<SAMConfig>(samConfig);
  samConfigRef.current = samConfig;

  // 7. สเตตการรันการจำลองและบัฟเฟอร์บันทึกข้อมูลเทเลเมทรี 10Hz
  const [isSimRunning, setIsSimRunning] = useState<boolean>(false);
  const isSimRunningRef = useRef<boolean>(isSimRunning);
  isSimRunningRef.current = isSimRunning;
  const lastFrameTimeRef = useRef<number>(performance.now());
  const telemetryBufferRef = useRef<SimulationTelemetrySample[]>([]);
  const [sampleCount, setSampleCount] = useState<number>(0);
  const simStartTimeRef = useRef<number | null>(null);
  const lastSampleTimeRef = useRef<number>(0);

  // 8. สเตตควบคุมการแสดงผลของหน้าต่างโมดัลและแผงควบคุมต่างๆ
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isShotLogExpanded, setIsShotLogExpanded] = useState<boolean>(false);
  const [isFiringPanelOpen, setIsFiringPanelOpen] = useState<boolean>(true);
  const [isExportPromptOpen, setIsExportPromptOpen] = useState<boolean>(false);
  const [exportSelection, setExportSelection] = useState<'all' | 'aircraft' | 'battery'>('all');
  const [isResetPromptOpen, setIsResetPromptOpen] = useState<boolean>(false);

  // เคลียร์ข้อมูลประวัติใน LocalStorage ทุกครั้งที่เริ่มเปิดโปรแกรมใหม่
  useEffect(() => {
    clearAllHistoryFromStorage();
  }, []);

  // ซิงโครไนซ์สถานะแท่นยิงเมื่อมีการเปลี่ยนจำนวนแท่นหรือจำนวนลูกต่อแท่นในหน้าการตั้งค่า
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

  // บันทึกคอนฟิกลง LocalStorage เมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    saveSAMConfigToStorage(samConfig);
  }, [samConfig]);

  // บันทึกตารางช็อตการยิงลง LocalStorage เมื่อมีรายการใหม่
  useEffect(() => {
    saveShotLogsToStorage(shotLogs);
  }, [shotLogs]);

  // แบ็กอัปข้อมูลบัฟเฟอร์เทเลเมทรีทุกๆ 15 วินาที
  useEffect(() => {
    const timer = setInterval(() => {
      if (telemetryBufferRef.current.length > 0) {
        saveTelemetryBufferToStorage(telemetryBufferRef.current);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // ฟังก์ชันคำนวณชื่อโซนเรดาร์ (Quality of Shot Zone) ณ ระยะทางที่กำหนด
  const getQualityOfShotZone = useCallback((rangeNM: number): string => {
    // เรียงลำดับวงแหวนจากรัศมีน้อยไปมาก
    const sorted = [...samConfig.radarRings].sort((a, b) => a.radiusNM - b.radiusNM);
    for (const ring of sorted) {
      if (rangeNM <= ring.radiusNM) {
        return ring.name;
      }
    }
    return `Beyond Envelope (> ${sorted[sorted.length - 1]?.radiusNM || 50} NM)`;
  }, [samConfig.radarRings]);

  // สร้างเป้าหมายเครื่องบินขึ้นมาใหม่ ณ พิกัดที่ระบุ (Spawn Target)
  const handleSpawnTarget = useCallback((lat: number, lon: number) => {
    // กำหนดรหัสเครื่องบิน เช่น T1, T2
    const id = `T${targetCounterRef.current++}`;
    // หันหัวเครื่องบินเข้าหาฐานยิง SAM โดยอัตโนมัติเป็นค่าเริ่มต้น
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
    // โฟกัสเลือกเป้าหมายที่เพิ่งสร้างทันที
    setSelectedTargetId(id);
  }, [samConfig]);

  // สร้างเป้าหมายบินแบบด่วน (+ TARGET) ณ ระยะ ~25 ไมล์ทะเลทางทิศตะวันออกเฉียงเหนือ
  const handleQuickSpawnTarget = () => {
    const pos = getDestinationLatLon(samConfig.baseLat, samConfig.baseLon, 45, 25);
    handleSpawnTarget(pos.lat, pos.lon);
  };

  // อัปเดตพิกัดเป้าหมายเมื่อถูกลากย้ายบนจอเรดาร์
  const handleUpdateTargetPosition = useCallback((id: string, lat: number, lon: number) => {
    setTargets((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, lat, lon } : t));
      targetsRef.current = updated;
      return updated;
    });
  }, []);

  // ลบเป้าหมายเครื่องบินออกจากระบบ
  const handleDeleteTarget = useCallback((id: string) => {
    setTargets((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      targetsRef.current = updated;
      return updated;
    });
    if (selectedTargetId === id) setSelectedTargetId(null);
  }, [selectedTargetId]);

  // ลบเป้าหมายเครื่องบินทั้งหมด
  const handleClearAllTargets = () => {
    setTargets([]);
    setSelectedTargetId(null);
  };

  // รีเซ็ตการจำลองและประวัติทั้งหมดเพื่อเริ่มรอบใหม่ (Master Reset)
  const handleResetAll = useCallback(() => {
    // 1. หยุดการทำงานของการจำลอง
    setIsSimRunning(false);
    isSimRunningRef.current = false;
    simStartTimeRef.current = null;
    lastSampleTimeRef.current = 0;

    // 2. ล้างเป้าหมายเครื่องบินและตัวเลือก
    setTargets([]);
    setSelectedTargetId(null);
    targetCounterRef.current = 1;

    // 3. ล้างขีปนาวุธจรวดที่กำลังบินและเอฟเฟกต์ภาพ
    setMissiles([]);
    setSelectedMissileId(null);
    missileCounterRef.current = 1;
    setVisualEffects([]);

    // 4. รีเซ็ตแท่นยิงขีปนาวุธทุกแท่นให้มีจรวดเต็มความจุและพร้อมยิงทันที
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

    // 5. ล้างตารางบันทึกการยิงและบัฟเฟอร์เทเลเมทรี
    setShotLogs([]);
    shotCounterRef.current = 1;
    telemetryBufferRef.current = [];
    setSampleCount(0);
    clearAllHistoryFromStorage();

    // 6. ปิดหน้าต่างยืนยันการรีเซ็ต
    setIsResetPromptOpen(false);
  }, [samConfig.launcherCount, samConfig.missilesPerLauncher, samConfig.launcherReloadTimeSec]);

  // ฟังก์ชันยิงขีปนาวุธต่อสู้อากาศยาน (FIRE Action)
  const handleFire = () => {
    if (!selectedTargetId) return;
    const target = targets.find((t) => t.id === selectedTargetId);
    if (!target) return;

    // ตรวจสอบโควต้าการยิงพร้อมกันสูงสุด (Max Simultaneous Engagements)
    const activeMissilesCount = missiles.filter((m) => m.status === 'IN_FLIGHT').length;
    if (activeMissilesCount >= samConfig.maxSimultaneousEngagements) return;

    // เลือกแท่นยิง: ยิงจากแท่นเดิมต่อเนื่องจนกว่าจรวดจะหมด
    let chosenLauncherIdx = nextLauncherIndex;

    // หากแท่นยิงปัจจุบันไม่มีลูกหรือกำลังโหลด ให้ค้นหาแท่นยิงแท่นอื่นที่พร้อม
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

    // ปรับปรุงสถานะแท่นยิง: หักกระสุนออก 1 นัด และหากหมดให้เริ่มนับถอยหลังโหลดจรวดใหม่
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

    // หากจรวดบนแท่นนี้หมด ให้เลื่อนไปยังแท่นถัดไป หากยังไม่หมดให้อยู่ที่แท่นเดิม
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

    // คำนวณพารามิเตอร์การยิงสกัดกั้นเริ่มต้น
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

    // บันทึกช็อตการยิงลงในตารางประวัติทันทีที่กดปุ่มยิง
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

    // สร้างออบเจกต์ลูกจรวด ActiveMissile และปล่อยตัวออกจากฐานยิง
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

    // กำหนดสถานะเป้าหมายว่าถูกล็อคเป้าแล้ว (isEngaged = true)
    setTargets((prev) =>
      prev.map((t) => (t.id === target.id ? { ...t, isEngaged: true } : t))
    );

    // หากการจำลองยังไม่เริ่ม ให้เริ่มการจำลองอัตโนมัติเพื่อให้จรวดเคลื่อนที่
    if (!isSimRunning) {
      setIsSimRunning(true);
      isSimRunningRef.current = true;
      lastFrameTimeRef.current = performance.now();
      simStartTimeRef.current = performance.now();
      lastSampleTimeRef.current = performance.now();
    }
  };

  // คำสั่งทำลายจรวดฉุกเฉิน (Terminate Missile Action)
  const handleTerminateMissile = (targetMissileId?: string) => {
    const missile = missiles.find(
      (m) =>
        m.status === 'IN_FLIGHT' &&
        (!targetMissileId || m.id === targetMissileId || m.targetId === selectedTargetId)
    );
    if (!missile) return;

    // ประมวลผลผลลัพธ์ให้เป็น TERMINATE
    resolveMissileEngagement(missile, 'TERMINATE');
  };

  // ฟังก์ชันสรุปผลการสกัดกั้น (HIT, MISS, หรือ TERMINATE)
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

    // ปรับปรุงผลลัพธ์การยิงในตาราง Shot Logs ให้สมบูรณ์
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

    // สร้างเอฟเฟกต์ภาพ (HIT: ระเบิดสีแดง, MISS: ควันสีเทา, TERMINATE: กากบาทสีส้ม)
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

    // ปรับปรุงสถานะจรวด
    setMissiles((prev) =>
      prev.map((m) => (m.id === missile.id ? { ...m, status: result } : m))
    );

    // หากยิงโดนเป้า (HIT) ให้ทำลายและลบเครื่องบินเป้าหมายออกจากจอเรดาร์ทันที
    // และหากมีจรวดลูกอื่นที่กำลังมุ่งหน้ามายังเป้าหมายลำเดียวกันนี้ ให้สั่ง TERMINATE จรวดเหล่านั้นทันที
    if (result === 'HIT') {
      targetsRef.current = targetsRef.current.filter((t) => t.id !== missile.targetId);
      setTargets((prev) => prev.filter((t) => t.id !== missile.targetId));
      if (selectedTargetId === missile.targetId) setSelectedTargetId(null);

      // ค้นหาจรวดลูกอื่นที่กำลังบินตามเป้าหมายเดียวกันนี้
      const otherMissiles = missilesRef.current.filter(
        (om) => om.id !== missile.id && om.targetId === missile.targetId && om.status === 'IN_FLIGHT'
      );

      if (otherMissiles.length > 0) {
        // 1. อัปเดตสถานะจรวดลูกอื่นให้เป็น TERMINATE
        setMissiles((prev) =>
          prev.map((m) => {
            if (otherMissiles.some((om) => om.id === m.id)) {
              return { ...m, status: 'TERMINATE', timeOfFlightRemainingSec: 0 };
            }
            return m;
          })
        );

        // 2. อัปเดตบันทึกใน Shot Log ของจรวดลูกอื่น
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

        // 3. แสดงเอฟเฟกต์ภาพทำลายตัวเองของจรวดลูกอื่น
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
      // ตรวจสอบว่ายังมีจรวดลูกอื่นเล็งเครื่องบินลำนี้อยู่หรือไม่
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

  // ลูปประมวลผลฟิสิกส์และการจำลองหลัก 60 FPS (Frame Loop ซิงค์เวลาจริง)
  useEffect(() => {
    let animId: number;
    lastFrameTimeRef.current = performance.now();

    const loop = () => {
      const now = performance.now();
      const deltaMs = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      // เวลาจริงที่ผ่านไประหว่างเฟรม (วินาที)
      const dt = Math.max(0, Math.min(deltaMs / 1000, 0.1));

      // 1. นับถอยหลังการโหลดลูกใหม่ของแท่นยิง (Reload Countdown Timers)
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

      // ทำความสะอาดเอฟเฟกต์ภาพที่หมดเวลาแสดงผลแล้ว
      const nowMs = Date.now();
      setVisualEffects((prev) => {
        if (prev.length === 0) return prev;
        const filtered = prev.filter((e) => nowMs - e.timestamp < e.durationMs);
        return filtered.length === prev.length ? prev : filtered;
      });

      // หากเปิดระบบจำลองและเวลาเดิน (dt > 0) ให้ปรับตำแหน่งเครื่องบินและจรวด
      if (isSimRunningRef.current && dt > 0) {
        // ก. ขยับตำแหน่งเป้าบินเครื่องบินตามทิศทาง (Heading) และความเร็วมัค
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

        // ข. นำวิถีจรวดขีปนาวุธเข้าหาเป้าหมาย (Missile Guidance Law)
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

            // หากเป้าหมายไม่อยู่แล้วหรือถูกชนไปแล้วในเฟรมนี้ ให้ทำลายจรวดตัวเองทันที
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

            // เงื่อนไขการชนเป้าหมายสำเร็จ (HIT Condition): จรวดเข้าถึงระยะสังหารภายในเวลาบิน
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

            // เงื่อนไขการพลาดเป้า (MISS Condition): หมดเวลาเชื้อเพลิงก่อนถึงเป้าหมาย
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

            // เคลื่อนที่จรวดเข้าหาพิกัดเป้าหมาย
            const nextCoords = getDestinationLatLon(m.currentLat, m.currentLon, brgToTarget, missileStepNM);

            // ปรับระดับความสูงของจรวดให้ไต่ระดับเข้าหาความสูงเป้าหมาย
            const altStep = (target.altitudeFt - m.currentAltFt) * Math.min(dt * 2, 1);
            const nextAltFt = m.currentAltFt + altStep;

            // สุ่มบันทึกจุดเส้นทางบินด้วยความถี่ 10Hz เพื่อประหยัดหน่วยความจำ
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

        // ค. บันทึกข้อมูลเทเลเมทรีด้วยความถี่ 10 Hz (ทุก 100 มิลลิวินาที)
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

  // เริ่มการจำลอง (START SIMULATION)
  const handleStartSim = () => {
    setIsSimRunning(true);
    isSimRunningRef.current = true;
    lastFrameTimeRef.current = performance.now();
    simStartTimeRef.current = performance.now();
    lastSampleTimeRef.current = performance.now();
  };

  // หยุดการจำลอง (STOP SIMULATION) และเปิดกล่องถามเพื่อดาวน์โหลด GPX
  const handleStopSim = () => {
    setIsSimRunning(false);
    isSimRunningRef.current = false;
    setSampleCount(telemetryBufferRef.current.length);
    if (telemetryBufferRef.current.length === 0) {
      alert('Simulation stopped. No telemetry data recorded.');
      return;
    }

    // แสดงหน้าต่างโมดัลสอบถามว่าต้องการบันทึก GPX หรือไม่
    setIsExportPromptOpen(true);
  };

  // ยืนยันการบันทึกไฟล์ GPX ตามตัวเลือกที่ผู้ใช้ระบุ: รวมทั้งหมด / เฉพาะเครื่องบิน / เฉพาะฐานและจรวด
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

  // จัดการการอัปโหลดไฟล์แผนที่ KML / KMZ หรือ GeoJSON
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

  // เป้าหมายเครื่องบินที่กำลังถูกเลือกในปัจจุบัน
  const selectedTarget = targets.find((t) => t.id === selectedTargetId) || null;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#06090e] text-slate-200 overflow-hidden select-none">
      {/* 1. แถบเครื่องมือและสถานะด้านบนสุด (Top Tactical Command Header) */}
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

      {/* 2. พื้นที่ปฏิบัติการหลัก: จอเรดาร์ 2D และแผงควบคุมการยิง */}
      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        {/* จอเรดาร์ตรวจการณ์ 2D Radar PPI Canvas */}
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

          {/* ปุ่มเปิดแผงควบคุมการยิงเมื่อถูกพับเก็บไว้ */}
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

        {/* แผงควบคุมการยิงและสถานะแท่นยิงด้านขวา (Firing Control Panel) */}
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

      {/* 3. พื้นที่ด้านล่าง: วิดเจ็ตควบคุมเครื่องบิน และตารางประวัติช็อตการยิง (พับได้) */}
      <div className="bg-slate-950 border-t border-slate-800 flex flex-col z-30 shrink-0">
        {/* วิดเจ็ตควบคุมเครื่องบินเป้าหมาย */}
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
          /* แถบแจ้งเตือนเมื่อยังไม่ได้เลือกเป้าหมาย พร้อมปุ่มสร้างเป้าหมายด่วน (Quick Spawn Target) */
          <div className="px-4 py-2 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3 font-military text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Navigation className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-bold text-slate-300">TARGET CONTROL:</span>
              <span className="text-slate-500 text-[11px] hidden sm:inline">
                ยังไม่ได้เลือกเป้าหมาย — ดับเบิลคลิกบนจอเรดาร์เพื่อปล่อยเครื่องบิน หรือคลิกเป้าหมายบนจอเพื่อควบคุม
              </span>
              <span className="text-slate-500 text-[11px] sm:hidden">
                ยังไม่ได้เลือกเป้าหมาย
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* ปุ่มสร้างเป้าหมายด่วนตามค่า Default Spawn ในการตั้งค่า */}
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

        {/* =========================================================================
            แถบหัวข้อตารางบันทึกการยิง (Shot Logging Table Tray)
            สามารถกดเพื่อย่อ/ขยาย (Collapsible) โดยมีความสูงสลิมลง 50% เมื่อพับเก็บ
            ========================================================================= */}
        <div
          onClick={() => setIsShotLogExpanded((p) => !p)}
          className={`flex items-center justify-between px-4 sm:px-6 transition-colors select-none group cursor-pointer border-t border-slate-800 ${
            isShotLogExpanded
              ? 'py-2 bg-slate-900/95 hover:bg-slate-900'
              : 'py-1 bg-slate-900/90 hover:bg-slate-850'
          }`}
        >
          {/* ส่วนแสดงไอคอน ป้ายชื่อหัวข้อ และตัวนับจำนวนการยิงทั้งหมด */}
          <div className="flex items-center gap-2.5">
            <div className={`rounded bg-slate-800 border border-slate-700/80 text-cyan-400 ${isShotLogExpanded ? 'p-1.5' : 'p-1'}`}>
              <Shield className={isShotLogExpanded ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-extrabold tracking-wider text-slate-200 uppercase ${isShotLogExpanded ? 'text-xs sm:text-sm' : 'text-[11px] sm:text-xs'}`}>
                ตารางบันทึกการยิงและประวัติการสกัดกั้น (SHOT LOGGING TABLE)
              </span>
              {/* ป้ายแสดงจำนวนช็อตที่มีการยิงเกิดขึ้นในเซสชัน */}
              <span className="px-1.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 text-[10px] font-telemetry font-bold">
                {shotLogs.length} {shotLogs.length === 1 ? 'SHOT' : 'SHOTS'}
              </span>
            </div>
          </div>

          {/* ส่วนปุ่มย่อ/ขยายแผงประวัติการยิง */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // ป้องกันการเรียก Event ซ้ำซ้อนกับ Container
                setIsShotLogExpanded((p) => !p);
              }}
              className={`flex items-center gap-1.5 rounded-md font-bold tracking-wider font-military transition-all cursor-pointer shadow-xs ${
                isShotLogExpanded
                  ? 'px-3 py-1 text-xs bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-cyan-500/60 shadow-cyan-950/50 hover:scale-[1.01] active:scale-95'
                  : 'px-2.5 py-0.5 text-[11px] bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black border border-cyan-300 shadow-cyan-950/60 hover:scale-[1.01] active:scale-95'
              }`}
              title={isShotLogExpanded ? 'ย่อแผงประวัติการยิง' : 'ขยายแผงประวัติการยิง'}
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

        {/* แผงตารางประวัติการยิง (ShotLogPanel) เมื่อผู้ใช้งานกดเปิดขยาย */}
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

      {/* =========================================================================
          หน้าต่างการตั้งค่าพารามิเตอร์ระบบ (SAMParametersModal / SETTING)
          ใช้กำหนดสเปกจรวด, แท่นยิง, รัศมีเรดาร์, ตำแหน่งแท่นยิง, จุดอ้างอิง Bullseye,
          และค่าเริ่มต้นการเกิดของเป้าหมายทางอากาศ (Default Aircraft Spawn)
          ========================================================================= */}
      <SAMParametersModal
        config={samConfig}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(newCfg) => setSAMConfig(newCfg)}
      />

      {/* =========================================================================
          หน้าต่างยืนยันการบันทึกและส่งออกไฟล์ GPX Telemetry (Export GPX Modal)
          ให้ผู้ใช้งานเลือกรูปแบบการส่งออก: รวมทั้งหมด, เฉพาะเครื่องบิน, หรือเฉพาะฐานยิงและจรวด
          ========================================================================= */}
      {isExportPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-military select-none">
          <div className="w-full max-w-lg rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-5 text-slate-200 flex flex-col gap-4">
            {/* ส่วนหัวหน้าต่างส่งออก GPX */}
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

            {/* แถบสรุปตัวชี้วัดความแม่นยำสูง (จำนวนจุดบันทึก 10Hz, จำนวนการยิง, จำนวนเครื่องบิน) */}
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

            {/* ตัวเลือกรูปแบบการส่งออกข้อมูล 3 รูปแบบ */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                เลือกข้อมูลที่ต้องการบันทึก (SELECT TRACK EXPORT):
              </label>

              {/* ตัวเลือกที่ 1: รวมกันทั้งหมด (Unified All-in-One: เครื่องบิน + ฐานยิง SAM + จรวดมิสไซล์) */}
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

              {/* ตัวเลือกที่ 2: เฉพาะเป้าหมายทางอากาศ (Aircraft Only) */}
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

              {/* ตัวเลือกที่ 3: เฉพาะฐานยิงและจรวดที่ยิง (SAM Base & Missiles Only) */}
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

            {/* ปุ่มกดยกเลิก หรือ ยืนยันการดาวน์โหลดไฟล์ GPX */}
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

      {/* =========================================================================
          หน้าต่างยืนยันการล้างข้อมูลเริ่มใหม่ทั้งหมด (Simulation Reset Confirmation Modal)
          ป้องกันผู้ใช้กดพลาดโดยไม่ตั้งใจ พร้อมแจ้งเตือนสิ่งที่จะถูกลบทั้งหมด
          ========================================================================= */}
      {isResetPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm font-military select-none">
          <div className="w-full max-w-md rounded-xl bg-slate-950 border border-rose-900/60 shadow-2xl shadow-rose-950/50 p-5 text-slate-200 flex flex-col gap-4 animate-in fade-in duration-150">
            {/* ส่วนหัวหน้าต่างยืนยันรีเซ็ต */}
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

            {/* กล่องข้อความแจ้งเตือนรายละเอียดที่จะถูกเคลีย */}
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

            {/* ปุ่มกดยกเลิก หรือ ยืนยันการล้างข้อมูลทั้งหมด */}
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

