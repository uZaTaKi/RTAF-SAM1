import { SAMConfig, ShotLogEntry, SimulationTelemetrySample } from '../types/simulation';

const CONFIG_KEY = 'rtaf_sam1_config';
const SHOT_LOGS_KEY = 'rtaf_sam1_shot_logs';
const TELEMETRY_BUFFER_KEY = 'rtaf_sam1_telemetry_buffer';

export function saveSAMConfigToStorage(config: SAMConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Failed to save SAM config to localStorage:', err);
  }
}

export function loadSAMConfigFromStorage(): SAMConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load SAM config from localStorage:', err);
  }
  return null;
}

export function saveShotLogsToStorage(logs: ShotLogEntry[]) {
  try {
    localStorage.setItem(SHOT_LOGS_KEY, JSON.stringify(logs.slice(-200)));
  } catch (err) {
    console.warn('Failed to save shot logs to localStorage:', err);
  }
}

export function loadShotLogsFromStorage(): ShotLogEntry[] {
  try {
    const raw = localStorage.getItem(SHOT_LOGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load shot logs from localStorage:', err);
  }
  return [];
}

export function saveTelemetryBufferToStorage(samples: SimulationTelemetrySample[]) {
  try {
    // Keep last 15,000 samples (~1 hour at 4Hz)
    const slice = samples.slice(-15000);
    localStorage.setItem(TELEMETRY_BUFFER_KEY, JSON.stringify(slice));
  } catch (err) {
    console.warn('Failed to save telemetry buffer to localStorage:', err);
  }
}

export function loadTelemetryBufferFromStorage(): SimulationTelemetrySample[] {
  try {
    const raw = localStorage.getItem(TELEMETRY_BUFFER_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load telemetry buffer from localStorage:', err);
  }
  return [];
}

export function clearTelemetryBufferFromStorage() {
  try {
    localStorage.removeItem(TELEMETRY_BUFFER_KEY);
  } catch (err) {
    console.warn('Failed to clear telemetry buffer:', err);
  }
}
