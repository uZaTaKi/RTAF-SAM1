import { SimulationTelemetrySample, ShotLogEntry, SAMConfig } from '../types/simulation';
import { decimalToDDMM, parseDDMM } from './geo';

/**
 * Builds GPX 1.1 XML specifically for Aircraft Targets.
 * Fixes target persistence issue:
 * Once an aircraft target is destroyed (HIT), all further coordinates are truncated,
 * the track terminates immediately at the intercept point, and an Event Marker (<wpt>)
 * is injected to enable Tacview/ACMI to display the destruction explosion and remove the icon.
 */
export function generateAircraftGPX(
  samples: SimulationTelemetrySample[],
  shotLogs: ShotLogEntry[]
): string {
  const startTime = samples[0]?.timestampIso || new Date().toISOString();

  // Map of target hits: targetId -> ShotLogEntry
  const hitLogMap = new Map<string, ShotLogEntry>();
  for (const log of shotLogs) {
    if (log.result === 'HIT') {
      hitLogMap.set(log.targetName, log);
    }
  }

  // Group aircraft points by target ID
  const rawTargetPoints = new Map<
    string,
    Array<{ time: string; lat: number; lon: number; altFt: number; hdg: number; spd: number }>
  >();

  for (const s of samples) {
    for (const t of s.targets) {
      if (!rawTargetPoints.has(t.id)) {
        rawTargetPoints.set(t.id, []);
      }
      rawTargetPoints.get(t.id)!.push({
        time: s.timestampIso,
        lat: t.lat,
        lon: t.lon,
        altFt: t.altitudeFt,
        hdg: t.headingDeg,
        spd: t.speedMach,
      });
    }
  }

  // Truncate tracks at destruction time and build destruction waypoints
  const processedTargetTracks = new Map<
    string,
    {
      points: Array<{ time: string; lat: number; lon: number; altFt: number; hdg: number; spd: number }>;
      destroyed: boolean;
      hitPoint?: { lat: number; lon: number; altFt: number; time: string };
    }
  >();

  const destructionWaypoints: Array<{
    targetId: string;
    lat: number;
    lon: number;
    altFt: number;
    time: string;
    shotId: string;
  }> = [];

  rawTargetPoints.forEach((pts, targetId) => {
    const hitLog = hitLogMap.get(targetId);
    let finalPts = pts;
    let isDestroyed = false;
    let hitPt: { lat: number; lon: number; altFt: number; time: string } | undefined;

    if (hitLog) {
      isDestroyed = true;
      const hitTimeMs = hitLog.timestampIso ? new Date(hitLog.timestampIso).getTime() : Infinity;

      // 1. Strictly drop all track points occurring after the intercept/destruction moment
      const beforeHitPts = pts.filter((p) => {
        if (!hitLog.timestampIso) return true;
        return new Date(p.time).getTime() <= hitTimeMs;
      });

      // 2. Also drop any duplicate stationary points at the tail
      let cutIndex = beforeHitPts.length;
      for (let i = 1; i < beforeHitPts.length; i++) {
        const prev = beforeHitPts[i - 1];
        const curr = beforeHitPts[i];
        if (Math.abs(curr.lat - prev.lat) < 1e-7 && Math.abs(curr.lon - prev.lon) < 1e-7) {
          cutIndex = i;
          break;
        }
      }
      finalPts = beforeHitPts.slice(0, cutIndex);

      // 3. Ensure the exact intercept point is present at the end of the track
      if (
        hitLog.interceptLat !== undefined &&
        hitLog.interceptLon !== undefined &&
        hitLog.timestampIso
      ) {
        hitPt = {
          lat: hitLog.interceptLat,
          lon: hitLog.interceptLon,
          altFt: hitLog.interceptAltFt ?? (finalPts[finalPts.length - 1]?.altFt ?? 20000),
          time: hitLog.timestampIso,
        };
      } else if (finalPts.length > 0) {
        const last = finalPts[finalPts.length - 1];
        hitPt = {
          lat: last.lat,
          lon: last.lon,
          altFt: last.altFt,
          time: last.time,
        };
      }

      if (hitPt) {
        destructionWaypoints.push({
          targetId,
          lat: hitPt.lat,
          lon: hitPt.lon,
          altFt: hitPt.altFt,
          time: hitPt.time,
          shotId: hitLog.shotId,
        });
      }
    } else {
      finalPts = pts;
    }

    processedTargetTracks.set(targetId, {
      points: finalPts,
      destroyed: isDestroyed,
      hitPoint: hitPt,
    });
  });

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RTAF SAM-1 Simulation System" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>RTAF SAM-1 Aircraft Flight Tracks</name>
    <desc>Tactical aircraft targets recorded at 4 Hz with kinetic destruction terminations and event markers</desc>
    <time>${startTime}</time>
  </metadata>
`;

  // Destruction Event Waypoints (<wpt>) so Tacview triggers impact explosion and despawns target
  for (const wpt of destructionWaypoints) {
    const eleM = (wpt.altFt * 0.3048).toFixed(1);
    gpx += `  <wpt lat="${wpt.lat.toFixed(6)}" lon="${wpt.lon.toFixed(6)}">
    <ele>${eleM}</ele>
    <time>${wpt.time}</time>
    <name>DESTROYED: ${escapeXml(wpt.targetId)}</name>
    <cmt>Aircraft ${escapeXml(wpt.targetId)} destroyed by RTAF SAM-1 missile (${escapeXml(wpt.shotId)})</cmt>
    <desc>Direct kinetic intercept resolution</desc>
    <sym>Destroyed</sym>
    <type>DESTROYED_AIRCRAFT</type>
    <extensions>
      <event>DESTROYED</event>
      <targetId>${escapeXml(wpt.targetId)}</targetId>
      <status>DESTROYED</status>
      <shotId>${escapeXml(wpt.shotId)}</shotId>
    </extensions>
  </wpt>\n`;
  }

  // Aircraft Tracks
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

  gpx += `</gpx>`;
  return gpx;
}

/**
 * Builds GPX 1.1 XML specifically for SAM Battery and Missile Trajectories.
 */
export function generateBatteryMissilesGPX(
  samples: SimulationTelemetrySample[],
  samConfig: SAMConfig
): string {
  const startTime = samples[0]?.timestampIso || new Date().toISOString();
  const baseEleM = (samConfig.baseElevationFt * 0.3048).toFixed(1);

  // Group missile trajectory points
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
    <desc>SAM Base Battery at ${decimalToDDMM(samConfig.baseLat, true)}, ${decimalToDDMM(samConfig.baseLon, false)} and all fired missile trajectories at 4 Hz</desc>
    <time>${startTime}</time>
  </metadata>

  <!-- SAM Site Static Battery Marker -->
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

  // Missile Trajectories
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
 * Exports shot log records to CSV
 */
export function exportShotLogsCSV(logs: ShotLogEntry[]): string {
  const headers = [
    'Shot ID',
    'Local Timestamp',
    'Zulu Timestamp',
    'Target Name',
    'Initial Bearing (°)',
    'Initial Range (NM)',
    'Initial Altitude (ft)',
    'Quality of Shot (Zone)',
    'Result',
    'Time Elapsed (s)',
    'Final Coordinates',
  ];

  const rows = logs.map((l) => [
    l.shotId,
    `"${l.timestampLocal}"`,
    `"${l.timestampZulu}"`,
    l.targetName,
    l.initialBearingDeg.toFixed(1),
    l.initialRangeNM.toFixed(2),
    Math.round(l.initialAltitudeFt),
    `"${l.qualityOfShot}"`,
    l.result,
    l.timeElapsedSec.toFixed(1),
    `"${l.finalCoordinates}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Prompts user browser download of generated text / blob file
 */
export function triggerFileDownload(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
