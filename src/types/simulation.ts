// ========================================================================================
// ไฟล์: src/types/simulation.ts
// หน้าที่: กำหนด Data Types และ TypeScript Interfaces ทั้งหมดที่ใช้งานในระบบจำลอง SAM
// คำอธิบาย: รวบรวมโครงสร้างข้อมูล พิกัดทางภูมิศาสตร์ แท่นยิง จรวด เป้าหมายการบิน บันทึกการยิง และข้อมูลส่งออก GPX
// ========================================================================================

/**
 * โครงสร้างพิกัดทางภูมิศาสตร์ ละติจูด/ลองจิจูด (Decimal Degrees)
 */
export interface LatLon {
  /** ละติจูด (องศาทศนิยม ค่าบวกคือทิศเหนือ N, ค่าลบคือทิศใต้ S) */
  lat: number;
  /** ลองจิจูด (องศาทศนิยม ค่าบวกคือทิศตะวันออก E, ค่าลบคือทิศตะวันตก W) */
  lon: number;
}

/**
 * โครงสร้างข้อมูลวงแหวนเรดาร์และระยะตรวจจับ/ยิง (Radar Range Rings)
 */
export interface RadarRing {
  /** รหัสเฉพาะประจำวงแหวน เช่น 'ring_1', 'ring_2' */
  id: string;
  /** ชื่อเรียกของวงแหวน เช่น 'Inner Kill Zone', 'No-Escape Zone' */
  name: string;
  /** รัศมีของวงแหวน มีหน่วยเป็นไมล์ทะเล (Nautical Miles: NM) */
  radiusNM: number;
  /** รหัสสี HEX หรือ Tailwind color สำหรับวาดเส้นวงกลมบนจอเรดาร์ เช่น '#EF4444' */
  color: string;
  /** ค่าความโปร่งแสงของสีพื้นหลังวงแหวน (Alpha: 0.0 ถึง 1.0) */
  fillAlpha: number;
}

/**
 * สถานะของแท่นยิงจรวดแต่ละแท่น (Launcher Unit State)
 */
export interface LauncherState {
  /** หมายเลขประจำแท่นยิง (เริ่มจาก 1 ถึง N) */
  id: number;
  /** จำนวนลูกจรวดที่ยังคงเหลือพร้อมยิงบนแท่นนี้ */
  missilesRemaining: number;
  /** ขีดความสามารถบรรจุจรวดสูงสุดของแท่นนี้ (เช่น 2, 4 หรือ 6 ลูก) */
  maxMissiles: number;
  /** ระยะเวลาที่ต้องใช้ในการบรรจุจรวดชุดใหม่ มีหน่วยเป็นวินาที */
  reloadTimeSec: number;
  /** เวลานับถอยหลังในการบรรจุจรวดที่เหลืออยู่ (0 วินาที = พร้อมยิง) */
  reloadRemainingSec: number;
  /** สถานะระบุว่าแท่นยิงนี้กำลังอยู่ระหว่างบรรจุจรวดใหม่หรือไม่ (true/false) */
  isReloading: boolean;
}

/**
 * ค่าปรับตั้งค่าระบบป้องกันภัยทางอากาศ SAM (System Parameters Configuration)
 */
