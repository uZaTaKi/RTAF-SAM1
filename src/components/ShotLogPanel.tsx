import React from 'react';
import { ShotLogEntry } from '../types/simulation';
import { exportShotLogsCSV, triggerFileDownload } from '../utils/gpxExporter';
import {
  FileSpreadsheet,
  FileCode,
  Trash2,
  CheckCircle,
  AlertOctagon,
  XCircle,
  Clock,
  Shield,
} from 'lucide-react';

interface ShotLogPanelProps {
  logs: ShotLogEntry[];
  onClearLogs: () => void;
}

export const ShotLogPanel: React.FC<ShotLogPanelProps> = ({ logs, onClearLogs }) => {
  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const csv = exportShotLogsCSV(logs);
    triggerFileDownload(csv, `RTAF_SAM1_Shot_Logs_${Date.now()}.csv`, 'text/csv');
  };

  const handleExportJSON = () => {
    if (logs.length === 0) return;
    const jsonStr = JSON.stringify(logs, null, 2);
    triggerFileDownload(jsonStr, `RTAF_SAM1_Shot_Logs_${Date.now()}.json`, 'application/json');
  };

  return (
    <div className="flex flex-col h-full rounded-lg bg-slate-950/90 border border-slate-800 shadow-xl overflow-hidden font-military select-none">
      {/* Header & Export Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold tracking-wider uppercase text-slate-100">
            ENGAGEMENT SHOT LOGGING SYSTEM ({logs.length})
          </h3>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 text-slate-200 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>EXPORT CSV</span>
          </button>
          <button
            onClick={handleExportJSON}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 text-slate-200 transition-colors"
          >
            <FileCode className="w-3.5 h-3.5 text-sky-400" />
            <span>EXPORT JSON</span>
          </button>
          <button
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Clear All Logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-slate-600 text-xs">
            <Clock className="w-6 h-6 mb-1 text-slate-700" />
            <span>NO SHOTS FIRED YET</span>
            <span className="text-[10px] text-slate-600 mt-0.5">
              Select an aircraft target on the radar scope and click FIRE
            </span>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900/60 sticky top-0 text-[10px] font-bold text-slate-400 border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="py-2 px-3"># SHOT</th>
                <th className="py-2 px-3">TIMESTAMPS (LOCAL / ZULU)</th>
                <th className="py-2 px-3">TARGET</th>
                <th className="py-2 px-3">INIT BEARING & RANGE</th>
                <th className="py-2 px-3">ALTITUDE</th>
                <th className="py-2 px-3">QUALITY OF SHOT (ZONE)</th>
                <th className="py-2 px-3">RESULT & TOF</th>
                <th className="py-2 px-3">FINAL POSITION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 font-telemetry">
              {logs.map((log) => {
                const isHit = log.result === 'HIT';
                const isMiss = log.result === 'MISS';
                const isTerm = log.result === 'TERMINATE';

                return (
                  <tr key={log.shotId} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-2 px-3 font-bold text-slate-300">
                      {log.shotId}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-400 whitespace-nowrap">
                      <div>LOC: {log.timestampLocal}</div>
                      <div className="text-cyan-400 font-bold">Z: {log.timestampZulu}</div>
                    </td>
                    <td className="py-2 px-3 font-bold text-rose-400">
                      {log.targetName}
                    </td>
                    <td className="py-2 px-3 text-slate-200">
                      <span>{log.initialBearingDeg.toFixed(1)}°</span>
                      <span className="text-slate-600 mx-1">/</span>
                      <span className="text-cyan-300 font-semibold">{log.initialRangeNM.toFixed(1)} NM</span>
                    </td>
                    <td className="py-2 px-3 text-emerald-300">
                      {Math.round(log.initialAltitudeFt).toLocaleString()} ft
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-military font-semibold bg-cyan-950/80 border border-cyan-600/40 text-cyan-300">
                        {log.qualityOfShot}
                      </span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-military font-bold text-[11px]">
                        {isHit && (
                          <span className="text-rose-400 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5 text-rose-500" />
                            HIT
                          </span>
                        )}
                        {isMiss && (
                          <span className="text-slate-400 flex items-center gap-1">
                            <AlertOctagon className="w-3.5 h-3.5 text-slate-500" />
                            MISS
                          </span>
                        )}
                        {isTerm && (
                          <span className="text-amber-400 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5 text-amber-500" />
                            TERMINATE
                          </span>
                        )}
                        <span className="text-slate-500 font-telemetry text-[10px]">
                          ({log.timeElapsedSec.toFixed(1)}s)
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-[10px] text-slate-400 font-mono">
                      {log.finalCoordinates}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
