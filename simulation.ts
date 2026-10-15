export interface LatLon {
  lat: number;
  lon: number;
}

export interface RadarRing {
  id: string;
  name: string;
  radiusNM: number;
  color: string;
  fillAlpha: number;
}

export interface LauncherState {
  id: number;
  missilesRemaining: number;
  maxMissiles: number;
  reloadTimeSec: number;
  reloadRemainingSec: number; // 0 if ready
  isReloading: boolean;
}

export interface SAMConfig {
  systemName: string;
  baseLat: number; // Decimal degrees
  baseLon: number; // Decimal degrees
  baseElevationFt: number;
  launcherCount: number;
  missilesPerLauncher: number;
  missileSpeedMach: number;
  timeOfFlightSec: number;
  launcherReloadTimeSec: number;
  maxSimultaneousEngagements: number;
  radarRings: RadarRing[];
  defaultSpawnAltitudeFt: number;
  defaultSpawnSpeedMach: number;
}

export interface AircraftTarget {
  id: string; // T1, T2...
  lat: number;
  lon: number;
  altitudeFt: number; // in feet (e.g. 20000 ft = 200 hundreds)
  headingDeg: number; // 0-359 deg (true north)
  speedMach: number; // Mach number, e.g. 0.85
  selected?: boolean;
  isEngaged?: boolean;
  spawnTimeMs: number;
}

export interface ActiveMissile {
  id: string;
  launcherId: number;
  targetId: string;
  startLat: number;
  startLon: number;
  startAltFt: number;
  currentLat: number;
  currentLon: number;
  currentAltFt: number;
  initialBearingDeg: number;
  initialRangeNM: number;
  initialSlantRangeNM: number;
  initialZoneName: string;
  timeOfFlightRemainingSec: number;
  totalTimeOfFlightSec: number;
  elapsedSec: number;
  speedMach: number;
  status: 'IN_FLIGHT' | 'HIT' | 'MISS' | 'TERMINATE';
  flightPath: Array<{ lat: number; lon: number; altFt: number; timestamp: number }>;
}

export interface VisualEffect {
  id: string;
  lat: number;
  lon: number;
  type: 'HIT' | 'MISS' | 'TERMINATE';
  timestamp: number;
  durationMs: number;
  color: string;
}

export interface ShotLogEntry {
  shotId: string;
  timestampLocal: string;
  timestampZulu: string;
  timestampIso?: string;
  targetName: string;
  initialBearingDeg: number;
  initialRangeNM: number;
  initialAltitudeFt: number;
  qualityOfShot: string; // Ring name where target was at launch
  result: 'HIT' | 'MISS' | 'TERMINATE';
  timeElapsedSec: number;
  finalCoordinates: string; // DD° MM.MMM' format
  missileId: string;
  interceptLat?: number;
  interceptLon?: number;
  interceptAltFt?: number;
}

export interface TacticalOverlay {
  id: string;
  name: string;
  type: 'FeatureCollection' | 'KML';
  features: Array<{
    name?: string;
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: any;
    color?: string;
  }>;
}

export interface SimulationTelemetrySample {
  timestampIso: string;
  elapsedMs: number;
  samSite: {
    lat: number;
    lon: number;
    elevationFt: number;
  };
  targets: Array<{
    id: string;
    lat: number;
    lon: number;
    altitudeFt: number;
    headingDeg: number;
    speedMach: number;
  }>;
  missiles: Array<{
    id: string;
    targetId: string;
    lat: number;
    lon: number;
    altitudeFt: number;
    status: string;
  }>;
}
