// ========================================================================================
// ไฟล์: src/utils/geo.ts
// หน้าที่: ฟังก์ชันคำนวณทางภูมิศาสตร์ พิกัด ดาราศาสตร์การบิน และฟิสิกส์ชั้นบรรยากาศ
// คำอธิบาย: รวบรวมสูตร Great-Circle, Haversine, แบริ่ง, Slant Range 3D, การแปลงฟอร์แมตพิกัดทหาร DD° MM.MMM'
//          และการจัดรูปแบบตัวเลขมุมองศา 001-360 องศา
// ========================================================================================

// นำเข้าอินเทอร์เฟซ LatLon จากโมเดลประเภทข้อมูลจำลอง
import { LatLon } from '../types/simulation';

// ค่าคงที่อัตราส่วนฟุตต่อ 1 ไมล์ทะเล (1 Nautical Mile = 6076.11549 feet)
export const FT_PER_NM = 6076.11549;

// ค่าคงที่อัตราส่วนเมตรต่อ 1 ไมล์ทะเล (1 Nautical Mile = 1852 meters)
export const METERS_PER_NM = 1852;

// ความเร็วเสียง ณ ระดับน้ำทะเลตามบรรยากาศมาตรฐานสากล ISA (~661.47 นอต หรือ 340.294 ม./วินาที)
export const SPEED_OF_SOUND_SEA_LEVEL_KTS = 661.47;

// ความเร็วเสียง ณ ระดับน้ำทะเล แปลงเป็นกิโลเมตรต่อชั่วโมง (ประมาณ 1225.04 กม./ชม.)
export const SPEED_OF_SOUND_SEA_LEVEL_KMH = 1225.04;

// อัตราการแปลงความเร็วมัคเป็นไมล์ทะเลต่อวินาที (~0.18374 NM/s)
export const MACH_TO_NM_PER_SEC = SPEED_OF_SOUND_SEA_LEVEL_KTS / 3600;

/**
 * คำนวณความเร็วเสียงเฉพาะพื้นที่ตามระดับความสูงจริง (อิงแบบจำลองบรรยากาศมาตรฐาน ISA)
 * @param altFt ความสูงเหนือระดับน้ำทะเล มีหน่วยเป็นฟุต
 * @returns ความเร็วเสียงท้องถิ่น ณ ความสูงนั้น มีหน่วยเป็นนอต (Knots)
 */
export function getSpeedOfSoundKts(altFt: number): number {
  // บังคับความสูงไม่ให้ติดลบ
  const altClamped = Math.max(0, altFt);
  // คำนวณอุณหภูมิเคลวินตามชั้น Troposphere (ต่ำกว่า 36,089 ฟุต) และชั้น Stratosphere
  const tempK = altClamped <= 36089 ? 288.15 - 0.0019812 * altClamped : 216.65;
  // คำนวณความเร็วเสียงในหน่วยเมตรต่อวินาที (สูตร c = sqrt(gamma * R * T))
  const cMps = Math.sqrt(1.4 * 287.05287 * tempK);
  // แปลงจากเมตรต่อวินาทีเป็นนอต
  return cMps * (3600 / 1852);
}

/**
 * แปลงค่าความเร็วมัค (Mach Number) ให้เป็นความเร็วในหน่วยนอต (Knots)
 * @param mach ค่าความเร็วมัค เช่น 0.85
 * @param altFt ความสูง (ฟุต) เพื่อปรับแก้ตามความหนาแน่นอากาศ หากไม่ระบุจะใช้ระดับน้ำทะเล
 * @returns ความเร็วเป็นนอต
 */
export function machToKnots(mach: number, altFt?: number): number {
  if (altFt !== undefined && altFt > 0) {
    return mach * getSpeedOfSoundKts(altFt);
  }
  return mach * SPEED_OF_SOUND_SEA_LEVEL_KTS;
}

/**
 * แปลงความเร็วจากหน่วยนอต (Knots) เป็นกิโลเมตรต่อชั่วโมง (km/h)
 * @param kts ความเร็วเป็นนอต
 * @returns ความเร็วเป็น กม./ชม.
 */
export function knotsToKmh(kts: number): number {
  return kts * 1.852;
}

/**
 * แปลงพิกัดแบบทศนิยม (Decimal Degrees) เป็นรูปแบบพิกัดมาตรฐานการบินทหาร: DD° MM.MMM' [N/S/E/W]
 * ตัวอย่าง: 13.9125 ละติจูด -> "13° 54.750' N"
 * @param deg พิกัดองศาทศนิยม
 * @param isLatitude จริงถ้าเป็นละติจูด (2 หลัก), เท็จถ้าเป็นลองจิจูด (3 หลัก)
 * @returns ข้อความพิกัดที่ฟอร์แมตแล้ว
 */
