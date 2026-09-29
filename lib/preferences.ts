export const currencies = ["AUD", "USD", "EUR", "GBP", "NZD", "CAD"] as const;
export type Currency = (typeof currencies)[number];
export type DistanceUnit = "m" | "yd";
export type SpeedUnit = "mph" | "kmh";

export type UserPreferences = {
  currency: Currency;
  distanceUnit: DistanceUnit;
  speedUnit: SpeedUnit;
};

export const defaultPreferences: UserPreferences = {
  currency: "AUD",
  distanceUnit: "m",
  speedUnit: "mph",
};

export const distanceLabel = (unit: DistanceUnit) => unit === "m" ? "m" : "yd";
export const speedLabel = (unit: SpeedUnit) => unit === "mph" ? "mph" : "km/h";

export function displayDistance(metres: number | undefined, unit: DistanceUnit) {
  if (metres === undefined) return undefined;
  return unit === "yd" ? metres * 1.0936133 : metres;
}

export function storeDistance(value: number, unit: DistanceUnit) {
  return unit === "yd" ? value / 1.0936133 : value;
}

export function displaySpeed(mph: number | undefined, unit: SpeedUnit) {
  if (mph === undefined) return undefined;
  return unit === "kmh" ? mph * 1.609344 : mph;
}

export function storeSpeed(value: number, unit: SpeedUnit) {
  return unit === "kmh" ? value / 1.609344 : value;
}

export function rounded(value: number | undefined, digits = 1) {
  return value === undefined ? undefined : Number(value.toFixed(digits));
}

export function formatCurrency(value: number, currency: Currency) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
