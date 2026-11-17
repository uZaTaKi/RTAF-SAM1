// ========================================================================================
// ไฟล์: src/utils/kmlParser.ts
// หน้าที่: ตัวแยกวิเคราะห์และแปลงไฟล์แผนที่ KML, KMZ หรือ GeoJSON
// คำอธิบาย: แปลงพิกัดทางยุทธวิธี เช่น จุดอ้างอิง เส้นขอบเขต และพื้นที่หวงห้าม ให้เป็น TacticalOverlay เพื่อเรนเดอร์บนจอเรดาร์
// ========================================================================================

// นำเข้าโครงสร้างข้อมูล TacticalOverlay จากโมเดลการจำลอง
import { TacticalOverlay } from '../types/simulation';

/**
 * ฟังก์ชันหลักในการแยกวิเคราะห์เนื้อหาของไฟล์แผนที่ (รองรับทั้ง GeoJSON และ KML XML)
 * @param content ข้อมูลข้อความสตริงที่อ่านได้จากไฟล์
 * @param fileName ชื่อไฟล์ที่อัปโหลด (เช่น 'airspace.kml', 'border.geojson')
 * @returns ออบเจกต์ TacticalOverlay ที่มีรายการฟีเจอร์พิกัดทางภูมิศาสตร์
 */
export function parseOverlayFile(content: string, fileName: string): TacticalOverlay {
  // ตรวจสอบจากนามสกุลไฟล์ว่าจัดอยู่ในรูปแบบ GeoJSON หรือ JSON หรือไม่
  const isJson = fileName.toLowerCase().endsWith('.geojson') || fileName.toLowerCase().endsWith('.json');
  
  // กรณีที่เป็นไฟล์รูปแบบ GeoJSON
  if (isJson) {
    try {
      // แปลงข้อความ JSON ให้เป็น Javascript Object
      const parsed = JSON.parse(content);
      // เตรียมอาร์เรย์สำหรับเก็บฟีเจอร์ทางยุทธวิธี
      const features: TacticalOverlay['features'] = [];

      // รองรับทั้งแบบ FeatureCollection และแบบฟีเจอร์เดี่ยว
      const rawFeatures = parsed.type === 'FeatureCollection' ? parsed.features : [parsed];
      // วนลูปตรวจสอบฟีเจอร์แต่ละตัว
      for (const f of rawFeatures) {
        if (!f || !f.geometry) continue;
        const geom = f.geometry;
        // กรองเฉพาะรูปทรง Point, LineString หรือ Polygon
        if (geom.type === 'Point' || geom.type === 'LineString' || geom.type === 'Polygon') {
          features.push({
            name: f.properties?.name || f.properties?.title || 'Tactical Feature',
            type: geom.type,
            coordinates: geom.coordinates,
            color: f.properties?.stroke || f.properties?.color || '#06B6D4',
          });
        }
      }

      // ส่งคืนชุดข้อมูลเลเยอร์แผนที่ GeoJSON
      return {
        id: `overlay_${Date.now()}`,
        name: fileName,
        type: 'FeatureCollection',
        features,
      };
    } catch (err) {
      console.error('Failed to parse GeoJSON:', err);
    }
  }

  // กรณีที่เป็นไฟล์ XML ของ KML (Google Earth KML)
  try {
    // สร้าง DOMParser เพื่อแปลงข้อความ XML เป็น Document Object
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, 'text/xml');
    const features: TacticalOverlay['features'] = [];

    // ดึงโหนด <Placemark> ทั้งหมดที่อยู่ในเอกสาร KML
    const placemarks = xmlDoc.getElementsByTagName('Placemark');
    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      // ค้นหาแท็ก <name> เพื่อดึงชื่อสถานที่หรือชื่อเส้นทาง
      const nameEl = pm.getElementsByTagName('name')[0];
      const name = nameEl ? nameEl.textContent || `Overlay Element ${i + 1}` : `Overlay Element ${i + 1}`;

      // 1. ตรวจสอบว่ามีรูปทรงแบบพื้นที่หลายเหลี่ยม <Polygon> หรือไม่
      const polygon = pm.getElementsByTagName('Polygon')[0];
      if (polygon) {
        const coordsText = polygon.getElementsByTagName('coordinates')[0]?.textContent || '';
        const coords = parseKMLCoordinates(coordsText);
        if (coords.length > 0) {
          features.push({
            name,
            type: 'Polygon',
            coordinates: [coords], // โครงสร้าง GeoJSON Polygon: อาร์เรย์ของ Linear Rings
            color: '#38BDF8', // สีฟ้าสำหรับการแสดงผลพื้นที่
          });
          continue;
        }
      }

      // 2. ตรวจสอบว่ามีรูปทรงแบบเส้น <LineString> หรือไม่
      const lineString = pm.getElementsByTagName('LineString')[0];
      if (lineString) {
        const coordsText = lineString.getElementsByTagName('coordinates')[0]?.textContent || '';
        const coords = parseKMLCoordinates(coordsText);
        if (coords.length > 0) {
          features.push({
            name,
            type: 'LineString',
            coordinates: coords,
            color: '#F59E0B', // สีส้มอำพันสำหรับเส้นขอบเขต
          });
          continue;
        }
      }

      // 3. ตรวจสอบว่ามีรูปทรงแบบจุด <Point> หรือไม่
      const point = pm.getElementsByTagName('Point')[0];
      if (point) {
        const coordsText = point.getElementsByTagName('coordinates')[0]?.textContent || '';
        const coords = parseKMLCoordinates(coordsText);
        if (coords.length > 0) {
          features.push({
            name,
            type: 'Point',
            coordinates: coords[0],
            color: '#10B981', // สีเขียวสำหรับจุดอ้างอิง
          });
        }
      }
    }

    // ส่งคืนชุดข้อมูลเลเยอร์แผนที่ KML
    return {
      id: `overlay_${Date.now()}`,
      name: fileName,
      type: 'KML',
      features,
    };
  } catch (err) {
    console.error('Failed to parse KML:', err);
    // กรณีเกิดข้อผิดพลาดในการแยกวิเคราะห์ ส่งคืนเลเยอร์เปล่า
    return {
      id: `overlay_${Date.now()}`,
      name: fileName,
      type: 'KML',
      features: [],
    };
  }
}

/**
 * แยกสตริงพิกัดของ KML (รูปแบบ "lon,lat,alt lon,lat,alt ...") ให้กลายเป็นอาร์เรย์พิกัดตัวเลข [lon, lat]
 * @param coordString สตริงพิกัดดิบจากแท็ก <coordinates> ใน KML
 * @returns อาร์เรย์ของคู่พิกัด [ลองจิจูด, ละติจูด]
 */
function parseKMLCoordinates(coordString: string): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  // ตัดช่องว่างและแยกแต่ละจุดพิกัดด้วย whitespace
  const tokens = coordString.trim().split(/\s+/);
  for (const token of tokens) {
    if (!token) continue;
    // แยกส่วนประกอบด้วยเครื่องหมายจุลภาค (ลองจิจูด, ละติจูด, ความสูง)
    const parts = token.split(',');
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      // ตรวจสอบว่าทั้งคู่เป็นตัวเลขที่ถูกต้อง
      if (!isNaN(lon) && !isNaN(lat)) {
        result.push([lon, lat]);
      }
    }
  }
  return result;
}
