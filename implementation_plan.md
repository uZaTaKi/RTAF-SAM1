# RTAF SAM-1 — Surface-to-Air Missile Simulator for Flight Operations Support

RTAF SAM-1 delivers a high-precision, tactical 2D vector radar scope simulation system for air defense operators and mission planners, enabling dynamic target tracking, realistic 3D engagement physics, multi-launcher sequence management, and continuous 4 Hz GPX/ACMI flight telemetry recording.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following design and technical decisions were confirmed through Phase 1 clarification:
> - **Radar Display Theme**: Pure Dark Vector Radar Scope with tactical amber/cyan/emerald graticules, azimuth sweeps, range rings, and bearing lines.
> - **Default Profile**: RTAF KS-1C / HQ-12 Medium-Range Surface-to-Air Missile system preset loaded on startup (4 Launchers, 2 Missiles each, Mach 3.5 speed, 55s TOF, 25s reload, 5 radar rings out to 60 NM / 111 km).
> - **Telemetry Export**: Standard GPX 1.1 format with aviation extensions (elevation, speed, heading, target identity) sampled at 4 Hz (every 0.25s) with continuous IndexedDB/localStorage buffering to safeguard in-progress simulations against browser refresh.

- **Confirmed Decision 1**: Interactive 2D Vector Radar Canvas rendered in HTML5 Canvas for ultra-high 60 FPS performance, smooth panning, zoom, double-click spawn, direct drag-and-drop target positioning, and zero lag during simultaneous engagements.
- **Confirmed Decision 2**: Google Earth KML/KMZ and GeoJSON vector overlay parser to render user airspaces, no-fly zones, corridors, and terrain markers directly onto the dark tactical radar scope.
- **Open Choice / Feature Bonus**: Dual export support allowing download in both GPX 1.1 format and Tacview ACMI 2.x text format with a single toggle.

---

### 1. Overview & Core Concept

