// ========================================================================================
// ไฟล์: src/utils/gpxExporter.ts
// หน้าที่: สร้างและส่งออกไฟล์ข้อมูลมาตรฐาน GPX 1.1 และ CSV บันทึกผลการยิง
// คำอธิบาย: รวบรวมเทเลเมทรี 10Hz ของเป้าบิน จรวด SAM และพิกัดฐานยิง เพื่อนำไปเปิดวิเคราะห์ใน Tacview / ACMI
//          โดยรองรับการตัดจบวิถีการบินอย่างแม่นยำ ณ จุดสกัดกั้น (Intercept HIT) ทันทีที่เครื่องบินถูกทำลาย
// ========================================================================================

// นำเข้าอินเทอร์เฟซโครงสร้างข้อมูลจากการจำลอง
import { SimulationTelemetrySample, ShotLogEntry, SAMConfig } from '../types/simulation';
// นำเข้าฟังก์ชันช่วยเหลือทางภูมิศาสตร์และการจัดรูปแบบตัวเลข
import { decimalToDDMM, parseDDMM, formatFlightLevel, formatDegree360 } from './geo';

/**
 * โครงสร้างข้อมูลวิถีการบินของเป้าบินหลังผ่านการตรวจสอบและตัดแต่งจุดสกัดกั้น
 */
interface ProcessedTargetTrack {
  /** รายการจุดพิกัดการบินตามลำดับเวลา */
  points: Array<{ time: string; lat: number; lon: number; altFt: number; hdg: number; spd: number }>;
  /** เครื่องบินถูกยิงตก (HIT) หรือไม่ */
  destroyed: boolean;
}

/**
 * ฟังก์ชันประมวลผลจุดวิถีการบินของเป้าหมายเครื่องบิน:
 * 1. รวบรวมตำแหน่งต่อเนื่องแม้จะมีการปรับพารามิเตอร์ (เลี้ยว, ไต่ความสูง, เร่งความเร็ว) หรือการลากบนแผนที่
 * 2. หากเป้าหมายถูกยิงสกัดกั้นสำเร็จ (HIT) จะตัดเส้นทางบินให้สิ้นสุดลง ณ จุดและเวลาที่จรวดชนเป้าหมายพอดี
 * 3. เรียงลำดับเวลาอย่างถูกต้อง ไม่ให้เกิด Timestamp ซ้ำซ้อนหรือย้อนกลับ
 * @param samples ข้อมูลเทเลเมทรีดิบ 10Hz
 * @param shotLogs บันทึกประวัติการยิง
 * @returns Map ของ Target ID กับเส้นทางบินที่ประมวลผลแล้ว
 */
