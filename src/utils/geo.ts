import { LatLon } from '../types/simulation';

// Constants
export const FT_PER_NM = 6076.11549; // 1 Nautical Mile = 6076.11549 feet
export const METERS_PER_NM = 1852;
export const MACH_TO_NM_PER_SEC = 0.18374; // Standard speed of sound: ~661.47 kts / 3600 = ~0.18374 NM/s

/**
 * Converts decimal degrees to military aviation format: DD° MM.MMM' [N/S/E/W]
 */
export function decimalToDDMM(deg: number, isLatitude: boolean): string {
  if (isNaN(deg)) return isLatitude ? `00° 00.000' N` : `000° 00.000' E`;
  const hemisphere = isLatitude ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const absDeg = Math.abs(deg);
  const degrees = Math.floor(absDeg);
  const minutes = (absDeg - degrees) * 60;
  
  const degPad = isLatitude ? 2 : 3;
  const degStr = degrees.toString().padStart(degPad, '0');
  const minStr = minutes.toFixed(3).padStart(6, '0');

  return `${degStr}° ${minStr}' ${hemisphere}`;
}

/**
 * Parses DD° MM.MMM' [N/S/E/W] or decimal degrees string into decimal degrees number
 */
export function parseDDMM(input: string): number | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().toUpperCase();

  // Check if already decimal number
  const directFloat = parseFloat(trimmed);
  if (!isNaN(directFloat) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return directFloat;
  }

  // Regular expression matching:
  // e.g. 13° 54.750' N or 13 54.750 N or 13d 54.75m N
  const match = trimmed.match(/^([+-]?\d+)[°\sDdeg]+([0-5]?\d(?:\.\d+)?)[′'\sMmin]*\s*([NSEW])?$/i);
  if (match) {
    const deg = parseFloat(match[1]);
    const min = parseFloat(match[2]);
    const hemi = match[3];

    let dec = Math.abs(deg) + min / 60;
    if (deg < 0 || hemi === 'S' || hemi === 'W') {
      dec = -dec;
    }
    return dec;
  }

  // Fallback for simple space-separated e.g. "13 54.750"
  const parts = trimmed.split(/[\s,]+/);
  if (parts.length >= 2) {
    const deg = parseFloat(parts[0]);
    const min = parseFloat(parts[1]);
    if (!isNaN(deg) && !isNaN(min)) {
      const hemi = parts[2] || '';
      let dec = Math.abs(deg) + min / 60;
      if (deg < 0 || hemi === 'S' || hemi === 'W') {
        dec = -dec;
      }
      return dec;
    }
  }

  return null;
}

/**
 * Calculates Great-Circle distance in Nautical Miles using Haversine formula
 */
export function getDistanceNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in Nautical Miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates initial true bearing from (lat1, lon1) to (lat2, lon2) in degrees [0, 360)
 */
export function getBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  const deg = (theta * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Calculates destination point given start point, bearing in degrees, and distance in Nautical Miles
 */
export function getDestinationLatLon(
  startLat: number,
  startLon: number,
  bearingDeg: number,
  distanceNM: number
): LatLon {
  const R = 3440.065; // Earth radius in NM
  const delta = distanceNM / R;
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (startLat * Math.PI) / 180;
  const lambda1 = (startLon * Math.PI) / 180;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );

  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  return {
    lat: (phi2 * 180) / Math.PI,
    lon: (lambda2 * 180) / Math.PI,
  };
}

/**
 * Calculates 3D Slant Range (NM) taking ground distance and elevation difference into account
 */
export function getSlantRangeNM(
  groundRangeNM: number,
  siteElevationFt: number,
  targetAltitudeFt: number
): number {
  const deltaAltFt = targetAltitudeFt - siteElevationFt;
  const deltaAltNM = deltaAltFt / FT_PER_NM;
  return Math.sqrt(groundRangeNM * groundRangeNM + deltaAltNM * deltaAltNM);
}

/**
 * Formats altitude in hundreds of feet (e.g. FL250 or 25,000 ft)
 */
export function formatAltitudeFL(altFt: number): string {
  const hundreds = Math.round(altFt / 100);
  if (altFt >= 18000) {
    return `FL${hundreds.toString().padStart(3, '0')}`;
  }
  return `${(hundreds * 100).toLocaleString()} ft`;
}

/**
 * Formats seconds into MM:SS format (e.g. 125s -> "02:05")
 */
export function formatMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats Bearing and Range as "BBB/range", e.g. "170/25"
 */
export function formatBearingRange(bearingDeg: number, rangeNM: number): string {
  const b = Math.round(((bearingDeg % 360) + 360) % 360).toString().padStart(3, '0');
  const r = Math.round(rangeNM);
  return `${b}/${r}`;
}

/**
 * Formats altitude as Flight Level (e.g. 24,000 ft -> "FL24")
 */
export function formatFlightLevel(altitudeFt: number): string {
  const fl = Math.round(altitudeFt / 1000);
  return `FL${fl}`;
}


