// ========================================================================================
// ไฟล์: src/components/FiringControlPanel.tsx
// หน้าที่: แผงควบคุมการยิงอาวุธปล่อยนำวิถีต่อสู้อากาศยาน (Surface-to-Air Firing Control Panel)
// คำอธิบาย: แสดงสถานะแท่นยิงแต่ละแท่น (Launcher 1..N), ปริมาณลูกจรวดพร้อมยิง (Ammo Dots),
//          เวลานับถอยหลังการโหลดจรวดใหม่ (Countdown Timer), รายการจรวดที่กำลังบินอยู่ (In-Flight Missiles),
//          ปุ่มกดปล่อยอาวุธ (FIRE) และปุ่มทำลายจรวดฉุกเฉิน (TERMINATE)
// ========================================================================================

// นำเข้า React
import React from 'react';
// นำเข้าโครงสร้างข้อมูลแท่นยิง จรวด และการตั้งค่าระบบ SAM
import { LauncherState, ActiveMissile, SAMConfig } from '../types/simulation';
// นำเข้าฟังก์ชันจัดรูปแบบเวลา MM:SS
import { formatMMSS } from '../utils/geo';
// นำเข้าไอคอนจากไลบรารี lucide-react
import {
  Flame,
  XCircle,
  ShieldAlert,
  RotateCw,
  Radio,
  PanelRightClose,
} from 'lucide-react';

/**
 * กำหนด Props สำหรับคอมโพเนนต์ FiringControlPanel
 */
interface FiringControlPanelProps {
  /** การตั้งค่าระบบ SAM */
  samConfig: SAMConfig;
  /** รายการสถานะของแท่นยิงทั้งหมด */
  launchers: LauncherState[];
  /** รายการลูกจรวดที่กำลังบินอยู่ในอากาศ */
  missiles: ActiveMissile[];
  /** รหัสเป้าหมายที่ถูกเลือกอยู่บนจอเรดาร์ (null หากไม่ได้เลือก) */
  selectedTargetId: string | null;
  /** รหัสลูกจรวดที่ถูกเลือกสำหรับดูหรือสั่งการ */
  selectedMissileId: string | null;
  /** ดัชนีของแท่นยิงถัดไปที่จะเป็นคิวยิง */
  nextLauncherIndex: number;
  /** ฟังก์ชัน Callback สำหรับสั่งยิงจรวด (FIRE) */
  onFire: () => void;
  /** ฟังก์ชัน Callback สำหรับสั่งทำลายจรวด (TERMINATE) */
  onTerminate: (missileId?: string) => void;
  /** ฟังก์ชัน Callback เมื่อคลิกเลือกลูกจรวดเพื่อโฟกัส */
  onSelectMissile: (missileId: string | null) => void;
  /** ฟังก์ชัน Callback สำหรับย่อ/พับแผงควบคุมการยิง */
  onToggleCollapse?: () => void;
}