function processAircraftTargetTracks(
  samples: SimulationTelemetrySample[],
  shotLogs: ShotLogEntry[]
): Map<string, ProcessedTargetTrack> {
  // 1. จัดกลุ่มจุดพิกัดดิบตาม ID ของเป้าบินแต่ละลำ
  const rawTargetPoints = new Map<
    string,
    Array<{ time: string; lat: number; lon: number; altFt: number; hdg: number; spd: number }>
  >();

  // วนลูปอ่านตัวอย่างเทเลเมทรีทีละเสี้ยววินาที
  for (const s of samples) {
    for (const t of s.targets) {
      if (!rawTargetPoints.has(t.id)) {
        rawTargetPoints.set(t.id, []);
      }
      rawTargetPoints.get(t.id)!.push({
        time: s.timestampIso, // เวลาสากล ISO
        lat: t.lat, // ละติจูด
        lon: t.lon, // ลองจิจูด
        altFt: t.altitudeFt, // ความสูง (ฟุต)
        hdg: t.headingDeg, // มุมทิศทางการบิน
        spd: t.speedMach, // ความเร็วมัค
      });
    }
  }

  const processedTargetTracks = new Map<string, ProcessedTargetTrack>();

  // วนลูปประมวลผลเส้นทางบินของเครื่องบินทีละลำ
  rawTargetPoints.forEach((pts, targetId) => {
    if (pts.length === 0) return;

    // เวลาเริ่มบินของลำนี้
    const trackStartMs = new Date(pts[0].time).getTime();

    // ค้นหาบันทึกการยิงโดนเป้า (HIT) ที่สอดคล้องกับเครื่องบินลำนี้ในรอบการบินปัจจุบัน
    const hitLog = shotLogs.find((l) => {
      if (l.targetName !== targetId || l.result !== 'HIT') return false;
      const hitIso = l.interceptTimestampIso || l.timestampIso;
      if (!hitIso) return false;
      const hitMs = new Date(hitIso).getTime();
      return hitMs >= trackStartMs - 2000;
    });

    let finalPts = pts;
    let isDestroyed = false;

    // หากพบว่าเครื่องบินลำนี้ถูกจรวดยิงตก
    if (hitLog) {
      isDestroyed = true;
      const hitIso = hitLog.interceptTimestampIso || hitLog.timestampIso || pts[pts.length - 1].time;
      const hitTimeMs = new Date(hitIso).getTime();

      // กรองเก็บเฉพาะจุดบินที่เกิดขึ้นก่อนหรือตรงกับเวลาสกัดกั้นเท่านั้น (ตัดจุดหลังจากถูกยิงตกทิ้ง)
      finalPts = pts.filter((p) => new Date(p.time).getTime() <= hitTimeMs);

      // ตรวจสอบและแทรกพิกัดจุดตก/จุดชนเป้าหมายที่แท้จริงปิดท้ายเส้นทาง
      if (hitLog.interceptLat !== undefined && hitLog.interceptLon !== undefined) {
        if (finalPts.length === 0) {
          finalPts = [
            {
              lat: hitLog.interceptLat,
              lon: hitLog.interceptLon,
              altFt: hitLog.interceptAltFt ?? 20000,
              time: hitIso,
              hdg: 0,
              spd: 0,
            },
          ];
        } else {
          const lastPt = finalPts[finalPts.length - 1];
          const lastPtTimeMs = new Date(lastPt.time).getTime();

          // หากเวลาจุดสุดท้ายใกล้เคียงจุดชนมาก ให้แทนที่พิกัดจุดสุดท้าย
          if (Math.abs(lastPtTimeMs - hitTimeMs) < 150) {
            lastPt.lat = hitLog.interceptLat;
            lastPt.lon = hitLog.interceptLon;
            if (hitLog.interceptAltFt !== undefined) lastPt.altFt = hitLog.interceptAltFt;
          } else if (lastPtTimeMs < hitTimeMs) {
            // หากยังมีเวลาเหลือ ให้เพิ่มจุดสกัดกั้นต่อท้ายสุด
            finalPts.push({
              lat: hitLog.interceptLat,
              lon: hitLog.interceptLon,
              altFt: hitLog.interceptAltFt ?? lastPt.altFt,
              time: hitIso,
              hdg: lastPt.hdg,
              spd: lastPt.spd,
            });
          }
        }
      }
    }

    // บันทึกผลลัพธ์ลงใน Map
    processedTargetTracks.set(targetId, {
      points: finalPts,
      destroyed: isDestroyed,
    });
  });

  return processedTargetTracks;
}

/**
 * สร้างไฟล์ XML GPX 1.1 สำหรับเส้นทางบินของเครื่องบินเป้าหมายเท่านั้น
 * @param samples ตัวอย่างเทเลเมทรี
 * @param shotLogs บันทึกประวัติการยิง
 * @returns ข้อความ XML รูปแบบ GPX
 */
export function generateAircraftGPX(
  samples: SimulationTelemetrySample[],
  shotLogs: ShotLogEntry[]
): string {
  const startTime = samples[0]?.timestampIso || new Date().toISOString();
  const processedTargetTracks = processAircraftTargetTracks(samples, shotLogs);

  // เริ่มต้นโครงสร้างหัวไฟล์ GPX XML
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RTAF SAM-1 Simulation System" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>RTAF SAM-1 Aircraft Flight Tracks</name>
    <desc>Tactical aircraft targets recorded at 10 Hz with kinetic destruction terminations</desc>
    <time>${startTime}</time>
  </metadata>
`;

  // วนลูปสร้างแทร็กการบิน <trk> ของเครื่องบินแต่ละลำ
  processedTargetTracks.forEach((data, targetId) => {
    gpx += `  <trk>
    <name>${escapeXml(targetId)} (Aircraft Target)</name>
    <type>AIR_TARGET</type>
    <trkseg>\n`;

    for (let i = 0; i < data.points.length; i++) {
      const pt = data.points[i];
      // แปลงความสูงจากฟุตเป็นเมตรตามมาตรฐาน GPX ele
      const eleM = (pt.altFt * 0.3048).toFixed(1);
      const isLastPoint = i === data.points.length - 1;
      const isDestructionPoint = isLastPoint && data.destroyed;

      // จุดติดตาม <trkpt> พร้อมความสูง เวลา มุมทิศทาง และความเร็ว
      gpx += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lon.toFixed(6)}">
        <ele>${eleM}</ele>
        <time>${pt.time}</time>
        <course>${pt.hdg.toFixed(1)}</course>
        <speed>${(pt.spd * 340.29).toFixed(2)}</speed>
        <extensions>
          <altitudeFt>${Math.round(pt.altFt)}</altitudeFt>
          <speedMach>${pt.spd.toFixed(2)}</speedMach>
          <headingDeg>${pt.hdg.toFixed(1)}</headingDeg>
${isDestructionPoint ? `          <event>DESTROYED</event>\n          <status>DESTROYED</status>\n` : ''}        </extensions>
      </trkpt>\n`;
    }

    gpx += `    </trkseg>
  </trk>\n`;
  });

  gpx += `</gpx>`;
  return gpx;
}

