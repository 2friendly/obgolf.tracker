import { clubMetricSchema, distanceFields, metricFields, type ClubMetric, type MetricField } from './club-import.ts';
import { displayDistance, displaySpeed, storeDistance, storeSpeed, type UserPreferences } from './preferences.ts';

export type ShotMetricField = MetricField | 'attackAngle' | 'clubPath' | 'faceAngle' | 'faceToPath';
export type ShotColumn = ShotMetricField | 'notes';
export const shotMetricFields: ShotMetricField[] = [...metricFields, 'attackAngle', 'clubPath', 'faceAngle', 'faceToPath'];
export const shotMetricLabels: Record<ShotMetricField, string> = {
  carry: 'Carry', total: 'Total distance', clubSpeed: 'Club speed', ballSpeed: 'Ball speed',
  smash: 'Smash', launch: 'Launch', spin: 'Backspin', sideSpin: 'Sidespin',
  offline: 'Offline', horizontalLaunch: 'Horizontal launch', apex: 'Peak height', distanceToPin: 'Distance to pin',
  attackAngle: 'Attack angle', clubPath: 'Club path', faceAngle: 'Face angle', faceToPath: 'Face-to-path',
};
export const shotPresets = {
  Basic: ['carry', 'clubSpeed', 'ballSpeed', 'smash'],
  Standard: ['carry', 'total', 'clubSpeed', 'ballSpeed', 'smash', 'launch', 'spin'],
  Advanced: shotMetricFields,
} satisfies Record<string, ShotColumn[]>;
export type ShotPreset = keyof typeof shotPresets | 'Custom';
export type ShotEntrySettings = { preset: ShotPreset; custom: ShotColumn[] };
export const defaultShotSettings: ShotEntrySettings = { preset: 'Standard', custom: [...shotPresets.Standard] };
export const shotColumns = (settings: ShotEntrySettings): ShotColumn[] => settings.preset === 'Custom' ? settings.custom : shotPresets[settings.preset];
/** Browser preferences are untrusted and older versions may contain removed fields. */
export function parseShotSettings(value: string | null): ShotEntrySettings {
  try {
    const parsed = JSON.parse(value ?? 'null');
    if (!parsed || !['Basic', 'Standard', 'Advanced', 'Custom'].includes(parsed.preset)) return defaultShotSettings;
    const custom = Array.isArray(parsed.custom) ? [...new Set<ShotColumn>(parsed.custom.filter((field: ShotColumn) => [...shotMetricFields, 'notes'].includes(field)))] : [];
    return { preset: parsed.preset, custom: custom.length ? custom : [...shotPresets.Standard] };
  } catch { return defaultShotSettings; }
}
export const isShotSpeed = (field: ShotMetricField) => field === 'clubSpeed' || field === 'ballSpeed';
/** Explicit observations take priority. Derived smash is never written over raw data. */
export function practiceSmash(reading: Pick<ClubMetric, 'smash' | 'clubSpeed' | 'ballSpeed'>) {
  if (reading.smash !== undefined) return reading.smash;
  if (!reading.clubSpeed || reading.ballSpeed === undefined) return undefined;
  const ratio = reading.ballSpeed / reading.clubSpeed;
  return clubMetricSchema.shape.smash.safeParse(ratio).success ? ratio : undefined;
}
export function shotDisplayValue(field: ShotMetricField, value: number | undefined, preferences: UserPreferences) {
  return distanceFields.includes(field) ? displayDistance(value, preferences.distanceUnit) : isShotSpeed(field) ? displaySpeed(value, preferences.speedUnit) : value;
}
export function shotStoredValue(field: ShotMetricField, text: string, preferences: UserPreferences) {
  if (!text.trim()) return undefined;
  const value = Number(text);
  return distanceFields.includes(field) ? storeDistance(value, preferences.distanceUnit) : isShotSpeed(field) ? storeSpeed(value, preferences.speedUnit) : value;
}
export function shotHasData(shot: ClubMetric) {
  return shotMetricFields.some(field => shot[field] !== undefined) || !!shot.notes?.trim();
}
