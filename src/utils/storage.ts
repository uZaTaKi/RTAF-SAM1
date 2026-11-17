// ========================================================================================
// ไฟล์: src/utils/storage.ts
// หน้าที่: จัดการการบันทึกและอ่านข้อมูลจาก LocalStorage ของเบราว์เซอร์
// คำอธิบาย: เก็บรักษาการตั้งค่าระบบ SAM บันทึกประวัติการยิง และบัฟเฟอร์เทเลเมทรีข้ามเซสชัน
// ========================================================================================

// นำเข้าอินเทอร์เฟซโครงสร้างข้อมูลที่เกี่ยวข้องจาก simulation.ts
import { SAMConfig, ShotLogEntry, SimulationTelemetrySample } from '../types/simulation';

// คีย์หลักสำหรับจัดเก็บการตั้งค่าระบบ SAM ใน localStorage
const CONFIG_KEY = 'rtaf_sam1_config';

// คีย์สำหรับจัดเก็บประวัติตารางการยิงใน localStorage
const SHOT_LOGS_KEY = 'rtaf_sam1_shot_logs';

// คีย์สำหรับจัดเก็บบัฟเฟอร์เทเลเมทรี 10Hz ใน localStorage
const TELEMETRY_BUFFER_KEY = 'rtaf_sam1_telemetry_buffer';

/**
 * บันทึกการตั้งค่าระบบ SAM ลงใน LocalStorage
 * @param config ออบเจกต์การตั้งค่า SAMConfig
 */
export function saveSAMConfigToStorage(config: SAMConfig) {
  try {
    // แปลงออบเจกต์เป็น JSON สตริงแล้วบันทึกลง localStorage
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    // แสดงข้อความเตือนในกรณีที่เนื้อที่ไม่พอหรือเบราว์เซอร์บล็อกการเข้าถึง
    console.warn('Failed to save SAM config to localStorage:', err);
  }
}

/**
 * โหลดการตั้งค่าระบบ SAM จาก LocalStorage
 * @returns ออบเจกต์ SAMConfig หรือ null หากยังไม่มีการบันทึก
 */
export function loadSAMConfigFromStorage(): SAMConfig | null {
  try {
    // ดึงค่าดิบสตริงจาก localStorage ตามคีย์ที่กำหนด
    const raw = localStorage.getItem(CONFIG_KEY);
    // หากพบข้อมูล ให้แปลงจาก JSON สตริงกลับเป็นออบเจกต์
    if (raw) return JSON.parse(raw);
  } catch (err) {
    // แสดงข้อความเตือนเมื่อเกิดข้อผิดพลาดในการแปลงข้อมูล
    console.warn('Failed to load SAM config from localStorage:', err);
  }
  // คืนค่า null กรณีไม่มีข้อมูล
  return null;
}

/**
 * บันทึกประวัติช็อตการยิง (Shot Logs) ลงใน LocalStorage โดยเก็บย้อนหลังสูงสุด 200 รายการ
 * @param logs อาร์เรย์ของบันทึกการยิง
 */
export function saveShotLogsToStorage(logs: ShotLogEntry[]) {
  try {
    // ตัดเอาเฉพาะ 200 รายการล่าสุดเพื่อไม่ให้กินพื้นที่ LocalStorage เกินขีดจำกัด
    localStorage.setItem(SHOT_LOGS_KEY, JSON.stringify(logs.slice(-200)));
  } catch (err) {
    console.warn('Failed to save shot logs to localStorage:', err);
  }
}

/**
 * โหลดประวัติช็อตการยิงจาก LocalStorage
 * @returns อาร์เรย์ของ ShotLogEntry หรืออาร์เรย์ว่างหากไม่มีข้อมูล
 */
export function loadShotLogsFromStorage(): ShotLogEntry[] {
  try {
    const raw = localStorage.getItem(SHOT_LOGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load shot logs from localStorage:', err);
  }
  return [];
}

/**
 * บันทึกตัวอย่างบัฟเฟอร์เทเลเมทรี 10Hz ลงใน LocalStorage (เก็บสูงสุด 15,000 จุด ~ ประมาณ 25 นาที)
 * @param samples อาร์เรย์ของ SimulationTelemetrySample
 */
export function saveTelemetryBufferToStorage(samples: SimulationTelemetrySample[]) {
  try {
    // ตัดเก็บเฉพาะ 15,000 ตัวอย่างล่าสุด
    const slice = samples.slice(-15000);
    localStorage.setItem(TELEMETRY_BUFFER_KEY, JSON.stringify(slice));
  } catch (err) {
    console.warn('Failed to save telemetry buffer to localStorage:', err);
  }
}

/**
 * โหลดบัฟเฟอร์เทเลเมทรีจาก LocalStorage
 * @returns อาร์เรย์ข้อมูลตัวอย่างเทเลเมทรี
 */
export function loadTelemetryBufferFromStorage(): SimulationTelemetrySample[] {
  try {
    const raw = localStorage.getItem(TELEMETRY_BUFFER_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load telemetry buffer from localStorage:', err);
  }
  return [];
}

/**
 * ล้างข้อมูลประวัติช็อตการยิงทั้งหมดออกจาก LocalStorage
 */
export function clearShotLogsFromStorage() {
  try {
    localStorage.removeItem(SHOT_LOGS_KEY);
  } catch (err) {
    console.warn('Failed to clear shot logs:', err);
  }
}

/**
 * ล้างข้อมูลบัฟเฟอร์เทเลเมทรีทั้งหมดออกจาก LocalStorage
 */
export function clearTelemetryBufferFromStorage() {
  try {
    localStorage.removeItem(TELEMETRY_BUFFER_KEY);
  } catch (err) {
    console.warn('Failed to clear telemetry buffer:', err);
  }
}

/**
 * ล้างข้อมูลประวัติการจำลองทั้งหมด (ทั้งช็อตการยิงและบัฟเฟอร์เทเลเมทรี)
 */
export function clearAllHistoryFromStorage() {
  // ล้างตารางบันทึกการยิง
  clearShotLogsFromStorage();
  // ล้างบัฟเฟอร์เทเลเมทรี
  clearTelemetryBufferFromStorage();
}