export interface SAMConfig {
  /** ชื่อระบบ เช่น 'RTAF KS-1C (HQ-12)', 'RTAF Spada / Aspide-2000' */
  systemName: string;
  /** พิกัดละติจูดของฐานยิง SAM (Decimal Degrees) */
  baseLat: number;
  /** พิกัดลองจิจูดของฐานยิง SAM (Decimal Degrees) */
  baseLon: number;
  /** ความสูงเหนือระดับน้ำทะเลของฐานยิง มีหน่วยเป็นฟุต (Elevation in Feet) */
  baseElevationFt: number;
  /** จำนวนแท่นยิงทั้งหมดในกองร้อย/ระบบ */
  launcherCount: number;
  /** จำนวนจรวดต่อ 1 แท่นยิง */
  missilesPerLauncher: number;
  /** ความเร็วในการบินของลูกจรวด มีหน่วยเป็นมัค (Mach number) */
  missileSpeedMach: number;
  /** ระยะเวลาการทำงานสูงสุดของจรวดก่อนหมดเชื้อเพลิง (Time of Flight in Seconds) */
  timeOfFlightSec: number;
  /** ระยะเวลาในการโหลดลูกจรวดใหม่ของแต่ละแท่นยิง (วินาที) */
  launcherReloadTimeSec: number;
  /** จำนวนเป้าหมายสูงสุดที่สามารถทำการยิงสกัดกั้นพร้อมกันได้ (Max Simultaneous Engagements) */
  maxSimultaneousEngagements: number;
  /** รายการวงแหวนแสดงระยะเรดาร์และโซนการยิง */
  radarRings: RadarRing[];
  /** ค่าความสูงเริ่มต้นเมื่อสร้างเป้าหมายจำลองขึ้นมาใหม่ (ฟุต) */
  defaultSpawnAltitudeFt: number;
  /** ค่าความเร็วเริ่มต้นเมื่อสร้างเป้าหมายจำลองขึ้นมาใหม่ (มัค) */
  defaultSpawnSpeedMach: number;
  /** สวิตช์เปิด/ปิดการใช้งานจุดอ้างอิงทางยุทธวิธี Bullseye (B.E.) */
  bullseyeEnabled?: boolean;
  /** พิกัดละติจูดของจุด Bullseye (Decimal Degrees) */
  bullseyeLat?: number;
  /** พิกัดลองจิจูดของจุด Bullseye (Decimal Degrees) */
  bullseyeLon?: number;
}

/**
 * โครงสร้างข้อมูลเป้าหมายเครื่องบิน (Aircraft Target)
 */
export interface AircraftTarget {
  /** รหัสประจำเครื่องบิน เช่น 'T1', 'T2' */
  id: string;
  /** พิกัดละติจูดปัจจุบันของเครื่องบิน (Decimal Degrees) */
  lat: number;
  /** พิกัดลองจิจูดปัจจุบันของเครื่องบิน (Decimal Degrees) */
  lon: number;
  /** ความสูงปัจจุบันของเครื่องบิน มีหน่วยเป็นฟุต (เช่น 25,000 ฟุต = FL250) */
  altitudeFt: number;
  /** ทิศทางการบินจริง (True Heading) นับจากทิศเหนือตามเข็มนาฬิกา (001 - 360 องศา) */
  headingDeg: number;
  /** ความเร็วปัจจุบันของเครื่องบิน มีหน่วยเป็นมัค (Mach Number เช่น 0.85) */
  speedMach: number;
  /** สถานะระบุว่าเครื่องบินลำนี้กำลังถูกคลิกเลือกอยู่บนจอเรดาร์หรือไม่ */
  selected?: boolean;
  /** สถานะระบุว่าเครื่องบินลำนี้ถูกจรวดล็อคเป้าหรือกำลังถูกยิงสกัดกั้นอยู่หรือไม่ */
  isEngaged?: boolean;
  /** เวลา Timestamp ขณะที่สร้างเป้าบินนี้ขึ้นมา (มิลลิวินาที) */
  spawnTimeMs: number;
}

/**
 * โครงสร้างข้อมูลลูกจรวดที่กำลังบินอยู่ (Active Missile)
 */