/**
 * สร้างไฟล์ XML GPX 1.1 สำหรับฐานที่ตั้งระบบ SAM และวิถีการบินของจรวดทุกลูก
 * @param samples ตัวอย่างเทเลเมทรี
 * @param samConfig การตั้งค่าระบบ SAM
 * @returns ข้อความ XML รูปแบบ GPX
 */
export function generateBatteryMissilesGPX(
  samples: SimulationTelemetrySample[],
  samConfig: SAMConfig
): string {
  const startTime = samples[0]?.timestampIso || new Date().toISOString();
  const baseEleM = (samConfig.baseElevationFt * 0.3048).toFixed(1);

  // จัดกลุ่มจุดวิถีการบินของลูกจรวดตาม Missile ID
  const missileTrackMap = new Map<
    string,
    Array<{ time: string; lat: number; lon: number; altFt: number; targetId: string; status: string }>
  >();

  for (const s of samples) {
    for (const m of s.missiles) {
      if (!missileTrackMap.has(m.id)) {
        missileTrackMap.set(m.id, []);
      }
      missileTrackMap.get(m.id)!.push({
        time: s.timestampIso,
        lat: m.lat,
        lon: m.lon,
        altFt: m.altitudeFt,
        targetId: m.targetId,
        status: m.status,
      });
    }
  }

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RTAF SAM-1 Simulation System" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>RTAF SAM-1 Battery &amp; Missile Telemetry</name>
    <desc>SAM Base Battery at ${decimalToDDMM(samConfig.baseLat, true)}, ${decimalToDDMM(samConfig.baseLon, false)} and all fired missile trajectories</desc>
    <time>${startTime}</time>
  </metadata>

  <!-- มาร์กเกอร์จุดที่ตั้งฐานยิง SAM (Static Battery Waypoint) -->
  <wpt lat="${samConfig.baseLat.toFixed(6)}" lon="${samConfig.baseLon.toFixed(6)}">
    <ele>${baseEleM}</ele>
    <name>${escapeXml(samConfig.systemName)} (SAM Base)</name>
    <sym>Military Base</sym>
    <type>SAM_SITE</type>
    <extensions>
      <elevationFt>${samConfig.baseElevationFt}</elevationFt>
      <launchersCount>${samConfig.launcherCount}</launchersCount>
      <missileSpeedMach>${samConfig.missileSpeedMach}</missileSpeedMach>
      <timeOfFlightSec>${samConfig.timeOfFlightSec}</timeOfFlightSec>
    </extensions>
  </wpt>
`;

  // วิถีการบินของลูกจรวดขีปนาวุธต่อสู้อากาศยาน
  missileTrackMap.forEach((points, missileId) => {
    const targetId = points[0]?.targetId || 'UNKNOWN';
    const finalStatus = points[points.length - 1]?.status || 'UNKNOWN';

    gpx += `  <trk>
    <name>${escapeXml(missileId)} -&gt; ${escapeXml(targetId)} [${finalStatus}]</name>
    <type>SURFACE_TO_AIR_MISSILE</type>
    <trkseg>\n`;

    for (const pt of points) {
      const eleM = (pt.altFt * 0.3048).toFixed(1);
      gpx += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lon.toFixed(6)}">
        <ele>${eleM}</ele>
        <time>${pt.time}</time>
        <extensions>
          <missileId>${escapeXml(missileId)}</missileId>
          <targetId>${escapeXml(pt.targetId)}</targetId>
          <status>${escapeXml(pt.status)}</status>
        </extensions>
      </trkpt>\n`;
    }

    gpx += `    </trkseg>
  </trk>\n`;
  });

  gpx += `</gpx>`;
  return gpx;
}

/**
 * สร้างไฟล์ XML GPX 1.1 แบบรวมศูนย์สมบูรณ์แบบ (Unified GPX):
 * รวมทั้ง ฐานที่ตั้ง SAM, เส้นทางบินของเครื่องบินเป้าหมาย และวิถีการบินของลูกจรวด
 * @param samples ข้อมูลเทเลเมทรี
 * @param shotLogs บันทึกประวัติการยิง
 * @param samConfig การตั้งค่าระบบ SAM
 * @returns ข้อความ XML รูปแบบ GPX
 */