export function decimalToDDMM(deg: number, isLatitude: boolean): string {
  // หากค่าพิกัดไม่ใช่ตัวเลข ให้คืนค่ามาตรฐานเริ่มต้น
  if (isNaN(deg)) return isLatitude ? `00° 00.000' N` : `000° 00.000' E`;
  // ระบุซีกโลกเหนือ/ใต้ สำหรับละติจูด หรือ ตะวันออก/ตก สำหรับลองจิจูด
  const hemisphere = isLatitude ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const absDeg = Math.abs(deg);
  // ตัดเฉพาะส่วนองศาเต็ม
  const degrees = Math.floor(absDeg);
  // คำนวณส่วนลิปดา (Minutes) จากทศนิยมที่เหลือคูณ 60
  const minutes = (absDeg - degrees) * 60;
  
  // จัดความกว้างตัวเลของศา: ละติจูด 2 หลัก, ลองจิจูด 3 หลัก
  const degPad = isLatitude ? 2 : 3;
  const degStr = degrees.toString().padStart(degPad, '0');
  const minStr = minutes.toFixed(3).padStart(6, '0');

  return `${degStr}° ${minStr}' ${hemisphere}`;
}

/**
 * แปลงสตริงพิกัดรูปแบบทหาร DD° MM.MMM' หรือสตริงตัวเลขทศนิยม กลับเป็นตัวเลข Decimal Degrees
 * @param input สตริงพิกัดนำเข้า เช่น "13° 54.750' N" หรือ "13.9125"
 * @returns พิกัดตัวเลขทศนิยม หรือ null หากรูปแบบไม่ถูกต้อง
 */