export interface ActiveMissile {
  /** รหัสประจำลูกจรวด เช่น 'M1', 'M2' */
  id: string;
  /** หมายเลขแท่นยิงที่เป็นผู้ยิงจรวดลูกนี้ออกมา */
  launcherId: number;
  /** รหัสเป้าหมายที่จรวดลูกนี้กำลังติดตามไปสกัดกั้น เช่น 'T1' */
  targetId: string;
  /** พิกัดละติจูดเริ่มต้นของจุดยิง */
  startLat: number;
  /** พิกัดลองจิจูดเริ่มต้นของจุดยิง */
  startLon: number;
  /** ความสูงเริ่มต้นของจุดยิง (ฟุต) */
  startAltFt: number;
  /** พิกัดละติจูดปัจจุบันของหัวจรวด */
  currentLat: number;
  /** พิกัดลองจิจูดปัจจุบันของหัวจรวด */
  currentLon: number;
  /** ความสูงปัจจุบันของหัวจรวด (ฟุต) */
  currentAltFt: number;
  /** มุมแบริ่งจากแท่นยิงไปยังเป้าบินขณะกดปุ่มยิง (องศา) */
  initialBearingDeg: number;
  /** ระยะทางภาคพื้นจากแท่นยิงไปยังเป้าขณะเริ่มยิง (ไมล์ทะเล NM) */
  initialRangeNM: number;
  /** ระยะทางเฉียง 3 มิติ (Slant Range) จากแท่นยิงไปยังเป้าขณะเริ่มยิง (ไมล์ทะเล NM) */
  initialSlantRangeNM: number;
  /** ชื่อโซนการยิงขณะปล่อยจรวด เช่น 'No-Escape Zone' */
  initialZoneName: string;
  /** เวลาบินที่เหลืออยู่ของจรวดลูกนี้ (วินาที) */
  timeOfFlightRemainingSec: number;
  /** เวลาบินรวมสูงสุดของจรวดลูกนี้ (วินาที) */
  totalTimeOfFlightSec: number;
  /** เวลาที่จรวดลูกนี้บินไปแล้วนับตั้งแต่ปล่อยตัว (วินาที) */
  elapsedSec: number;
  /** ความเร็วการบินของจรวด (มัค) */
  speedMach: number;
  /** สถานะของจรวด: IN_FLIGHT=กำลังบิน, HIT=ชนเป้าหมายสำเร็จ, MISS=พลาดเป้า/หมดเวลา, TERMINATE=ทำลายตัวเอง */
  status: 'IN_FLIGHT' | 'HIT' | 'MISS' | 'TERMINATE';
  /** ประวัติเส้นทางบินของจรวด (ตำแหน่งและความสูง ณ เวลาต่างๆ) ใช้สำหรับวาดเส้นวิถีและส่งออก GPX */
  flightPath: Array<{ lat: number; lon: number; altFt: number; timestamp: number }>;
}

/**
 * โครงสร้างเอฟเฟกต์ภาพแสดงผลบนจอเรดาร์ (Visual Effects เช่น ระเบิด ชนเป้า ยุติการยิง)
 */
export interface VisualEffect {
  /** รหัสเฉพาะของเอฟเฟกต์ */
  id: string;
  /** พิกัดละติจูดของจุดเกิดเอฟเฟกต์ */
  lat: number;
  /** พิกัดลองจิจูดของจุดเกิดเอฟเฟกต์ */
  lon: number;
  /** ประเภทเอฟเฟกต์: HIT=ระเบิดโดนเป้า, MISS=ระเบิดพลาดเป้า, TERMINATE=กากบาททำลายจรวด */
  type: 'HIT' | 'MISS' | 'TERMINATE';
  /** เวลา Timestamp ที่เกิดเหตุการณ์ (มิลลิวินาที) */
  timestamp: number;
  /** ระยะเวลาแสดงแอนิเมชันเอฟเฟกต์ (มิลลิวินาที) */
  durationMs: number;
  /** สีหลักของเอฟเฟกต์ */
  color: string;
}

/**
 * โครงสร้างข้อมูลตารางบันทึกประวัติการยิง (Shot Log Entry)
 */