export function generateUnifiedGPX(
  samples: SimulationTelemetrySample[],
  shotLogs: ShotLogEntry[],
  samConfig: SAMConfig
): string {
  const startTime = samples[0]?.timestampIso || new Date().toISOString();
  const baseEleM = (samConfig.baseElevationFt * 0.3048).toFixed(1);

  // 1. ประมวลผลเส้นทางบินของเครื่องบิน (ตัดจบเมื่อถูกยิงตก)
  const processedTargetTracks = processAircraftTargetTracks(samples, shotLogs);

  // 2. จัดกลุ่มเส้นทางบินของลูกจรวด
  const missileTrackMap = new Map<
    string,
    Array<{ time: string; lat: number; lon: number; altFt: number; targetId: string; status: string }>
  >();

  for (const s of samples) {
    for (const m of s.missiles) {
      if (!missileTrackMap.has(m.id)) {
        missileTrackMap.set(m.id, []);
      }
      missileTrackMap.get(m.id)!.push({
        time: s.timestampIso,
        lat: m.lat,
        lon: m.lon,
        altFt: m.altitudeFt,
        targetId: m.targetId,
        status: m.status,
      });
    }
  }

  // 3. เริ่มประกอบเอกสาร XML
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RTAF SAM-1 Simulation System" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>RTAF SAM-1 Unified Air Defense Telemetry</name>
    <desc>Tactical air defense simulation containing SAM Base, Aircraft Targets, and Missile Engagements</desc>
    <time>${startTime}</time>
  </metadata>

  <!-- มาร์กเกอร์จุดที่ตั้งฐานยิง SAM -->
  <wpt lat="${samConfig.baseLat.toFixed(6)}" lon="${samConfig.baseLon.toFixed(6)}">
    <ele>${baseEleM}</ele>
    <name>${escapeXml(samConfig.systemName)} (SAM Base)</name>
    <sym>Military Base</sym>
    <type>SAM_SITE</type>
    <extensions>
      <elevationFt>${samConfig.baseElevationFt}</elevationFt>
      <launchersCount>${samConfig.launcherCount}</launchersCount>
      <missileSpeedMach>${samConfig.missileSpeedMach}</missileSpeedMach>
      <timeOfFlightSec>${samConfig.timeOfFlightSec}</timeOfFlightSec>
    </extensions>
  </wpt>
`;

  // เส้นทางบินของเครื่องบินทุกลำ
  processedTargetTracks.forEach((data, targetId) => {
    gpx += `  <trk>
    <name>${escapeXml(targetId)} (Aircraft Target)</name>
    <type>AIR_TARGET</type>
    <trkseg>\n`;

    for (let i = 0; i < data.points.length; i++) {
      const pt = data.points[i];
      const eleM = (pt.altFt * 0.3048).toFixed(1);
      const isLastPoint = i === data.points.length - 1;
      const isDestructionPoint = isLastPoint && data.destroyed;

      gpx += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lon.toFixed(6)}">
        <ele>${eleM}</ele>
        <time>${pt.time}</time>
        <course>${pt.hdg.toFixed(1)}</course>
        <speed>${(pt.spd * 340.29).toFixed(2)}</speed>
        <extensions>
          <altitudeFt>${Math.round(pt.altFt)}</altitudeFt>
          <speedMach>${pt.spd.toFixed(2)}</speedMach>
          <headingDeg>${pt.hdg.toFixed(1)}</headingDeg>
${isDestructionPoint ? `          <event>DESTROYED</event>\n          <status>DESTROYED</status>\n` : ''}        </extensions>
      </trkpt>\n`;
    }

    gpx += `    </trkseg>
  </trk>\n`;
  });

  // วิถีการบินของจรวดทุกลูก
  missileTrackMap.forEach((points, missileId) => {
    const targetId = points[0]?.targetId || 'UNKNOWN';
    const finalStatus = points[points.length - 1]?.status || 'UNKNOWN';

    gpx += `  <trk>
    <name>${escapeXml(missileId)} -&gt; ${escapeXml(targetId)} [${finalStatus}]</name>
    <type>SURFACE_TO_AIR_MISSILE</type>
    <trkseg>\n`;

    for (const pt of points) {
      const eleM = (pt.altFt * 0.3048).toFixed(1);
      gpx += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lon.toFixed(6)}">
        <ele>${eleM}</ele>
        <time>${pt.time}</time>
        <extensions>
          <missileId>${escapeXml(missileId)}</missileId>
          <targetId>${escapeXml(pt.targetId)}</targetId>
          <status>${escapeXml(pt.status)}</status>
        </extensions>
      </trkpt>\n`;
    }

    gpx += `    </trkseg>
  </trk>\n`;
  });

  gpx += `</gpx>`;
  return gpx;
}

/**
 * ส่งออกตารางบันทึกประวัติการยิง (Shot Logs) เป็นไฟล์ CSV สำหรับเปิดใน Microsoft Excel หรือโปรแกรมวิเคราะห์ข้อมูล
 * @param logs รายการบันทึกการยิง
 * @returns ข้อความรูปแบบ CSV
 */
export function exportShotLogsCSV(logs: ShotLogEntry[]): string {
  // หัวคอลัมน์ของไฟล์ CSV
  const headers = [
    'Shot ID',
    'Launch Time (Local)',
    'Launch Time (Zulu)',
    'Target Name',
    'INIT Bearing&Range&Altitude (BBB/Range/FL)',
    'Initial Coordinates',
    'Initial Bearing (°)',
    'Initial Range (NM)',
    'Initial Altitude (ft)',
    'Quality of Shot (Zone)',
    'Result',
    'Result Time (Local)',
    'Result Time (Zulu)',
    'Final Bearing/Range/FL',
    'Final Coordinates',
  ];

  // แปลงข้อมูลแต่ละแถวเป็น CSV row
  const rows = logs.map((l) => {
    const initBbb = formatDegree360(l.initialBearingDeg);
    const initRng = Math.round(l.initialRangeNM).toString();
    const initFl = formatFlightLevel(l.initialAltitudeFt);
    const initBrgRngFl = `${initBbb}/${initRng}/${initFl}`;

    const bbb = l.finalBearingDeg !== undefined ? formatDegree360(l.finalBearingDeg) : '-';
    const rng = l.finalRangeNM !== undefined ? Math.round(l.finalRangeNM).toString() : '-';
    const finalAlt = l.finalAltitudeFt ?? l.interceptAltFt;
    const finalFl = finalAlt !== undefined ? formatFlightLevel(finalAlt) : l.initialAltitudeFt !== undefined ? formatFlightLevel(l.initialAltitudeFt) : '-';
    const finalBrgRngFl = bbb !== '-' && rng !== '-' && finalFl !== '-' ? `${bbb}/${rng}/${finalFl}` : bbb !== '-' && rng !== '-' ? `${bbb}/${rng}` : '-';

    return [
      l.shotId,
      `"${l.timestampLocal}"`,
      `"${l.timestampZulu}"`,
      l.targetName,
      `"${initBrgRngFl}"`,
      `"${l.initialCoordinates || '-'}"`,
      l.initialBearingDeg.toFixed(1),
      l.initialRangeNM.toFixed(2),
      Math.round(l.initialAltitudeFt),
      `"${l.qualityOfShot}"`,
      l.result,
      `"${l.resultTimeLocal || '-'}"`,
      `"${l.resultTimeZulu || '-'}"`,
      `"${finalBrgRngFl}"`,
      `"${l.finalCoordinates}"`,
    ];
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * สั่งให้เว็บเบราว์เซอร์ดาวน์โหลดไฟล์ข้อความ/ไบนารีลงในเครื่องของผู้ใช้งานทันที
 * @param content ข้อมูลข้อความที่จะบันทึก
 * @param fileName ชื่อไฟล์ที่ต้องการบันทึก เช่น 'flight_telemetry.gpx'
 * @param mimeType ประเภท MIME Type เช่น 'application/gpx+xml', 'text/csv'
 */
export function triggerFileDownload(content: string, fileName: string, mimeType: string) {
  // สร้าง Blob ออบเจกต์จากเนื้อหา
  const blob = new Blob([content], { type: mimeType });
  // สร้าง URL ชั่วคราวในหน่วยความจำ
  const url = URL.createObjectURL(blob);
  // สร้างแท็ก <a> เพื่อกระตุ้นการดาวน์โหลด
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  // ทำความสะอาด DOM และคืนหน่วยความจำ URL
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * ฟังก์ชันหลีกเลี่ยงอักขระพิเศษสำหรับ XML เพื่อไม่ให้เอกสาร XML พัง (Escape XML Characters)
 * @param unsafe ข้อความดิบ
 * @returns ข้อความที่แปลงอักขระ & < > ' " เรียบร้อยแล้ว
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
    }
    return c;
  });
}
