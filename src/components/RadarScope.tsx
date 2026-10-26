import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  SAMConfig,
  AircraftTarget,
  ActiveMissile,
  VisualEffect,
  TacticalOverlay,
} from '../types/simulation';
import {
  getDistanceNM,
  getBearingDeg,
  getDestinationLatLon,
  formatAltitudeFL,
  formatFlightLevel,
  normalizeDegree360,
  formatDegree360,
} from '../utils/geo';
import {
  Crosshair,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Trash2,
} from 'lucide-react';

interface RadarScopeProps {
  samConfig: SAMConfig;
  targets: AircraftTarget[];
  missiles: ActiveMissile[];
  visualEffects: VisualEffect[];
  tacticalOverlays: TacticalOverlay[];
  selectedTargetId: string | null;
  layoutKey?: string;
  onSelectTarget: (id: string | null) => void;
  onSpawnTarget: (lat: number, lon: number) => void;
  onUpdateTargetPosition: (id: string, lat: number, lon: number) => void;
  onDeleteTarget: (id: string) => void;
}

export const RadarScope: React.FC<RadarScopeProps> = ({
  samConfig,
  targets,
  missiles,
  visualEffects,
  tacticalOverlays,
  selectedTargetId,
  layoutKey,
  onSelectTarget,
  onSpawnTarget,
  onUpdateTargetPosition,
  onDeleteTarget,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Exact container dimensions to prevent aspect ratio distortion during panel toggles/resizing
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Viewport transforms (center offset in NM relative to SAM site)
  const [centerOffsetNM, setCenterOffsetNM] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoomScale, setZoomScale] = useState<number>(1.0); // 1.0 means outer ring fits canvas nicely
  const [showOverlays, setShowOverlays] = useState<boolean>(true);

  // Touch gesture refs for iPad & iPhone
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1.0);
  const touchMovedRef = useRef<boolean>(false);
  const lastTouchTapTimeRef = useRef<number>(0);

  // Mouse / Touch interaction HUD state
  const [cursorInfo, setCursorInfo] = useState<{
    visible: boolean;
    screenX: number;
    screenY: number;
    bearingDeg: number;
    rangeNM: number;
    rangeKm: number;
  }>({
    visible: false,
    screenX: 0,
    screenY: 0,
    bearingDeg: 0,
    rangeNM: 0,
    rangeKm: 0,
  });

  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggedTargetIdRef = useRef<string | null>(null);
  const beImgRef = useRef<HTMLImageElement | null>(null);

  // Preload Bullseye roundel symbol image
  useEffect(() => {
    const img = new Image();
    img.src = '/assets/aistudio/image_62445c87.png';
    img.onload = () => {
      beImgRef.current = img;
    };
  }, []);

  // Bullseye active state and reference coordinates for BRA
  const isBeActive = Boolean(
    samConfig.bullseyeEnabled &&
    samConfig.bullseyeLat !== undefined &&
    samConfig.bullseyeLon !== undefined
  );
  const refLat = isBeActive ? samConfig.bullseyeLat! : samConfig.baseLat;
  const refLon = isBeActive ? samConfig.bullseyeLon! : samConfig.baseLon;

  // Maximum outer ring radius
  const maxRadiusNM = Math.max(
    ...samConfig.radarRings.map((r) => r.radiusNM),
    samConfig.timeOfFlightSec * (samConfig.missileSpeedMach * 0.18374) * 0.8,
    45
  );

  // Coordinate Conversion helper:
  // Converts (lat, lon) to canvas pixel (x, y) relative to SAM Site and centerOffsetNM
  const geoToPixel = useCallback(
    (lat: number, lon: number, width: number, height: number): { x: number; y: number } => {
      const centerX = width / 2;
      const centerY = height / 2;
      const maxDim = Math.min(width, height) * 0.44;
      const pixelsPerNM = (maxDim / maxRadiusNM) * zoomScale;

      // Approximate flat tangent plane projection in NM around SAM Site
      // 1 degree latitude = 60 NM
      // 1 degree longitude = 60 * cos(lat) NM
      const meanLatRad = (samConfig.baseLat * Math.PI) / 180;
      const dLatNM = (lat - samConfig.baseLat) * 60;
      const dLonNM = (lon - samConfig.baseLon) * 60 * Math.cos(meanLatRad);

      const screenX = centerX + (dLonNM - centerOffsetNM.x) * pixelsPerNM;
      const screenY = centerY - (dLatNM - centerOffsetNM.y) * pixelsPerNM; // Y is inverted in canvas

      return { x: screenX, y: screenY };
    },
    [samConfig.baseLat, samConfig.baseLon, centerOffsetNM, zoomScale, maxRadiusNM]
  );

  // Converts canvas pixel (x, y) back to geo (lat, lon)
  const pixelToGeo = useCallback(
    (pixelX: number, pixelY: number, width: number, height: number): { lat: number; lon: number } => {
      const centerX = width / 2;
      const centerY = height / 2;
      const maxDim = Math.min(width, height) * 0.44;
      const pixelsPerNM = (maxDim / maxRadiusNM) * zoomScale;

      const dLonNM = (pixelX - centerX) / pixelsPerNM + centerOffsetNM.x;
      const dLatNM = -(pixelY - centerY) / pixelsPerNM + centerOffsetNM.y;

      const meanLatRad = (samConfig.baseLat * Math.PI) / 180;
      const lat = samConfig.baseLat + dLatNM / 60;
      const lon = samConfig.baseLon + dLonNM / (60 * Math.cos(meanLatRad));

      return { lat, lon };
    },
    [samConfig.baseLat, samConfig.baseLon, centerOffsetNM, zoomScale, maxRadiusNM]
  );

  // Recenter map back to SAM base
  const handleRecenter = () => {
    setCenterOffsetNM({ x: 0, y: 0 });
    setZoomScale(1.0);
  };

  // Keyboard Delete target
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTargetId) {
        // Prevent deleting if focus is on an input or textarea
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        onDeleteTarget(selectedTargetId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTargetId, onDeleteTarget]);

  // Synchronize canvas buffer resolution with exact container size
  const checkAndResizeCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w <= 0 || h <= 0) return;

    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    setDimensions((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, []);

  // Monitor container size changes continuously via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    checkAndResizeCanvas();

    const ro = new ResizeObserver(() => {
      checkAndResizeCanvas();
    });
    ro.observe(container);

    window.addEventListener('resize', checkAndResizeCanvas);
    window.addEventListener('orientationchange', checkAndResizeCanvas);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', checkAndResizeCanvas);
      window.removeEventListener('orientationchange', checkAndResizeCanvas);
    };
  }, [checkAndResizeCanvas]);

  // When layoutKey changes (e.g. Firing panel toggled, Shot log expanded, or target panel open/close),
  // continuously update canvas dimensions across the 300ms CSS flex transition
  useEffect(() => {
    const start = performance.now();
    let animId: number;

    const tick = (now: number) => {
      checkAndResizeCanvas();
      if (now - start < 350) {
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [layoutKey, checkAndResizeCanvas]);

  // Prevent default touch gestures (iOS document pinch-zoom / bounce) on radar canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preventDefaultTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    canvas.addEventListener('touchmove', preventDefaultTouch, { passive: false });
    return () => {
      canvas.removeEventListener('touchmove', preventDefaultTouch);
    };
  }, []);

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays with exact container dimensions
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (width <= 0 || height <= 0) return;

    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Clear & Dark Background
    ctx.fillStyle = '#06090e';
    ctx.fillRect(0, 0, width, height);

    const samPixel = geoToPixel(samConfig.baseLat, samConfig.baseLon, width, height);
    const bePixel = isBeActive ? geoToPixel(samConfig.bullseyeLat!, samConfig.bullseyeLon!, width, height) : null;
    const maxDim = Math.min(width, height) * 0.44;
    const pixelsPerNM = (maxDim / maxRadiusNM) * zoomScale;

    // 2. Tactical Graticule: Radial spokes every 30 degrees (centered at Bullseye if active, SAM base if not)
    const graticuleOriginPixel = isBeActive && bePixel ? bePixel : samPixel;
    ctx.save();
    ctx.translate(graticuleOriginPixel.x, graticuleOriginPixel.y);

    ctx.strokeStyle = isBeActive ? 'rgba(245, 158, 11, 0.16)' : 'rgba(6, 182, 212, 0.12)';
    ctx.lineWidth = 1;

    // Generous spoke length to span across the screen even if BE is offset
    const spokeLength = Math.max(width, height) * 1.6;

    for (let deg = 30; deg <= 360; deg += 30) {
      const rad = ((deg - 90) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(rad) * spokeLength, Math.sin(rad) * spokeLength);
      ctx.stroke();

      // Degree label at outer edge (001-360)
      const labelDist = maxRadiusNM * 1.05 * pixelsPerNM;
      const lx = Math.cos(rad) * labelDist;
      const ly = Math.sin(rad) * labelDist;

      ctx.fillStyle = isBeActive ? 'rgba(245, 158, 11, 0.65)' : 'rgba(6, 182, 212, 0.45)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${formatDegree360(deg)}°`, lx, ly);
    }

    // Secondary 15 degree tick marks at outer boundary
    for (let deg = 15; deg <= 360; deg += 15) {
      if (deg % 30 === 0) continue;
      const rad = ((deg - 90) * Math.PI) / 180;
      const r1 = maxRadiusNM * pixelsPerNM;
      const r2 = maxRadiusNM * 1.03 * pixelsPerNM;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rad) * r1, Math.sin(rad) * r1);
      ctx.lineTo(Math.cos(rad) * r2, Math.sin(rad) * r2);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Render Concentric Radar Capability Rings
    // Sort rings descending so inner rings don't get covered
    const sortedRings = [...samConfig.radarRings].sort((a, b) => b.radiusNM - a.radiusNM);

    for (const ring of sortedRings) {
      const ringPixelRadius = ring.radiusNM * pixelsPerNM;

      // Filled translucent zone
      ctx.beginPath();
      ctx.arc(samPixel.x, samPixel.y, ringPixelRadius, 0, Math.PI * 2);
      ctx.fillStyle = ring.color;
      ctx.globalAlpha = ring.fillAlpha || 0.06;
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Ring boundary line
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ring Name & Radius Tag (placed at 45° northeast)
      const tagAngleRad = ((45 - 90) * Math.PI) / 180;
      const tagX = samPixel.x + Math.cos(tagAngleRad) * ringPixelRadius;
      const tagY = samPixel.y + Math.sin(tagAngleRad) * ringPixelRadius;

      ctx.fillStyle = ring.color;
      ctx.font = '11px "Chakra Petch", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${ring.radiusNM} NM - ${ring.name}`, tagX + 6, tagY - 2);
    }

    // 4. Render Google Earth Drawings / Overlays (KML / GeoJSON)
    if (showOverlays && tacticalOverlays.length > 0) {
      for (const overlay of tacticalOverlays) {
        for (const f of overlay.features) {
          if (f.type === 'LineString' && Array.isArray(f.coordinates)) {
            ctx.beginPath();
            ctx.strokeStyle = f.color || '#38BDF8';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([3, 2]);

            for (let i = 0; i < f.coordinates.length; i++) {
              const pt = f.coordinates[i];
              const p = geoToPixel(pt[1], pt[0], width, height);
              if (i === 0) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (f.type === 'Polygon' && Array.isArray(f.coordinates)) {
            ctx.beginPath();
            ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
            ctx.strokeStyle = f.color || '#38BDF8';
            ctx.lineWidth = 1.5;

            const ringCoords = f.coordinates[0];
            if (Array.isArray(ringCoords)) {
              for (let i = 0; i < ringCoords.length; i++) {
                const pt = ringCoords[i];
                const p = geoToPixel(pt[1], pt[0], width, height);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
              }
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
          } else if (f.type === 'Point' && Array.isArray(f.coordinates)) {
            const p = geoToPixel(f.coordinates[1], f.coordinates[0], width, height);
            ctx.fillStyle = f.color || '#10B981';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();

            if (f.name) {
              ctx.font = '10px "JetBrains Mono", monospace';
              ctx.fillText(f.name, p.x + 6, p.y + 3);
            }
          }
        }
      }
    }


    // 6. Active Missiles and Dotted Trajectory Trails
    for (const missile of missiles) {
      if (missile.status !== 'IN_FLIGHT') continue;

      // Draw continuous dotted trajectory line from launch site
      if (missile.flightPath && missile.flightPath.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = '#F59E0B'; // Amber missile line
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]); // Dotted trail

        for (let i = 0; i < missile.flightPath.length; i++) {
          const pt = missile.flightPath[i];
          const p = geoToPixel(pt.lat, pt.lon, width, height);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw missile current icon: larger circular dot with glow
      const missilePixel = geoToPixel(missile.currentLat, missile.currentLon, width, height);

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(missilePixel.x, missilePixel.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.fill();

      // Main circular dot
      ctx.beginPath();
      ctx.arc(missilePixel.x, missilePixel.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Missile label: M-1 (TOF: 24s)
      ctx.fillStyle = '#FCD34D';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${missile.id} (${Math.max(0, Math.ceil(missile.timeOfFlightRemainingSec))}s)`,
        missilePixel.x + 9,
        missilePixel.y - 4
      );
    }

    // 7. Visual Impact / Splash / Terminate Effects
    const now = Date.now();
    for (const eff of visualEffects) {
      const elapsed = now - eff.timestamp;
      if (elapsed > eff.durationMs) continue;
      const progress = elapsed / eff.durationMs;
      const effPixel = geoToPixel(eff.lat, eff.lon, width, height);

      ctx.save();
      if (eff.type === 'HIT') {
        // Fiery explosion shockwave expanding outward
        const shockRadius = 10 + progress * 30;
        ctx.beginPath();
        ctx.arc(effPixel.x, effPixel.y, shockRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(239, 68, 68, ${1 - progress})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(effPixel.x, effPixel.y, shockRadius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 158, 11, ${0.8 - progress * 0.8})`;
        ctx.fill();

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 12px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TARGET DESTROYED (HIT)', effPixel.x, effPixel.y - shockRadius - 6);
      } else if (eff.type === 'MISS') {
        const shockRadius = 6 + progress * 20;
        ctx.beginPath();
        ctx.arc(effPixel.x, effPixel.y, shockRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(148, 163, 184, ${0.8 - progress * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#94A3B8';
        ctx.font = '11px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MISSILE TIMEOUT (MISS)', effPixel.x, effPixel.y - shockRadius - 4);
      } else if (eff.type === 'TERMINATE') {
        const size = 10 + progress * 15;
        ctx.strokeStyle = `rgba(249, 115, 22, ${1 - progress})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(effPixel.x - size, effPixel.y - size);
        ctx.lineTo(effPixel.x + size, effPixel.y + size);
        ctx.moveTo(effPixel.x + size, effPixel.y - size);
        ctx.lineTo(effPixel.x - size, effPixel.y + size);
        ctx.stroke();

        ctx.fillStyle = '#F97316';
        ctx.font = '11px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MANUALLY TERMINATED', effPixel.x, effPixel.y - size - 4);
      }
      ctx.restore();
    }

    // 8. Aircraft Targets
    for (const t of targets) {
      const tp = geoToPixel(t.lat, t.lon, width, height);
      const isSelected = t.id === selectedTargetId;

      // Bearing & Range (relative to Bullseye if active, SAM base if not)
      const brg = getBearingDeg(refLat, refLon, t.lat, t.lon);
      const rng = getDistanceNM(refLat, refLon, t.lat, t.lon);

      // Selection reticle ring
      if (isSelected) {
        ctx.save();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 16, 0, Math.PI * 2);
        ctx.stroke();

        // 4 corner ticks
        ctx.setLineDash([]);
        const tickLen = 6;
        ctx.beginPath();
        ctx.moveTo(tp.x - 20, tp.y);
        ctx.lineTo(tp.x - 20 + tickLen, tp.y);
        ctx.moveTo(tp.x + 20, tp.y);
        ctx.lineTo(tp.x + 20 - tickLen, tp.y);
        ctx.moveTo(tp.x, tp.y - 20);
        ctx.lineTo(tp.x, tp.y - 20 + tickLen);
        ctx.moveTo(tp.x, tp.y + 20);
        ctx.lineTo(tp.x, tp.y + 20 - tickLen);
        ctx.stroke();
        ctx.restore();
      }

      // Aircraft Directional Triangle Icon oriented by headingDeg
      ctx.save();
      ctx.translate(tp.x, tp.y);
      const headingRad = (t.headingDeg * Math.PI) / 180;
      ctx.rotate(headingRad);

      ctx.beginPath();
      ctx.moveTo(0, -9); // Nose facing up (0 deg)
      ctx.lineTo(7, 8); // Right wing
      ctx.lineTo(0, 5); // Center tail indent
      ctx.lineTo(-7, 8); // Left wing
      ctx.closePath();

      ctx.fillStyle = t.isEngaged ? '#F43F5E' : isSelected ? '#38BDF8' : '#EF4444';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();

      // Aircraft Telemetry Label beside icon:
      // Line 1: [Name] BBB/range (or [Name] BE BBB/range when Bullseye is active)
      // Line 2: FLxxx  Mxx (e.g. FL250  M0.85)
      // Line 3: SAM launcher bearing relative to aircraft (3 digits 001-360 in RED, shown only when engaged)
      ctx.save();
      const bbb = formatDegree360(brg);
      const rngFormatted = Math.round(rng).toString();
      const line1 = isBeActive ? `${t.id} BE ${bbb}/${rngFormatted}` : `${t.id} ${bbb}/${rngFormatted}`;
      const flText = formatFlightLevel(t.altitudeFt);
      const machText = `M${t.speedMach.toFixed(2)}`;
      const line2 = `${flText}  ${machText}`;

      // Check if aircraft is engaged / under missile attack
      const targetMissiles = missiles.filter(
        (m) => m.targetId === t.id && m.status === 'IN_FLIGHT'
      );
      const isUnderAttack = Boolean(t.isEngaged || targetMissiles.length > 0);

      // 1. Bearing of the SAM launcher relative to the aircraft (3 digits 001-360)
      const samBrgFromPlane = getBearingDeg(t.lat, t.lon, samConfig.baseLat, samConfig.baseLon);
      const samBrgText = formatDegree360(samBrgFromPlane);

      // 2. Bearing of nearest incoming missile relative to the aircraft (3 digits 001-360)
      let nearestMissile: ActiveMissile | null = null;
      let minMissileDist = Infinity;
      for (const m of targetMissiles) {
        const dist = getDistanceNM(t.lat, t.lon, m.currentLat, m.currentLon);
        if (dist < minMissileDist) {
          minMissileDist = dist;
          nearestMissile = m;
        }
      }
      const missileBrgFromPlane = nearestMissile
        ? getBearingDeg(t.lat, t.lon, nearestMissile.currentLat, nearestMissile.currentLon)
        : samBrgFromPlane;
      const missileBrgText = formatDegree360(missileBrgFromPlane);

      const line3Combined = `${samBrgText} / ${missileBrgText}`;

      // Label background box for high legibility (2 lines normally, 3 lines when engaged)
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      const m1 = ctx.measureText(line1).width;
      const m2 = ctx.measureText(line2).width;
      const m3 = isUnderAttack ? ctx.measureText(line3Combined).width : 0;
      const boxW = Math.max(m1, m2, m3) + 12;
      const boxH = isUnderAttack ? 43 : 30;
      const boxX = tp.x + 12;
      const boxY = tp.y - 15;

      ctx.fillStyle = 'rgba(6, 11, 18, 0.45)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = isUnderAttack ? '#F43F5E' : isSelected ? '#38BDF8' : '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // Line 1: Name and BBB/range
      ctx.fillStyle = isUnderAttack ? '#FDA4AF' : isSelected ? '#BAE6FD' : '#E2E8F0';
      ctx.fillText(line1, boxX + 6, boxY + 3);

      // Line 2: FLxx and speed in knots
      ctx.fillStyle = '#34D399'; // Emerald altitude and speed
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(line2, boxX + 6, boxY + 16);

      // Line 3: Threat bearings: Launcher bearing (Orange) / Nearest missile bearing (Red)
      if (isUnderAttack) {
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        const startX = boxX + 6;
        const startY = boxY + 29;

        // Launcher bearing (Orange)
        ctx.fillStyle = '#FB923C';
        ctx.fillText(samBrgText, startX, startY);
        const samW = ctx.measureText(samBrgText).width;

        // Separator slash (Neutral slate)
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(' / ', startX + samW, startY);
        const sepW = ctx.measureText(' / ').width;

        // Nearest missile bearing (Red)
        ctx.fillStyle = '#EF4444';
        ctx.fillText(missileBrgText, startX + samW + sepW, startY);
      }
      ctx.restore();
    }

    // 9. Central SAM Site Fixed Base Icon
    ctx.save();
    // Glowing base footprint
    ctx.beginPath();
    ctx.arc(samPixel.x, samPixel.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.fill();

    // SAM site diamond icon
    ctx.beginPath();
    ctx.moveTo(samPixel.x, samPixel.y - 7);
    ctx.lineTo(samPixel.x + 7, samPixel.y);
    ctx.lineTo(samPixel.x, samPixel.y + 7);
    ctx.lineTo(samPixel.x - 7, samPixel.y);
    ctx.closePath();
    ctx.fillStyle = '#10B981';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center crosshair
    ctx.beginPath();
    ctx.moveTo(samPixel.x - 12, samPixel.y);
    ctx.lineTo(samPixel.x + 12, samPixel.y);
    ctx.moveTo(samPixel.x, samPixel.y - 12);
    ctx.lineTo(samPixel.x, samPixel.y + 12);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // SAM Site Label
    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 11px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${samConfig.systemName} (SAM-1)`, samPixel.x, samPixel.y + 20);
    ctx.restore();

    // 10. Bullseye (B.E.) Symbol and Label (When active: small white ring)
    if (isBeActive && bePixel) {
      ctx.save();

      // Subtle soft glow
      ctx.beginPath();
      ctx.arc(bePixel.x, bePixel.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();

      // Small white ring
      ctx.beginPath();
      ctx.arc(bePixel.x, bePixel.y, 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Tiny center dot
      ctx.beginPath();
      ctx.arc(bePixel.x, bePixel.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // Small tactical crosshair tick marks (subtle)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.moveTo(bePixel.x - 9, bePixel.y);
      ctx.lineTo(bePixel.x - 6.5, bePixel.y);
      ctx.moveTo(bePixel.x + 6.5, bePixel.y);
      ctx.lineTo(bePixel.x + 9, bePixel.y);
      ctx.moveTo(bePixel.x, bePixel.y - 9);
      ctx.lineTo(bePixel.x, bePixel.y - 6.5);
      ctx.moveTo(bePixel.x, bePixel.y + 6.5);
      ctx.lineTo(bePixel.x, bePixel.y + 9);
      ctx.stroke();

      // Label below Bullseye symbol
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('B.E.', bePixel.x, bePixel.y + 10);
      ctx.restore();
    }

    ctx.restore();
  }, [
    samConfig,
    targets,
    missiles,
    visualEffects,
    tacticalOverlays,
    selectedTargetId,
    centerOffsetNM,
    zoomScale,
    showOverlays,
    geoToPixel,
    maxRadiusNM,
    dimensions,
  ]);

  // Mouse Handlers: Cursor Brg/Range calculation, Double-click spawn, Dragging aircraft, Panning
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate real-time Bearing & Range relative to reference (BE if active, SAM base if not)
    const geoPos = pixelToGeo(mouseX, mouseY, rect.width, rect.height);
    const brg = getBearingDeg(refLat, refLon, geoPos.lat, geoPos.lon);
    const rngNM = getDistanceNM(refLat, refLon, geoPos.lat, geoPos.lon);
    const rngKm = rngNM * 1.852;

    setCursorInfo({
      visible: true,
      screenX: e.clientX,
      screenY: e.clientY,
      bearingDeg: brg,
      rangeNM: rngNM,
      rangeKm: rngKm,
    });

    // Handle dragging an aircraft
    if (draggedTargetIdRef.current) {
      onUpdateTargetPosition(draggedTargetIdRef.current, geoPos.lat, geoPos.lon);
      return;
    }

    // Handle map panning
    if (isPanningRef.current) {
      const dx = mouseX - panStartRef.current.x;
      const dy = mouseY - panStartRef.current.y;
      panStartRef.current = { x: mouseX, y: mouseY };

      const maxDim = Math.min(rect.width, rect.height) * 0.44;
      const pixelsPerNM = (maxDim / maxRadiusNM) * zoomScale;

      setCenterOffsetNM((prev) => ({
        x: prev.x - dx / pixelsPerNM,
        y: prev.y + dy / pixelsPerNM,
      }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if clicked directly on an aircraft target (hit test within 20px)
    let clickedTarget: AircraftTarget | null = null;
    for (const t of targets) {
      const tp = geoToPixel(t.lat, t.lon, rect.width, rect.height);
      const dist = Math.hypot(tp.x - mouseX, tp.y - mouseY);
      if (dist <= 20) {
        clickedTarget = t;
        break;
      }
    }

    if (clickedTarget) {
      onSelectTarget(clickedTarget.id);
      draggedTargetIdRef.current = clickedTarget.id;
    } else {
      // Start map pan
      isPanningRef.current = true;
      panStartRef.current = { x: mouseX, y: mouseY };
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If dragging an aircraft was active, check if dragged outside map bounds
    if (draggedTargetIdRef.current) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        if (mouseX < 0 || mouseX > rect.width || mouseY < 0 || mouseY > rect.height) {
          // Dragged outside bounds -> delete target
          onDeleteTarget(draggedTargetIdRef.current);
        }
      }
      draggedTargetIdRef.current = null;
    }
    isPanningRef.current = false;
  };

  const handleMouseLeave = () => {
    setCursorInfo((prev) => ({ ...prev, visible: false }));
    isPanningRef.current = false;
    draggedTargetIdRef.current = null;
  };

  // Double-Click to Spawn new Aircraft Target
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const geo = pixelToGeo(mouseX, mouseY, rect.width, rect.height);
    onSpawnTarget(geo.lat, geo.lon);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoomScale((prev) => Math.min(Math.max(prev * zoomFactor, 0.3), 8.0));
  };

  // Touch Handlers for iPad & iPhone Gestures (1-finger pan/drag, 2-finger pinch-zoom, double-tap spawn)
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    // Two-finger Pinch to Zoom Start
    if (e.touches.length === 2) {
      draggedTargetIdRef.current = null;
      isPanningRef.current = false;
      touchMovedRef.current = true;

      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = zoomScale;

      const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
      const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
      panStartRef.current = { x: midX, y: midY };
      return;
    }

    // Single-finger touch
    if (e.touches.length === 1) {
      pinchStartDistRef.current = null;
      touchMovedRef.current = false;

      const touch = e.touches[0];
      const touchX = touch.clientX - rect.left;
      const touchY = touch.clientY - rect.top;

      panStartRef.current = { x: touchX, y: touchY };

      // Touch hit test on aircraft targets (generous 30px touch hit radius)
      let clickedTarget: AircraftTarget | null = null;
      for (const t of targets) {
        const tp = geoToPixel(t.lat, t.lon, rect.width, rect.height);
        const dist = Math.hypot(tp.x - touchX, tp.y - touchY);
        if (dist <= 30) {
          clickedTarget = t;
          break;
        }
      }

      if (clickedTarget) {
        onSelectTarget(clickedTarget.id);
        draggedTargetIdRef.current = clickedTarget.id;
        isPanningRef.current = false;
      } else {
        isPanningRef.current = true;
      }

      // Update cursor / touch bearing and range HUD
      const geoPos = pixelToGeo(touchX, touchY, rect.width, rect.height);
      const brg = getBearingDeg(refLat, refLon, geoPos.lat, geoPos.lon);
      const rngNM = getDistanceNM(refLat, refLon, geoPos.lat, geoPos.lon);
      setCursorInfo({
        visible: true,
        screenX: touch.clientX,
        screenY: touch.clientY,
        bearingDeg: brg,
        rangeNM: rngNM,
        rangeKm: rngNM * 1.852,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    // Two-finger Pinch to Zoom & Pan
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const currentDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

      if (pinchStartDistRef.current > 0) {
        const factor = currentDist / pinchStartDistRef.current;
        const newZoom = Math.min(Math.max(pinchStartZoomRef.current * factor, 0.3), 8.0);
        setZoomScale(newZoom);
      }

      const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
      const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
      const dx = midX - panStartRef.current.x;
      const dy = midY - panStartRef.current.y;
      panStartRef.current = { x: midX, y: midY };

      const maxDim = Math.min(rect.width, rect.height) * 0.44;
      const pixelsPerNM = (maxDim / maxRadiusNM) * zoomScale;

      setCenterOffsetNM((prev) => ({
        x: prev.x - dx / pixelsPerNM,
        y: prev.y + dy / pixelsPerNM,
      }));

      return;
    }

    // Single-finger Move: Drag Target or Pan Map
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const touchX = touch.clientX - rect.left;
      const touchY = touch.clientY - rect.top;

      const dx = touchX - panStartRef.current.x;
      const dy = touchY - panStartRef.current.y;
      if (Math.hypot(dx, dy) > 5) {
        touchMovedRef.current = true;
      }

      const geoPos = pixelToGeo(touchX, touchY, rect.width, rect.height);
      const brg = getBearingDeg(refLat, refLon, geoPos.lat, geoPos.lon);
      const rngNM = getDistanceNM(refLat, refLon, geoPos.lat, geoPos.lon);

      setCursorInfo({
        visible: true,
        screenX: touch.clientX,
        screenY: touch.clientY,
        bearingDeg: brg,
        rangeNM: rngNM,
        rangeKm: rngNM * 1.852,
      });

      // 1. Dragging Target
      if (draggedTargetIdRef.current) {
        onUpdateTargetPosition(draggedTargetIdRef.current, geoPos.lat, geoPos.lon);
        return;
      }

      // 2. Panning Map
      if (isPanningRef.current) {
        panStartRef.current = { x: touchX, y: touchY };
        const maxDim = Math.min(rect.width, rect.height) * 0.44;
        const pixelsPerNM = (maxDim / maxRadiusNM) * zoomScale;

        setCenterOffsetNM((prev) => ({
          x: prev.x - dx / pixelsPerNM,
          y: prev.y + dy / pixelsPerNM,
        }));
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    // Check if dragged aircraft outside canvas bounds
    if (draggedTargetIdRef.current && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const touchX = touch.clientX - rect.left;
      const touchY = touch.clientY - rect.top;
      if (touchX < 0 || touchX > rect.width || touchY < 0 || touchY > rect.height) {
        onDeleteTarget(draggedTargetIdRef.current);
      }
    }

    // Single Tap / Double Tap detection
    if (!touchMovedRef.current && !draggedTargetIdRef.current && e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      const touchX = touch.clientX - rect.left;
      const touchY = touch.clientY - rect.top;

      const now = Date.now();
      const timeSinceLastTap = now - lastTouchTapTimeRef.current;
      if (timeSinceLastTap < 350) {
        // Double Tap -> spawn target at touch location
        const geo = pixelToGeo(touchX, touchY, rect.width, rect.height);
        onSpawnTarget(geo.lat, geo.lon);
        lastTouchTapTimeRef.current = 0;
      } else {
        lastTouchTapTimeRef.current = now;

        // Check if single tap touched an aircraft
        let hitTarget = false;
        for (const t of targets) {
          const tp = geoToPixel(t.lat, t.lon, rect.width, rect.height);
          if (Math.hypot(tp.x - touchX, tp.y - touchY) <= 30) {
            hitTarget = true;
            break;
          }
        }
        if (!hitTarget) {
          onSelectTarget(null);
        }
      }
    }

    // Reset interaction states when all fingers leave
    if (e.touches.length === 0) {
      isPanningRef.current = false;
      draggedTargetIdRef.current = null;
      pinchStartDistRef.current = null;
      setCursorInfo((prev) => ({ ...prev, visible: false }));
    } else if (e.touches.length === 1) {
      // Transition from pinch back to 1-finger pan
      pinchStartDistRef.current = null;
      const t = e.touches[0];
      panStartRef.current = {
        x: t.clientX - rect.left,
        y: t.clientY - rect.top,
      };
    }
  };

  const handleTouchCancel = () => {
    isPanningRef.current = false;
    draggedTargetIdRef.current = null;
    pinchStartDistRef.current = null;
    setCursorInfo((prev) => ({ ...prev, visible: false }));
  };

  return (
    <div ref={containerRef} className="relative w-full h-full select-none overflow-hidden bg-[#06090e] touch-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair touch-none"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      />

      {/* Dynamic Cursor Floating Bearing / Range HUD at bottom-right corner of cursor */}
      {cursorInfo.visible && (
        <div
          className="pointer-events-none fixed z-50 transform translate-x-3 translate-y-3 px-2 py-1 rounded bg-slate-950/90 border border-cyan-500/50 shadow-lg text-[11px] font-telemetry text-cyan-300"
          style={{
            left: `${cursorInfo.screenX}px`,
            top: `${cursorInfo.screenY}px`,
          }}
        >
          <div className="flex items-center font-bold">
            {isBeActive && (
              <span className="text-amber-400 font-bold mr-1 text-[10px]">BE</span>
            )}
            <span className="text-cyan-200">
              {formatDegree360(cursorInfo.bearingDeg)}/{Math.round(cursorInfo.rangeNM)}
            </span>
          </div>
        </div>
      )}

      {/* On-Map Floating C2 Controls (Top-Right / Left) */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 p-1 rounded-md bg-slate-950/80 border border-slate-800 backdrop-blur-xs">
        <button
          onClick={() => setZoomScale((z) => Math.min(z * 1.25, 8.0))}
          title="Zoom In (+)"
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoomScale((z) => Math.max(z * 0.8, 0.3))}
          title="Zoom Out (-)"
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-[1px] h-4 bg-slate-800" />
        <button
          onClick={handleRecenter}
          title="Recenter SAM Site"
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-military font-semibold rounded bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60 hover:text-cyan-200 transition-colors"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>RECENTER SAM</span>
        </button>
      </div>

      {tacticalOverlays.length > 0 && (
        <div className="absolute top-3 left-3 flex items-center gap-2 p-1 rounded-md bg-slate-950/80 border border-slate-800 backdrop-blur-xs text-xs font-military">
          <button
            onClick={() => setShowOverlays((o) => !o)}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              showOverlays ? 'bg-sky-950/80 text-sky-300 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Google Earth Tactical Overlays"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>KML OVERLAYS ({tacticalOverlays.length})</span>
          </button>
        </div>
      )}

      {/* Tactical Canvas Helper Footer */}
      <div className="absolute bottom-2 left-3 flex items-center gap-2.5 text-[11px] font-military text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded border border-slate-900 pointer-events-none backdrop-blur-xs">
        <span className="hidden sm:inline">DOUBLE-CLICK / DOUBLE-TAP TO SPAWN</span>
        <span className="sm:hidden">DOUBLE-TAP SPAWN</span>
        <span>·</span>
        <span className="hidden sm:inline">1-FINGER PAN / 2-FINGER PINCH ZOOM</span>
        <span className="sm:hidden">PINCH ZOOM / PAN</span>
        <span>·</span>
        <span>ZOOM: {Math.round(zoomScale * 100)}%</span>
      </div>

      {/* Bullseye Active Tactical Status Indicator (Bottom-Right) */}
      {isBeActive && (
        <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/90 border border-amber-500/80 shadow-lg text-xs font-telemetry font-bold text-amber-400 select-none z-10 backdrop-blur-xs">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="tracking-wider">B.E. Active</span>
        </div>
      )}
    </div>
  );
};