- **What It Does**: Simulates ground-based air defense operations against dynamic airborne targets. Operators can configure battery parameters (base coordinates in `DD° MM.MMM'` format and elevation), switch presets (RTAF KS-1C, Spada/Aspide, or custom configurations), upload tactical overlays, place and maneuver aircraft targets (heading dial, altitude, Mach speed), fire sequentially across independent launchers, track 3D slant-range engagements, review shot outcome quality zones, and export 4 Hz mission telemetry.
- **Target Audience / Persona**: Royal Thai Air Force (RTAF) air defense coordinators, fighter controllers, combat simulator instructors, and debriefing officers who analyze engagement timelines and export ACMI data into Tacview.
- **Key Value**: Provides zero-latency, installation-free engagement evaluation that accurately maps radar envelope zones (Inner Kill Zone, Maximum Effective Range, Acquisition Zone), models multi-launcher reload cycles, and exports flight recorder data.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Setup & Positioning*: Operator verifies or edits SAM battery location in `DD° MM.MMM'` format and elevation. Preset selector allows switching between RTAF KS-1C, Spada/Aspide, or custom configurations.
  2. *Overlay Ingestion*: Operator uploads a KML/KMZ or GeoJSON file to render tactical air corridors, range boundaries, or terrain landmarks.
  3. *Target Placement & Maneuvering*: Double-clicking the radar canvas spawns aircraft (`T1`, `T2`...) facing directly toward the SAM base. Clicking an aircraft reveals the floating tactical HUD widget with a drag-to-aim compass dial (0–359°), FL altitude stepper, and Mach speed control.
  4. *Engagement Execution*: With a target selected, operator clicks **FIRE**. System rotates launcher sequentially, checks concurrent engagement caps, draws the 3D slant-range missile trajectory with a dotted trail, and starts independent launcher reload timers. Operator can manually click **TERMINATE** on any active missile.
  5. *Resolution & Logging*: Missile arrival within TOF calculates hit vs. target speed/range. Hits trigger tactical impact bursts and remove the aircraft; expired TOFs result in a miss splash. The Shot Log table logs exact Zulu and Local timestamps, quality zone at firing time, and final coordinates.
  6. *Telemetry Recording & Export*: Clicking **START SIMULATION** engages the 4 Hz timer, streaming SAM site, target, and missile positions to an IndexedDB buffer. Clicking **STOP RECORDING** finalizes and triggers download of the standard GPX 1.1 file (or Tacview ACMI).

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Tactical Air Defense Command & Control (C2) console. Deep obsidian canvas (`#080C14`), phosphor emerald (`#10B981`) for friendly SAM infrastructure, cyan (`#06B6D4`) for range rings/azimuth lines, crimson (`#EF4444`) for hostile target vectors, and telemetry amber (`#F59E0B`) for active missiles.
  - *Color Palette & Mood*:
    - Canvas Background: `#070A0F` with 10% opacity polar radar graticule and 15° radial spokes.
    - Structural Panels: Deep slate `#0F172A` with `#1E293B` hairline borders.
    - Accents: Emerald `#059669` (Ready/Nominal), Amber `#D97706` (Reloading/In-Flight), Rose `#DC2626` (Hostile/Intercept/Hit).
  - *Typography & Hierarchy*:
    - Primary Display/UI: `Chakra Petch` / `Plus Jakarta Sans` for clean, disciplined military C2 legibility.
    - Data & Telemetry: `JetBrains Mono` / `font-mono tabular-nums` for continuous cursor bearing/range HUD, coordinates, timers, and telemetry columns.
  - *Interactive Feedback & Motion*: Smooth radar sweep line animation (toggleable), live missile trail drawing, launcher reload countdown progress rings, and hover tooltips for range rings.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Canvas 2D Engine vs. Heavy Tile Mapping Engine**
  - *Chosen Approach*: High-performance HTML5 2D Canvas with custom coordinate transform engine (supporting smooth sub-pixel panning, zooming, range ring projection, and KML/GeoJSON path rendering).
  - *Why*: Delivers guaranteed 60 FPS under intensive 4 Hz sampling and multi-missile animations without loading external map tiles that could fail in offline or restricted environments.
  - *Alternatives Considered*: Leaflet.js with OSM tiles was considered, but pure dark vector radar scope was specifically requested and provides superior crispness and zero tile-download dependency.
- **Decision 2: 4 Hz Telemetry Buffering Strategy**
  - *Chosen Approach*: Dual-layer storage using an in-memory ring buffer combined with throttled periodic writes to `IndexedDB` / `localStorage`.
  - *Why*: Prevents high write frequency (4 Hz) from locking the UI thread while guaranteeing complete recovery if the user accidentally refreshes or navigates away.
  - *Alternatives Considered*: Direct disk streaming is not possible in browser sandboxes; purely in-memory would lose data on accidental page refresh.
- **Decision 3: Realistic Coordinate Conversion & DD° MM.MMM' Math**
  - *Chosen Approach*: Full spherical geodetic calculations (Haversine formula and forward bearing equations) converting between latitude/longitude, standard DD° MM.MMM' notation, and nautical miles (1 NM = 1,852 meters).
  - *Why*: Ensures that aircraft heading, speed (Mach 1.0 $\approx$ 661.47 knots at sea level), and missile travel times reflect genuine geographic distances and 3D slant range.

---