export function parseDDMM(input: string): number | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().toUpperCase();

  // 1. ตรวจสอบว่าผู้ใช้กรอกเป็นตัวเลขทศนิยมโดยตรงหรือไม่
  const directFloat = parseFloat(trimmed);
  if (!isNaN(directFloat) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return directFloat;
  }

  // 2. ตรวจสอบด้วย Regular Expression สำหรับรูปแบบมีสัญลักษณ์องศา เช่น 13° 54.750' N
  const match = trimmed.match(/^([+-]?\d+)[°\sDdeg]+([0-5]?\d(?:\.\d+)?)[′'\sMmin]*\s*([NSEW])?$/i);
  if (match) {
    const deg = parseFloat(match[1]);
    const min = parseFloat(match[2]);
    const hemi = match[3];

    let dec = Math.abs(deg) + min / 60;
    // หากซีกโลกเป็นใต้ (S) หรือตะวันตก (W) ให้ติดลบ
    if (deg < 0 || hemi === 'S' || hemi === 'W') {
      dec = -dec;
    }
    return dec;
  }

  // 3. รองรับรูปแบบที่คั่นด้วยเว้นวรรค เช่น "13 54.750 N"
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
 * คำนวณระยะทางบนผิวโลกวงกลมใหญ่ (Great-Circle Distance) ในหน่วยไมล์ทะเล (NM) ด้วยสูตร Haversine
 * @param lat1 ละติจูดจุดที่ 1
 * @param lon1 ลองจิจูดจุดที่ 1
 * @param lat2 ละติจูดจุดที่ 2
 * @param lon2 ลองจิจูดจุดที่ 2
 * @returns ระยะทางภาคพื้นในหน่วยไมล์ทะเล (NM)
 */
export function getDistanceNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  // รัศมีโลกในหน่วยไมล์ทะเล (~3440.065 NM)
  const R = 3440.065;
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
 * คำนวณมุมแบริ่งจริงเริ่มต้น (True Bearing) จากจุดที่ 1 ไปยังจุดที่ 2
 * @param lat1 ละติจูดจุดตั้งต้น
 * @param lon1 ลองจิจูดจุดตั้งต้น
 * @param lat2 ละติจูดจุดเป้าหมาย
 * @param lon2 ลองจิจูดจุดเป้าหมาย
 * @returns มุมแบริ่งในหน่วยองศา [0, 360)
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
 * ปรับมาตรฐานตัวเลของศาให้อยู่ในช่วง 001 - 360 องศา (แทนที่ 0 องศาด้วย 360 องศา ตามข้อกำหนดการบิน)
 * @param deg ค่ามุมองศาใดๆ
 * @returns ตัวเลของศาจำนวนเต็มช่วง 1 ถึง 360
 */
export function normalizeDegree360(deg: number): number {
  let rounded = Math.round(deg) % 360;
  if (rounded <= 0) rounded += 360;
  return rounded;
}

/**
 * แปลงและจัดรูปแบบมุมองศาให้อยู่ในรูปตัวเลข 3 หลักอย่างเข้มงวด "001" ถึง "360"
 * @param deg ค่ามุมองศา
 * @returns สตริง 3 หลัก เช่น "005", "090", "360"
 */
export function formatDegree360(deg: number): string {
  return normalizeDegree360(deg).toString().padStart(3, '0');
}

/**
 * คำนวณหาพิกัดปลายทาง เมื่อทราบจุดเริ่มต้น มุมทิศทาง และระยะทางไมล์ทะเล (Direct Geodetic Problem)
 * @param startLat ละติจูดจุดเริ่มต้น
 * @param startLon ลองจิจูดจุดเริ่มต้น
 * @param bearingDeg มุมทิศทางแบริ่ง (องศา)
 * @param distanceNM ระยะทางที่เดินทางไป (ไมล์ทะเล)
 * @returns ออบเจกต์พิกัด { lat, lon } ของจุดปลายทาง
 */
export function getDestinationLatLon(
  startLat: number,
  startLon: number,
  bearingDeg: number,
  distanceNM: number
): LatLon {
  const R = 3440.065; // รัศมีโลกในหน่วยไมล์ทะเล
  const delta = distanceNM / R; // ระยะทางเชิงมุม (เรเดียน)
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (startLat * Math.PI) / 180;
  const lambda1 = (startLon * Math.PI) / 180;

  // คำนวณละติจูดปลายทาง
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );

  // คำนวณลองจิจูดปลายทาง
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
 * คำนวณระยะทางเฉียง 3 มิติ (3D Slant Range) โดยนำระยะทางภาคพื้นและความแตกต่างของระดับความสูงมาคำนวณ
 * @param groundRangeNM ระยะทางภาคพื้นผิวโลก (ไมล์ทะเล)
 * @param siteElevationFt ความสูงฐานที่ตั้งเรดาร์ (ฟุต)
 * @param targetAltitudeFt ความสูงเป้าหมายเครื่องบิน (ฟุต)
 * @returns ระยะทางเฉียง 3 มิติในหน่วยไมล์ทะเล (NM)
 */
export function getSlantRangeNM(
  groundRangeNM: number,
  siteElevationFt: number,
  targetAltitudeFt: number
): number {
  // คำนวณผลต่างความสูงในหน่วยฟุต
  const deltaAltFt = targetAltitudeFt - siteElevationFt;
  // แปลงผลต่างความสูงจากฟุตเป็นไมล์ทะเล
  const deltaAltNM = deltaAltFt / FT_PER_NM;
  // คำนวณตามทฤษฎีบทพีทาโกรัส 3 มิติ
  return Math.sqrt(groundRangeNM * groundRangeNM + deltaAltNM * deltaAltNM);
}

/**
 * แปลงค่าความสูงเป็นรูปแบบ Flight Level ตัวเลข 3 หลัก เช่น 25,000 ฟุต -> "FL250"
 * @param altitudeFt ความสูงมีหน่วยเป็นฟุต
 * @returns สตริง Flight Level เช่น "FL050", "FL250"
 */
export function formatFlightLevel(altitudeFt: number): string {
  // Flight Level คำนวณจากความสูงหาร 100
  const fl = Math.round(Math.max(0, altitudeFt) / 100);
  return `FL${fl.toString().padStart(3, '0')}`;
}

/**
 * ฟังก์ชันสำรองเรียกใช้ formatFlightLevel
 */
export function formatAltitudeFL(altFt: number): string {
  return formatFlightLevel(altFt);
}

/**
 * จัดรูปแบบเวลาหน่วยวินาทีให้อยู่ในรูปแบบนาที:วินาที (MM:SS) เช่น 125 วินาที -> "02:05"
 * @param totalSeconds จำนวนวินาทีทั้งหมด
 * @returns ข้อความเวลา "MM:SS"
 */
export function formatMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * จัดรูปแบบมุมแบริ่งและระยะทางเป็นสตริง "BBB/range" เช่น "170/25"
 * @param bearingDeg มุมแบริ่ง
 * @param rangeNM ระยะทางไมล์ทะเล
 * @returns ข้อความ "BBB/range"
 */
export function formatBearingRange(bearingDeg: number, rangeNM: number): string {
  const b = Math.round(((bearingDeg % 360) + 360) % 360).toString().padStart(3, '0');
  const r = Math.round(rangeNM);
  return `${b}/${r}`;
}