export interface ShotLogEntry {
  /** ลำดับและรหัสการยิง เช่น '#S1', '#S2' */
  shotId: string;
  /** เวลาท้องถิ่น ณ จุดยิง รูปแบบ HH:MM:SS */
  timestampLocal: string;
  /** เวลาสากลซูลู ณ จุดยิง รูปแบบ HH:MM:SSZ */
  timestampZulu: string;
  /** เวลามาตรฐาน ISO ของการยิง เช่น '2026-11-04T14:30:00.000Z' */
  timestampIso?: string;
  /** ชื่อหรือรหัสเป้าหมายที่ถูกยิง เช่น 'T1' */
  targetName: string;
  /** มุมแบริ่งเริ่มต้นไปยังเป้าหมาย (องศา) */
  initialBearingDeg: number;
  /** ระยะทางเริ่มต้นไปยังเป้าหมาย (ไมล์ทะเล NM) */
  initialRangeNM: number;
  /** ความสูงเริ่มต้นของเป้าหมาย (ฟุต) */
  initialAltitudeFt: number;
  /** ละติจูดเริ่มต้นของเป้าหมาย */
  initialLat?: number;
  /** ลองจิจูดเริ่มต้นของเป้าหมาย */
  initialLon?: number;
  /** พิกัดเริ่มต้นรูปแบบทหาร DD° MM.MMM' N/E */
  initialCoordinates?: string;
  /** คุณภาพของช็อตการยิง (Quality of Shot) อ้างอิงตามวงแหวนเรดาร์ขณะปล่อยจรวด */
  qualityOfShot: string;
  /** ผลลัพธ์สุดท้ายของการยิง: IN_FLIGHT, HIT, MISS หรือ TERMINATE */
  result: 'IN_FLIGHT' | 'HIT' | 'MISS' | 'TERMINATE';
  /** ระยะเวลาตั้งแต่ยิงจนถึงจุดสิ้นสุด (วินาที) */
  timeElapsedSec: number;
  /** พิกัดสุดท้ายเมื่อสิ้นสุดผลการยิง (รูปแบบ DD° MM.MMM') */
  finalCoordinates: string;
  /** รหัสจรวดที่ทำการยิง */
  missileId: string;
  /** ละติจูดจุดสกัดกั้น/จุดระเบิด */
  interceptLat?: number;
  /** ลองจิจูดจุดสกัดกั้น/จุดระเบิด */
  interceptLon?: number;
  /** ความสูง ณ จุดสกัดกั้น (ฟุต) */
  interceptAltFt?: number;
  /** ความสูงสุดท้ายของเป้าหมาย (ฟุต) */
  finalAltitudeFt?: number;
  /** มุมแบริ่งสุดท้ายจากฐานยิงไปยังจุดสกัดกั้น */
  finalBearingDeg?: number;
  /** ระยะทางสุดท้ายจากฐานยิงไปยังจุดสกัดกั้น (NM) */
  finalRangeNM?: number;
  /** เวลาท้องถิ่นที่สิ้นสุดผลการยิง (Local Time) */
  resultTimeLocal?: string;
  /** เวลาซูลูที่สิ้นสุดผลการยิง (Zulu Time) */
  resultTimeZulu?: string;
  /** เวลามาตรฐาน ISO เมื่อเกิดการสกัดกั้น (ใช้สำหรับซิงค์กับ GPX) */
  interceptTimestampIso?: string;
}

/**
 * ข้อมูลชั้นข้อมูลแผนที่ทางยุทธวิธีที่นำเข้าจาก KML / KMZ / GeoJSON
 */
export interface TacticalOverlay {
  /** รหัสเฉพาะของเลเยอร์แผนที่ */
  id: string;
  /** ชื่อไฟล์หรือชื่อชุดข้อมูลแผนที่ */
  name: string;
  /** รูปแบบโครงสร้างข้อมูล ('FeatureCollection' หรือ 'KML') */
  type: 'FeatureCollection' | 'KML';
  /** รายการฟีเจอร์พิกัดทางภูมิศาสตร์ (จุด, เส้น, พื้นที่หลายเหลี่ยม) */
  features: Array<{
    /** ชื่อของฟีเจอร์ย่อย */
    name?: string;
    /** ประเภทรูปทรงเรขาคณิต */
    type: 'Point' | 'LineString' | 'Polygon';
    /** พิกัดข้อมูลตามมาตรฐาน GeoJSON */
    coordinates: any;
    /** สีของเส้นหรือสัญลักษณ์ */
    color?: string;
  }>;
}

/**
 * ข้อมูลตัวอย่างเทเลเมทรีของการจำลองที่บันทึกด้วยความถี่ 10Hz (Simulation Telemetry Sample)
 * ใช้สำหรับประมวลผลและส่งออกไฟล์ GPX มาตรฐานสำหรับการเปิดใน Tacview / ACMI
 */
export interface SimulationTelemetrySample {
  /** เวลามาตรฐาน ISO 8601 ณ ขณะบันทึกตัวอย่าง */
  timestampIso: string;
  /** เวลาที่ผ่านไปนับจากเริ่มการจำลอง (มิลลิวินาที) */
  elapsedMs: number;
  /** พิกัดและความสูงของฐานที่ตั้งระบบ SAM */
  samSite: {
    lat: number;
    lon: number;
    elevationFt: number;
  };
  /** รายการสถานะเป้าหมายเครื่องบินทุกลำ ณ เสี้ยววินาทีนี้ */
  targets: Array<{
    id: string;
    lat: number;
    lon: number;
    altitudeFt: number;
    headingDeg: number;
    speedMach: number;
  }>;
  /** รายการสถานะลูกจรวดทุกลูก ณ เสี้ยววินาทีนี้ */
  missiles: Array<{
    id: string;
    targetId: string;
    lat: number;
    lon: number;
    altitudeFt: number;
    status: string;
  }>;
}