### 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            RTAF SAM-1 C2 CONSOLE                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  TOP STATUS BAR: UTC/Zulu Clock │ Simulation Timer │ Recenter │ Preset Select │
├──────────────────────┬───────────────────────────────────────┬───────────────┤
│  LEFT C2 CONTROL     │        CENTER RADAR VIEWPORT          │ RIGHT HUD &   │
│  PANEL               │                                       │ TARGET WIDGET │
│  - SAM Site Config   │  - 2D Canvas Radar Scope (60 FPS)     │  - Target Alt │
│    (Lat/Lon, Elev)   │  - Polar Rings (Zone 1 to N)          │    (FL / 100ft│
│  - Launcher Matrix   │  - KML/GeoJSON Vector Overlays        │  - Speed (M)  │
│    (Missile counts,  │  - Aircraft Vectors (T1, T2...)       │  - Heading    │
│     Reload timers)   │  - Missile Dotted Trails & Intercepts │    Compass    │
│  - Radar Ring Mgmt   │  - Live Cursor Brg/Range Floating HUD │  - FIRE /     │
│  - KML/KMZ Upload    │  - Panning & Zoom Controls            │    TERMINATE  │
├──────────────────────┴───────────────────────────────────────┴───────────────┤
│  BOTTOM TACTICAL TRAY: Shot Log Table (Brg, Rng, Zone, Result) │ GPX/ACMI Exp│
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Core Data Entities & State Stores
- **`SAMSiteConfig`**:
  - `systemName`: string
  - `latitude`: number (converted to/from `DD° MM.MMM'`)
  - `longitude`: number (converted to/from `DD° MM.MMM'`)
  - `elevationFt`: number
  - `launchers`: Array<{ id: number, missiles: number, maxMissiles: number, reloadTimeSec: number, reloadRemainingSec: number, status: 'READY' | 'RELOADING' | 'EMPTY' }>
  - `missileSpeedMach`: number
  - `timeOfFlightSec`: number
  - `maxSimultaneousEngagements`: number
  - `radarRings`: Array<{ id: string, name: string, radiusNM: number, color: string, fillAlpha: number }>
- **`AircraftTarget`**:
  - `id`: string (`T1`, `T2`...)
  - `lat`: number, `lon`: number
  - `altitudeFt`: number (displayed in hundreds of ft, e.g. FL250 = 250)
  - `headingDeg`: number (0–359°)
  - `speedMach`: number
  - `selected`: boolean
  - `isUnderEngagement`: boolean
- **`ActiveMissile`**:
  - `id`: string
  - `launcherId`: number
  - `targetId`: string
  - `startLat`: number, `startLon`: number, `startAltFt`: number
  - `currentLat`: number, `currentLon`: number, `currentAltFt`: number
  - `targetStartBrgDeg`: number, `targetStartRangeNM`: number, `initialZone`: string
  - `flightTimeRemainingSec`: number
  - `totalTOFSec`: number
  - `trajectoryPoints`: Array<{ lat: number, lon: number, altFt: number, timestamp: number }>
  - `status`: 'IN_FLIGHT' | 'HIT' | 'MISS' | 'TERMINATED'
- **`ShotLog`**:
  - `shotId`: string
  - `timestampLocal`: string, `timestampZulu`: string
  - `targetName`: string
  - `initialBearingDeg`: number, `initialRangeNM`: number, `initialAltitudeFt`: number
  - `qualityOfShotZone`: string (e.g. "Zone 2: NEZ (No-Escape Zone)")
  - `result`: 'HIT' | 'MISS' | 'TERMINATE'
  - `timeElapsedSec`: number
  - `finalCoordinates`: string (DD° MM.MMM')
- **`SimulationSession`**:
  - `isRunning`: boolean
  - `startTime`: number | null
  - `gpxBuffer`: Array<{ time: string, entities: Array<any> }>

#### Interactive State Mapping & Handlers
- **Double-Click Canvas**: Spawns next sequential aircraft (`T1`, `T2`...), calculates azimuth to SAM site, and sets aircraft heading directly toward the site.
- **Aircraft Selection & Dragging**: Mouse down on target enables drag mode; live recalculation of bearing/range; updates coordinates on mouse up.
- **Interactive Compass Dial**: User drags the compass indicator on the target widget or uses +/- buttons to adjust heading smoothly between 0–359°.
- **Fire Trigger**: Evaluates simultaneous missile limit, picks next ready launcher sequentially, initializes missile flight vector, logs initial radar zone, and puts launcher into reload mode upon depletion.
- **Terminate Trigger**: Manually aborts currently targeted/selected missile, logs event as 'TERMINATE'.
- **GPX Generator**: Formats compliant GPX 1.1 with `<trk>`, `<trkseg>`, and `<trkpt lat="..." lon="...">` with `<ele>`, `<time>`, and `<extensions>` containing aircraft identification and telemetry.
