// ========================================================================================
// ไฟล์: src/utils/presets.ts
// หน้าที่: กำหนดชุดพรีเซ็ตสำเร็จรูปของระบบขีปนาวุธต่อสู้อากาศยาน (SAM System Presets)
// คำอธิบาย: บันทึกข้อมูลทางเทคนิคของระบบจริง เช่น KS-1C, Spada / Aspide และระบบป้องกันภัยระยะไกล
// ========================================================================================

// นำเข้าโครงสร้างข้อมูล SAMConfig จากโมเดล types
import { SAMConfig } from '../types/simulation';

/**
 * พรีเซ็ตระบบขีปนาวุธป้องกันภัยทางอากาศของกองทัพอากาศไทยและระบบเทียบเคียง
 */
export const SAM_PRESETS: Record<string, SAMConfig> = {
  // 1. ระบบขีปนาวุธต่อสู้อากาศยาน KS-1C (HQ-12) ประจำการ ณ กองบิน 4 ตาคลี
  'ks1c': {
    systemName: 'RTAF KS-1C (HQ-12)',
    baseLat: 15.2917, // พิกัดละติจูด ~15° 17.500' N (บน.4 ตาคลี จ.นครสวรรค์)
    baseLon: 100.2967, // พิกัดลองจิจูด ~100° 17.800' E
    baseElevationFt: 115, // ความสูงฐานที่ตั้งเหนือระดับน้ำทะเล 115 ฟุต
    launcherCount: 4, // กองร้อยมาตรฐานมี 4 แท่นยิง
    missilesPerLauncher: 2, // แต่ละแท่นบรรจุจรวดพร้อมยิง 2 ลูก
    missileSpeedMach: 3.5, // ความเร็วขีปนาวุธ 3.5 มัค (ความเร็วเหนือเสียงขั้นสูง)
    timeOfFlightSec: 55, // เวลาการทำงานของมอเตอร์จรวดสูงสุด 55 วินาที
    launcherReloadTimeSec: 25, // ระยะเวลาโหลดกระเปาะจรวดใหม่ 25 วินาที
    maxSimultaneousEngagements: 4, // สามารถยิงสกัดกั้นเป้าหมายพร้อมกันได้สูงสุด 4 เป้าหมาย
    defaultSpawnAltitudeFt: 25000, // ความสูงเป้าบินจำลองเริ่มต้น 25,000 ฟุต (FL250)
    defaultSpawnSpeedMach: 0.85, // ความเร็วเป้าบินจำลองเริ่มต้น 0.85 มัค
    bullseyeEnabled: false, // ปิดใช้งาน Bullseye เริ่มต้น (ใช้ฐานยิงเป็นจุดอ้างอิง)
    bullseyeLat: 15.2500, // จุดอ้างอิงทางยุทธวิธี Bullseye เริ่มต้น ~15° 15.000' N
    bullseyeLon: 100.3500, // จุดอ้างอิงทางยุทธวิธี Bullseye เริ่มต้น ~100° 21.000' E
    radarRings: [
      // โซนสังหารชั้นในสุด (Inner Kill Zone) รัศมี 5 ไมล์ทะเล สีแดง
      { id: 'ring_1', name: 'Inner Kill Zone (IKZ)', radiusNM: 5, color: '#EF4444', fillAlpha: 0.15 },
      // โซนสกัดกั้นที่เป้าหมายไม่สามารถบินหลบหนีได้ (No-Escape Zone) รัศมี 18 ไมล์ทะเล สีส้ม
      { id: 'ring_2', name: 'No-Escape Zone (NEZ)', radiusNM: 18, color: '#F97316', fillAlpha: 0.10 },
      // ระยะยิงหวังผลสูงสุดตามจลนศาสตร์ (Max Effective Range) รัศมี 30 ไมล์ทะเล สีเหลือง
      { id: 'ring_3', name: 'Max Effective Range (Rmax)', radiusNM: 30, color: '#EAB308', fillAlpha: 0.08 },
      // ขอบเขตการติดตามเตรียมยิง (Engagement Envelope) รัศมี 42 ไมล์ทะเล สีฟ้าคราม
      { id: 'ring_4', name: 'Engagement Envelope', radiusNM: 42, color: '#06B6D4', fillAlpha: 0.05 },
      // ขอบเขตเรดาร์ตรวจจับและชี้เป้าหลัก (Acquisition & Tracking Radar) รัศมี 60 ไมล์ทะเล สีน้ำเงิน
      { id: 'ring_5', name: 'Acquisition & Tracking Radar', radiusNM: 60, color: '#3B82F6', fillAlpha: 0.03 },
    ],
  },

  // 2. ระบบขีปนาวุธป้องกันฐานบินระยะปานกลาง-ใกล้ Spada / Aspide-2000 ประจำการ ณ กองบิน 6 ดอนเมือง
  'spada': {
    systemName: 'RTAF Spada / Aspide-2000',
    baseLat: 13.9125, // พิกัดละติจูด 13° 54.750' N (บน.6 ดอนเมือง)
    baseLon: 100.6042, // พิกัดลองจิจูด 100° 36.250' E
    baseElevationFt: 14, // ความสูงฐานที่ตั้งเหนือระดับน้ำทะเล 14 ฟุต
    launcherCount: 2, // มี 2 แท่นยิง
    missilesPerLauncher: 6, // บรรจุแท่นละ 6 ท่อยิง
    missileSpeedMach: 2.5, // ความเร็วจรวด 2.5 มัค
    timeOfFlightSec: 35, // เวลาบินทำงาน 35 วินาที
    launcherReloadTimeSec: 20, // เวลาโหลดจรวดใหม่ 20 วินาที
    maxSimultaneousEngagements: 2, // สกัดกั้นพร้อมกันได้ 2 เป้า
    defaultSpawnAltitudeFt: 15000, // ความสูงเป้าบินเริ่มต้น 15,000 ฟุต (FL150)
    defaultSpawnSpeedMach: 0.75, // ความเร็วเป้าบินเริ่มต้น 0.75 มัค
    bullseyeEnabled: false,
    bullseyeLat: 13.8500,
    bullseyeLon: 100.6500,
    radarRings: [
      { id: 'ring_1', name: 'Minimum Range', radiusNM: 2, color: '#EF4444', fillAlpha: 0.15 },
      { id: 'ring_2', name: 'Optimum Intercept', radiusNM: 8, color: '#F97316', fillAlpha: 0.10 },
      { id: 'ring_3', name: 'Max Intercept Range', radiusNM: 14, color: '#EAB308', fillAlpha: 0.08 },
      { id: 'ring_4', name: 'Pluto Target Acquisition', radiusNM: 25, color: '#06B6D4', fillAlpha: 0.04 },
    ],
  },

  // 3. ระบบจำลองการป้องกันภัยทางอากาศระยะไกลระดับภูมิภาค (Long-Range Area Defense) ฐานบินโคราช
  'long_range': {
    systemName: 'RTAF Long-Range Area Defense',
    baseLat: 14.9700, // พิกัดละติจูด กองบิน 1 นครราชสีมา (โคราช)
    baseLon: 102.0800, // พิกัดลองจิจูด
    baseElevationFt: 610, // ความสูงฐานที่ตั้งเหนือระดับน้ำทะเล 610 ฟุต
    launcherCount: 6, // 6 แท่นยิงขนาดใหญ่
    missilesPerLauncher: 4, // บรรจุแท่นละ 4 ท่อยิง
    missileSpeedMach: 4.5, // ขีปนาวุธไฮเปอร์โซนิก/ซูเปอร์โซนิกสูง 4.5 มัค
    timeOfFlightSec: 85, // บินได้นาน 85 วินาที
    launcherReloadTimeSec: 30, // เวลาโหลดจรวด 30 วินาที
    maxSimultaneousEngagements: 6, // สกัดกั้นพร้อมกันได้ 6 เป้า
    defaultSpawnAltitudeFt: 30000, // ความสูงเป้าบินเริ่มต้น 30,000 ฟุต (FL300)
    defaultSpawnSpeedMach: 0.90, // ความเร็วเป้าบินเริ่มต้น 0.90 มัค
    bullseyeEnabled: false,
    bullseyeLat: 14.9000,
    bullseyeLon: 102.1500,
    radarRings: [
      { id: 'ring_1', name: 'Point Defense Zone', radiusNM: 10, color: '#EF4444', fillAlpha: 0.15 },
      { id: 'ring_2', name: 'No-Escape Zone', radiusNM: 35, color: '#F97316', fillAlpha: 0.10 },
      { id: 'ring_3', name: 'Medium Intercept', radiusNM: 65, color: '#EAB308', fillAlpha: 0.08 },
      { id: 'ring_4', name: 'Max Kinetic Range', radiusNM: 95, color: '#06B6D4', fillAlpha: 0.05 },
      { id: 'ring_5', name: 'Early Warning & Sector Search', radiusNM: 140, color: '#3B82F6', fillAlpha: 0.03 },
    ],
  },
};

/**
 * การตั้งค่ามาตรฐานเริ่มต้นของระบบเมื่อเปิดใช้งานโปรแกรมครั้งแรก (ใช้พรีเซ็ต KS-1C)
 */
export const DEFAULT_SAM_CONFIG = SAM_PRESETS['ks1c'];
