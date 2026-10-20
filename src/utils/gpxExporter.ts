import { SimulationTelemetrySample, ShotLogEntry, SAMConfig } from '../types/simulation';
import { decimalToDDMM, parseDDMM, formatFlightLevel } from './geo';

/**
 * Builds GPX 1.1 XML specifically for Aircraft Targets.
 * Fixes target persistence issue:
 * Once an aircraft target is destroyed (HIT), all further coordinates are truncated,
 * the track terminates immediately at the intercept point, and an Event Marker (<wpt>)
 * is injected to enable Tacview/ACMI to display the destruction explosion and remove the icon.
 */
interface ProcessedTargetTrack {
  points: Array<{ time: string; lat: number; lon: number; altFt: number; hdg: number; spd: number }>;
  destroyed: boolean;
}

/**
 * Accurately processes raw aircraft telemetry samples:
 * - Preserves all flight points across parameter adjustments (heading, alt, speed) and map drags.
 * - If intercepted by a SAM missile (HIT), smoothly terminates the track at the exact intercept coordinates
 *   and intercept time without duplicate or inverted timestamps.
 * - Does not inject extra <wpt> markers (as per user specifications).
 */
function processAircraftTargetTracks(
  samples: SimulationTelemetrySample[],
  shotLogs: ShotLogEntry[]
): Map<string, ProcessedTargetTrack> {
  // 1. Group raw aircraft points by target ID
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

  const processedTargetTracks = new Map<string, ProcessedTargetTrack>();

  rawTargetPoints.forEach((pts, targetId) => {
    if (pts.length === 0) return;

    const trackStartMs = new Date(pts[0].time).getTime();

    // Find the latest HIT log that genuinely corresponds to this target session:
    // It must match targetName === targetId, result === 'HIT',
    // and hit time must be >= trackStartMs - 2000 (not an obsolete hit from an old run).
    const hitLog = shotLogs.find((l) => {
      if (l.targetName !== targetId || l.result !== 'HIT') return false;
      const hitIso = l.interceptTimestampIso || l.timestampIso;
      if (!hitIso) return false;
      const hitMs = new Date(hitIso).getTime();
      return hitMs >= trackStartMs - 2000;
    });

    let finalPts = pts;
    let isDestroyed = false;

    if (hitLog) {
      isDestroyed = true;
      const hitIso = hitLog.interceptTimestampIso || hitLog.timestampIso || pts[pts.length - 1].time;
      const hitTimeMs = new Date(hitIso).getTime();

      // Keep all track points recorded up to the intercept moment
      finalPts = pts.filter((p) => new Date(p.time).getTime() <= hitTimeMs);

      // Ensure the exact intercept point is present at the end of the track
      // with strictly monotonic timestamps (no duplicates)
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

          if (Math.abs(lastPtTimeMs - hitTimeMs) < 150) {
            // Update last point to exact intercept coordinates
            lastPt.lat = hitLog.interceptLat;
            lastPt.lon = hitLog.interceptLon;
            if (hitLog.interceptAltFt !== undefined) lastPt.altFt = hitLog.interceptAltFt;
          } else if (lastPtTimeMs < hitTimeMs) {
            // Append the intercept point strictly after the last point
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

    processedTargetTracks.set(targetId, {
      points: finalPts,
      destroyed: isDestroyed,
    });
  });

  return processedTargetTracks;
}

export function generateAircraftGPX(
  samples: SimulationTelemetrySample[],
  shotLogs: ShotLogEntry[]
): string {
  const startTime = samples[0]?.timestampIso || new Date().toISOString();
  const processedTargetTracks = processAircraftTargetTracks(samples, shotLogs);

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RTAF SAM-1 Simulation System" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>RTAF SAM-1 Aircraft Flight Tracks</name>
    <desc>Tactical aircraft targets recorded at 10 Hz with kinetic destruction terminations</desc>
    <time>${startTime}</time>
  </metadata>
`;

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
 * Builds standard unified GPX 1.1 XML combining:
 * 1. SAM Base Battery Waypoint
 * 2. Aircraft Destruction Event Waypoints (<wpt>)
 * 3. Aircraft Flight Tracks (<trk> with kinetic cutoff at intercept)
 * 4. Surface-to-Air Missile Trajectories (<trk>)
 */
export function generateUnifiedGPX(
  samples: SimulationTelemetrySample[],
  shotLogs: ShotLogEntry[],
  samConfig: SAMConfig
): string {
  const startTime = samples[0]?.timestampIso || new Date().toISOString();
  const baseEleM = (samConfig.baseElevationFt * 0.3048).toFixed(1);

  // 1 & 2. Process aircraft points: truncate at destruction time without duplicates
  const processedTargetTracks = processAircraftTargetTracks(samples, shotLogs);

  // 3. Group missile trajectories
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

  // 4. Build GPX XML
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RTAF SAM-1 Simulation System" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>RTAF SAM-1 Unified Air Defense Telemetry</name>
    <desc>Tactical air defense simulation at 4 Hz containing SAM Base, Aircraft Targets, and Missile Engagements</desc>
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

  const rows = logs.map((l) => {
    const initBbb = Math.round(((l.initialBearingDeg % 360) + 360) % 360).toString().padStart(3, '0');
    const initRng = Math.round(l.initialRangeNM).toString();
    const initFl = formatFlightLevel(l.initialAltitudeFt);
    const initBrgRngFl = `${initBbb}/${initRng}/${initFl}`;

    const bbb = l.finalBearingDeg !== undefined ? Math.round(((l.finalBearingDeg % 360) + 360) % 360).toString().padStart(3, '0') : '-';
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