export const FiringControlPanel: React.FC<FiringControlPanelProps> = ({
  samConfig,
  launchers,
  missiles,
  selectedTargetId,
  selectedMissileId,
  nextLauncherIndex,
  onFire,
  onTerminate,
  onSelectMissile,
  onToggleCollapse,
}) => {
  // กรองเฉพาะจรวดที่กำลังบินอยู่ในอากาศ (สถานะ IN_FLIGHT)
  const activeInFlightMissiles = missiles.filter((m) => m.status === 'IN_FLIGHT');
  // จำนวนการสกัดกั้นที่กำลังดำเนินอยู่
  const activeEngagementsCount = activeInFlightMissiles.length;
  // ตรวจสอบว่าจำนวนการยิงพร้อมกันถึงขีดจำกัดสูงสุดของระบบแล้วหรือไม่
  const isEngagementLimitReached = activeEngagementsCount >= samConfig.maxSimultaneousEngagements;

  // ตรวจสอบว่ามีแท่นยิงใดที่มีจรวดเหลือและไม่อยู่ระหว่างการโหลดใหม่หรือไม่
  const hasReadyLauncher = launchers.some((l) => l.missilesRemaining > 0 && !l.isReloading);

  // เงื่อนไขความพร้อมในการยิง: ต้องมีเป้าหมายที่เลือกไว้, จำนวนยิงยังไม่เต็มโควต้า และมีแท่นยิงที่พร้อม
  const canFire = Boolean(selectedTargetId) && !isEngagementLimitReached && hasReadyLauncher;

  // ตรวจสอบว่าเป้าหมายที่เลือกอยู่ในขณะนี้กำลังมีจรวดพุ่งไปหาอยู่หรือไม่
  const targetEngagingMissile = selectedTargetId
    ? activeInFlightMissiles.find((m) => m.targetId === selectedTargetId)
    : null;

  // ระบุจรวดที่สามารถสั่งทำลาย (TERMINATE) ได้: อิงตามที่เลือก หรือจรวดที่กำลังโจมตีเป้าหมายที่เลือก
  const activeMissileToTerminate = selectedMissileId
    ? activeInFlightMissiles.find((m) => m.id === selectedMissileId)
    : targetEngagingMissile || (activeInFlightMissiles.length === 1 ? activeInFlightMissiles[0] : null);

  // เงื่อนไขว่าสามารถกดยุติ/ทำลายจรวดได้หรือไม่
  const canTerminate = Boolean(activeMissileToTerminate);

  return (
    <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-slate-950/95 border border-slate-800 shadow-xl font-military select-none text-slate-200">
      {/* 1. ส่วนหัวแผงควบคุม โควต้าการยิง และปุ่มพับเก็บ */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-[10px] font-bold tracking-wider text-slate-200 uppercase">
            FIRING OPERATIONS
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* ป้ายแสดงโควต้าการยิงสกัดกั้นพร้อมกัน */}
          <span
            className={`text-[9px] font-telemetry font-bold px-1.5 py-0.5 rounded ${
              isEngagementLimitReached
                ? 'bg-rose-950 text-rose-300 border border-rose-600/60'
                : 'bg-slate-900 text-cyan-300 border border-slate-700'
            }`}
          >
            {activeEngagementsCount}/{samConfig.maxSimultaneousEngagements} ENG
          </span>
          {/* ปุ่มพับเก็บแผงควบคุม */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Hide Firing Panel"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. ตารางแสดงสถานะแท่นยิงแต่ละแท่น (Launcher Matrix) */}
      <div className="grid grid-cols-2 gap-1">
        {launchers.map((launcher, idx) => {
          // แท่นนี้เป็นคิวยิงถัดไปหรือไม่
          const isNext = idx === nextLauncherIndex && !launcher.isReloading && launcher.missilesRemaining > 0;
          // กระสุนหมดเกลี้ยงหรือไม่
          const isDepleted = launcher.missilesRemaining === 0 && !launcher.isReloading;
          // เปอร์เซ็นต์ความคืบหน้าในการโหลดจรวดใหม่
          const reloadPct = launcher.isReloading
            ? Math.max(0, Math.min(100, ((launcher.reloadTimeSec - launcher.reloadRemainingSec) / launcher.reloadTimeSec) * 100))
            : 0;

          return (
            <div
              key={launcher.id}
              className={`p-1.5 rounded flex flex-col gap-0.5 border transition-all ${
                launcher.isReloading
                  ? 'bg-amber-950/30 border-amber-500/50'
                  : isNext
                  ? 'bg-emerald-950/40 border-emerald-500/70 shadow-xs shadow-emerald-500/20 ring-1 ring-emerald-500/40'
                  : isDepleted
                  ? 'bg-slate-950/70 border-slate-800 opacity-60'
                  : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              {/* หมายเลขแท่นและป้ายสถานะ */}
              <div className="flex items-center justify-between text-[9px]">
                <span className="font-bold text-slate-300">
                  LNCH #{launcher.id}
                </span>
                {launcher.isReloading ? (
                  <span className="font-telemetry font-bold px-1 rounded bg-amber-900/80 text-amber-300 flex items-center gap-0.5 text-[9px]">
                    <RotateCw className="w-2.5 h-2.5 animate-spin" />
                    {formatMMSS(launcher.reloadRemainingSec)}
                  </span>
                ) : isNext ? (
                  <span className="font-telemetry font-bold px-1 rounded bg-emerald-900/80 text-emerald-300 text-[8px]">
                    NEXT
                  </span>
                ) : (
                  <span className="font-telemetry text-slate-500 text-[8px]">
                    READY
                  </span>
                )}
              </div>

              {/* ขีด/จุดแสดงจำนวนลูกจรวดพร้อมยิง (Visual Ammo Dots) */}
              <div className="flex items-center gap-0.5 my-0.5">
                {Array.from({ length: launcher.maxMissiles }).map((_, mIdx) => {
                  const isAvailable = mIdx < launcher.missilesRemaining;
                  return (
                    <div
                      key={mIdx}
                      className={`h-2 flex-1 rounded-xs transition-colors ${
                        isAvailable
                          ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                          : 'bg-slate-800 border border-slate-700/60'
                      }`}
                      title={isAvailable ? `Missile ${mIdx + 1} Ready` : 'Depleted'}
                    />
                  );
                })}
              </div>

              {/* ข้อความบอกจำนวนกระสุนจรวด */}
              <div className="flex items-center justify-between text-[9px] font-telemetry">
                <span className="text-slate-400">AMMO:</span>
                <span className="font-bold text-slate-200">
                  {launcher.missilesRemaining}/{launcher.maxMissiles}
                </span>
              </div>

              {/* แถบและเวลานับถอยหลังการโหลดจรวดใหม่ (เฉพาะเวลาตัวเลข MM:SS) */}
              {launcher.isReloading && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-amber-400 h-1 transition-all duration-200"
                      style={{ width: `${reloadPct}%` }}
                    />
                  </div>
                  <div className="text-center text-[9px] font-telemetry text-amber-300 font-bold">
                    {formatMMSS(launcher.reloadRemainingSec)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. แถบแสดงจรวดที่กำลังบินอยู่และเวลาถึงเป้าหมาย (Active In-Flight Missiles Ticker) */}
      {activeInFlightMissiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 p-1 rounded bg-amber-950/20 border border-amber-500/30 font-telemetry text-[10px]">
          <span className="text-amber-400 font-bold flex items-center gap-1 text-[9px]">
            <Radio className="w-2.5 h-2.5 animate-pulse text-amber-400" />
            MISSILES:
          </span>
          {activeInFlightMissiles.map((m) => (
            <button
              key={m.id}
              onClick={() => onSelectMissile(selectedMissileId === m.id ? null : m.id)}
              className={`flex items-center gap-1 px-1 py-0.5 rounded text-[9px] border transition-colors ${
                selectedMissileId === m.id
                  ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                  : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-amber-500/50'
              }`}
            >
              <span>{m.id}→{m.targetId}</span>
              <span className="font-bold">({Math.max(0, Math.ceil(m.timeOfFlightRemainingSec))}s)</span>
            </button>
          ))}
        </div>
      )}

      {/* 4. ปุ่มคำสั่งหลัก: ยิง (FIRE) และ ทำลายจรวดฉุกเฉิน (TERMINATE) */}
      <div className="flex flex-col gap-1 pt-0.5">
        <button
          onClick={onFire}
          disabled={!canFire}
          className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded text-xs font-bold tracking-wider uppercase transition-all shadow-md ${
            canFire
              ? 'bg-linear-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white cursor-pointer active:scale-98 shadow-rose-950/40'
              : 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>FIRE (LNCH #{launchers[nextLauncherIndex]?.id || 1})</span>
        </button>

        {canTerminate && (
          <button
            onClick={() => onTerminate(activeMissileToTerminate?.id)}
            className="w-full flex items-center justify-center gap-1.5 py-1 px-2.5 rounded text-[11px] font-bold tracking-wider uppercase bg-linear-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white cursor-pointer active:scale-98 shadow-md transition-all"
            title={`Terminate missile ${activeMissileToTerminate?.id || ''}`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>TERMINATE {activeMissileToTerminate?.id}</span>
          </button>
        )}
      </div>

      {/* 5. สถานะเป้าหมายที่เลือก */}
      <div className="text-[9px] text-slate-400 font-telemetry flex items-center justify-between px-0.5">
        <span>
          TGT:{' '}
          <span className={selectedTargetId ? 'text-cyan-300 font-bold' : 'text-slate-500'}>
            {selectedTargetId || 'NONE'}
          </span>
        </span>
        {isEngagementLimitReached && (
          <span className="text-rose-400 font-bold">MAX REACHED</span>
        )}
      </div>
    </div>
  );
};
