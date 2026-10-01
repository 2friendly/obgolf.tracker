import { clubMetricSchema, distanceFields, type ClubMetric, type MetricField } from './club-import.ts';
import { displayDistance, displaySpeed, storeDistance, storeSpeed, type UserPreferences } from './preferences.ts';

export const shotMetricLabels: Record<MetricField, string> = {
  carry: 'Carry', total: 'Total distance', clubSpeed: 'Club speed', ballSpeed: 'Ball speed',
  smash: 'Smash', launch: 'Launch', spin: 'Backspin', sideSpin: 'Sidespin',
  offline: 'Offline', horizontalLaunch: 'Horizontal launch', apex: 'Peak height', distanceToPin: 'Distance to pin',
};
export const isShotSpeed = (field: MetricField) => field === 'clubSpeed' || field === 'ballSpeed';
/** Explicit observations take priority. Derived smash is never written over raw data. */
export function practiceSmash(reading: Pick<ClubMetric, 'smash' | 'clubSpeed' | 'ballSpeed'>) {
  if (reading.smash !== undefined) return reading.smash;
  if (!reading.clubSpeed || reading.ballSpeed === undefined) return undefined;
  const ratio = reading.ballSpeed / reading.clubSpeed;
  return clubMetricSchema.shape.smash.safeParse(ratio).success ? ratio : undefined;
}
export function shotDisplayValue(field: MetricField, value: number | undefined, preferences: UserPreferences) {
  return distanceFields.includes(field) ? displayDistance(value, preferences.distanceUnit) : isShotSpeed(field) ? displaySpeed(value, preferences.speedUnit) : value;
}
export function shotStoredValue(field: MetricField, text: string, preferences: UserPreferences) {
  if (!text.trim()) return undefined;
  const value = Number(text);
  return distanceFields.includes(field) ? storeDistance(value, preferences.distanceUnit) : isShotSpeed(field) ? storeSpeed(value, preferences.speedUnit) : value;
}
export function shotHasData(shot: ClubMetric) {
  return Object.keys(shotMetricLabels).some(field => shot[field as MetricField] !== undefined) || !!shot.notes?.trim();
}
