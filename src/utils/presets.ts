import { SAMConfig } from '../types/simulation';

export const SAM_PRESETS: Record<string, SAMConfig> = {
  'ks1c': {
    systemName: 'RTAF KS-1C (HQ-12)',
    baseLat: 15.2917, // ~15° 17.500' N (Wing 4 Takhli)
    baseLon: 100.2967, // ~100° 17.800' E
    baseElevationFt: 115,
    launcherCount: 4,
    missilesPerLauncher: 2,
    missileSpeedMach: 3.5,
    timeOfFlightSec: 55,
    launcherReloadTimeSec: 25,
    maxSimultaneousEngagements: 4,
    defaultSpawnAltitudeFt: 25000,
    defaultSpawnSpeedMach: 0.85,
    bullseyeEnabled: false,
    bullseyeLat: 15.2500, // ~15° 15.000' N
    bullseyeLon: 100.3500, // ~100° 21.000' E
    radarRings: [
      { id: 'ring_1', name: 'Inner Kill Zone (IKZ)', radiusNM: 5, color: '#EF4444', fillAlpha: 0.15 },
      { id: 'ring_2', name: 'No-Escape Zone (NEZ)', radiusNM: 18, color: '#F97316', fillAlpha: 0.10 },
      { id: 'ring_3', name: 'Max Effective Range (Rmax)', radiusNM: 30, color: '#EAB308', fillAlpha: 0.08 },
      { id: 'ring_4', name: 'Engagement Envelope', radiusNM: 42, color: '#06B6D4', fillAlpha: 0.05 },
      { id: 'ring_5', name: 'Acquisition & Tracking Radar', radiusNM: 60, color: '#3B82F6', fillAlpha: 0.03 },
    ],
  },
  'spada': {
    systemName: 'RTAF Spada / Aspide-2000',
    baseLat: 13.9125, // 13° 54.750' N (Wing 6 Don Mueang)
    baseLon: 100.6042, // 100° 36.250' E
    baseElevationFt: 14,
    launcherCount: 2,
    missilesPerLauncher: 6,
    missileSpeedMach: 2.5,
    timeOfFlightSec: 35,
    launcherReloadTimeSec: 20,
    maxSimultaneousEngagements: 2,
    defaultSpawnAltitudeFt: 15000,
    defaultSpawnSpeedMach: 0.75,
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
  'long_range': {
    systemName: 'RTAF Long-Range Area Defense',
    baseLat: 14.9700, // Korat / Nakhon Ratchasima
    baseLon: 102.0800,
    baseElevationFt: 610,
    launcherCount: 6,
    missilesPerLauncher: 4,
    missileSpeedMach: 4.5,
    timeOfFlightSec: 85,
    launcherReloadTimeSec: 30,
    maxSimultaneousEngagements: 6,
    defaultSpawnAltitudeFt: 30000,
    defaultSpawnSpeedMach: 0.90,
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

export const DEFAULT_SAM_CONFIG = SAM_PRESETS['ks1c'];
