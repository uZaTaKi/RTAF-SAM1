import { TacticalOverlay } from '../types/simulation';

/**
 * Parses KML XML text or GeoJSON text into structured TacticalOverlay features
 */
export function parseOverlayFile(content: string, fileName: string): TacticalOverlay {
  const isJson = fileName.toLowerCase().endsWith('.geojson') || fileName.toLowerCase().endsWith('.json');
  
  if (isJson) {
    try {
      const parsed = JSON.parse(content);
      const features: TacticalOverlay['features'] = [];

      const rawFeatures = parsed.type === 'FeatureCollection' ? parsed.features : [parsed];
      for (const f of rawFeatures) {
        if (!f || !f.geometry) continue;
        const geom = f.geometry;
        if (geom.type === 'Point' || geom.type === 'LineString' || geom.type === 'Polygon') {
          features.push({
            name: f.properties?.name || f.properties?.title || 'Tactical Feature',
            type: geom.type,
            coordinates: geom.coordinates,
            color: f.properties?.stroke || f.properties?.color || '#06B6D4',
          });
        }
      }

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

  // Parse KML XML
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, 'text/xml');
    const features: TacticalOverlay['features'] = [];

    const placemarks = xmlDoc.getElementsByTagName('Placemark');
    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      const nameEl = pm.getElementsByTagName('name')[0];
      const name = nameEl ? nameEl.textContent || `Overlay Element ${i + 1}` : `Overlay Element ${i + 1}`;

      // Check Polygon
      const polygon = pm.getElementsByTagName('Polygon')[0];
      if (polygon) {
        const coordsText = polygon.getElementsByTagName('coordinates')[0]?.textContent || '';
        const coords = parseKMLCoordinates(coordsText);
        if (coords.length > 0) {
          features.push({
            name,
            type: 'Polygon',
            coordinates: [coords], // GeoJSON Polygon format: array of linear rings
            color: '#38BDF8',
          });
          continue;
        }
      }

      // Check LineString
      const lineString = pm.getElementsByTagName('LineString')[0];
      if (lineString) {
        const coordsText = lineString.getElementsByTagName('coordinates')[0]?.textContent || '';
        const coords = parseKMLCoordinates(coordsText);
        if (coords.length > 0) {
          features.push({
            name,
            type: 'LineString',
            coordinates: coords,
            color: '#F59E0B',
          });
          continue;
        }
      }

      // Check Point
      const point = pm.getElementsByTagName('Point')[0];
      if (point) {
        const coordsText = point.getElementsByTagName('coordinates')[0]?.textContent || '';
        const coords = parseKMLCoordinates(coordsText);
        if (coords.length > 0) {
          features.push({
            name,
            type: 'Point',
            coordinates: coords[0],
            color: '#10B981',
          });
        }
      }
    }

    return {
      id: `overlay_${Date.now()}`,
      name: fileName,
      type: 'KML',
      features,
    };
  } catch (err) {
    console.error('Failed to parse KML:', err);
    return {
      id: `overlay_${Date.now()}`,
      name: fileName,
      type: 'KML',
      features: [],
    };
  }
}

function parseKMLCoordinates(coordString: string): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  const tokens = coordString.trim().split(/\s+/);
  for (const token of tokens) {
    if (!token) continue;
    const parts = token.split(',');
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lon) && !isNaN(lat)) {
        result.push([lon, lat]);
      }
    }
  }
  return result;
}
