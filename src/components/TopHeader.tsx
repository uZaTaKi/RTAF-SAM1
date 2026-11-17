// ========================================================================================
// ไฟล์: src/components/TopHeader.tsx
// หน้าที่: คอมโพเนนต์แถบเมนูด้านบนสุดของโปรแกรม (Command & Control Top Header Bar)
// คำอธิบาย: แสดงชื่อระบบ C2, นาฬิกาเวลาท้องถิ่น (LOC) และเวลาสากลซูลู (ZULU), ปุ่มเริ่ม/หยุดจำลอง,
//          ปุ่มสร้างเป้าบินด่วน (+TARGET), ปุ่มนำเข้า/ล้างแผนที่ KML, ปุ่มเปิดการตั้งค่า (SETTING) และปุ่มรีเซ็ตระบบ
// ========================================================================================

// นำเข้า React hooks พื้นฐาน
import React, { useState, useEffect } from 'react';
// นำเข้าไอคอนจากไลบรารี lucide-react
import {
  Play,
  Square,
  Crosshair,
  Settings,
  Upload,
  Plus,
  Trash2,
  Clock,
  FileDown,
  RotateCcw,
} from 'lucide-react';

/**
 * กำหนด Props สำหรับคอมโพเนนต์ TopHeader
 */
interface TopHeaderProps {
  /** ชื่อระบบขีปนาวุธที่กำลังใช้งานอยู่ เช่น 'RTAF KS-1C (HQ-12)' */
  systemName: string;
  /** สถานะการจำลองว่ากำลังรันบันทึกข้อมูลอยู่หรือไม่ */
  isSimRunning: boolean;
  /** จำนวนตัวอย่างเทเลเมทรีที่บันทึกไว้ในบัฟเฟอร์ */
  sampleCount: number;
  /** ฟังก์ชัน Callback เมื่อกดปุ่ม START SIMULATION */
  onStartSim: () => void;
  /** ฟังก์ชัน Callback เมื่อกดปุ่ม STOP SIMULATION */
  onStopSim: () => void;
  /** ฟังก์ชัน Callback เมื่อกดปุ่มส่งออกไฟล์ GPX แบบแมนนวล */
  onExportGpx?: () => void;
  /** ฟังก์ชัน Callback สำหรับรีเซ็ตประวัติและเป้าหมายทั้งหมด */
  onResetAll?: () => void;
  /** ฟังก์ชัน Callback สำหรับล้างชั้นข้อมูลเส้นแผนที่ KML/KMZ */
  onClearKmlOverlays?: () => void;
  /** จำนวนชั้นข้อมูลแผนที่ KML ที่โหลดอยู่ในระบบ */
  overlayCount?: number;
  /** ฟังก์ชัน Callback สำหรับเปิดหน้าต่างตั้งค่าพารามิเตอร์ระบบ (SETTING) */
  onOpenSettings: () => void;
  /** ฟังก์ชัน Callback เมื่อผู้ใช้อัปโหลดไฟล์ KML/KMZ หรือ GeoJSON */
  onUploadKml: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** ฟังก์ชัน Callback สำหรับสร้างเป้าหมายเครื่องบินแบบด่วน */
  onQuickSpawnTarget: () => void;
  /** ฟังก์ชัน Callback สำหรับลบเป้าหมายเครื่องบินทั้งหมด */
  onClearTargets: () => void;
  /** จำนวนเป้าหมายเครื่องบินที่มีอยู่ในจอเรดาร์ปัจจุบัน */
  targetCount: number;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  systemName,
  isSimRunning,
  sampleCount,
  onStartSim,
  onStopSim,
  onExportGpx,
  onResetAll,
  onClearKmlOverlays,
  overlayCount = 0,
  onOpenSettings,
  onUploadKml,
  onQuickSpawnTarget,
  onClearTargets,
  targetCount,
}) => {
  // สเตตสำหรับเก็บค่าเวลาปัจจุบัน ทั้งเวลาท้องถิ่น (Local) และเวลาสากลซูลู (Zulu)
  const [currentTime, setCurrentTime] = useState<{ local: string; zulu: string }>({
    local: '',
    zulu: '',
  });

  // ใช้ useEffect สำหรับอัปเดตเวลานาฬิกาแบบเรียลไทม์ทุกๆ 1 วินาที
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      // จัดรูปแบบเวลาท้องถิ่นแบบ 24 ชั่วโมง
      const localStr = now.toLocaleTimeString('en-US', { hour12: false });
      // จัดรูปแบบเวลามาตรฐานซูลู (UTC)
      const zuluHours = now.getUTCHours().toString().padStart(2, '0');
      const zuluMins = now.getUTCMinutes().toString().padStart(2, '0');
      const zuluSecs = now.getUTCSeconds().toString().padStart(2, '0');
      setCurrentTime({
        local: localStr,
        zulu: `${zuluHours}:${zuluMins}:${zuluSecs}Z`,
      });
    };

    // เรียกทำงานทันทีที่คอมโพเนนต์ถูกเรนเดอร์
    updateClock();
    // ตั้งเวลา interval อัปเดตทุก 1000 มิลลิวินาที (1 วินาที)
    const timer = setInterval(updateClock, 1000);
    // คืนหน่วยความจำเมื่อคอมโพเนนต์ถูก unmount
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-slate-200 font-military shadow-md select-none">
      {/* 1. โลโก้และชื่อระบบจำลอง C2 กองทัพอากาศ */}
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
            FLIGHT OPERATIONS SUPPORT · 10 HZ GPX TELEMETRY RECORDER
          </div>
        </div>
      </div>

      {/* 2. ส่วนแสดงนาฬิกาเวลาท้องถิ่น (LOC) และเวลาสากลซูลู (ZULU) */}
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
      </div>

      {/* 3. ปุ่มควบคุมหลักของแถบเครื่องมือ */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* ปุ่มเริ่มหรือหยุดการจำลอง (START / STOP SIMULATION) */}
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
            <span>STOP SIMULATION</span>
          </button>
        )}

        {/* ปุ่มส่งออกไฟล์ GPX แบบแมนนวลเมื่อหยุดการจำลองและมีข้อมูลในบัฟเฟอร์ */}
        {!isSimRunning && sampleCount > 0 && onExportGpx && (
          <button
            onClick={onExportGpx}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 transition-colors"
            title="Export Unified GPX Telemetry File"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>EXPORT GPX</span>
          </button>
        )}

        <div className="w-[1px] h-4 bg-slate-800 hidden sm:block" />

        {/* ปุ่มสร้างเป้าหมายบินแบบด่วน (+ TARGET) */}
        <button
          onClick={onQuickSpawnTarget}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors"
          title="Spawn target facing SAM site"
        >
          <Plus className="w-3.5 h-3.5 text-cyan-400" />
          <span>+ TARGET</span>
        </button>

        {/* ปุ่มอัปโหลดเลเยอร์แผนที่ KML / KMZ หรือ GeoJSON */}
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

        {/* ปุ่มล้างเส้นแผนที่ KML / KMZ ที่โหลดไว้ */}
        <button
          onClick={onClearKmlOverlays}
          disabled={!overlayCount || overlayCount === 0}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border transition-colors ${
            overlayCount && overlayCount > 0
              ? 'bg-slate-900 hover:bg-rose-950/70 border-slate-700 hover:border-rose-600/70 text-slate-200 hover:text-rose-200 cursor-pointer shadow-xs active:scale-95'
              : 'bg-slate-900/40 border-slate-800/60 text-slate-600 cursor-not-allowed opacity-50'
          }`}
          title={
            overlayCount && overlayCount > 0
              ? `ล้างเส้นแผนที่ KML/KMZ ทั้งหมด (${overlayCount} ชั้นข้อมูล)`
              : 'ไม่มีเส้นแผนที่ KML/KMZ ให้ล้าง'
          }
        >
          <Trash2 className={`w-3.5 h-3.5 ${overlayCount && overlayCount > 0 ? 'text-rose-400' : 'text-slate-600'}`} />
          <span className="hidden md:inline">CLEAR KML</span>
          {overlayCount && overlayCount > 0 ? (
            <span className="text-[10px] px-1 rounded bg-rose-950/80 text-rose-300 border border-rose-500/40 font-telemetry">
              {overlayCount}
            </span>
          ) : null}
        </button>

        {/* ปุ่มเปิดหน้าต่างตั้งค่าระบบและจุด Bullseye (SETTING) */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 transition-colors"
          title="Configure System Settings, Bullseye & Radar Parameters"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>SETTING</span>
        </button>

        {/* ปุ่มรีเซ็ตระบบและข้อมูลการยิงทั้งหมดเพื่อเริ่มรอบใหม่ (RESET) */}
        {onResetAll && (
          <button
            onClick={onResetAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-rose-950/70 border border-slate-700 hover:border-rose-600/70 text-slate-200 hover:text-rose-200 transition-colors cursor-pointer group shadow-xs active:scale-95"
            title="Reset All Simulation History & Targets to Start Fresh"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400 group-hover:text-rose-400 group-hover:-rotate-90 transition-transform duration-200" />
            <span className="font-bold">RESET</span>
          </button>
        )}

        {/* ปุ่มลบเป้าหมายเครื่องบินทั้งหมดออกจากจอเรดาร์ */}
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
