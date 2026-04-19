// Minimal ambient types for the subset of `astronomia` we use. The package
// ships no .d.ts files; only the calls we actually make are typed here.

declare module "astronomia/julian" {
  export function CalendarGregorianToJD(year: number, month: number, day: number): number;
  export function DateToJD(d: Date): number;
}

declare module "astronomia/base" {
  export function J2000Century(jde: number): number;
  export const J2000: number;
}

declare module "astronomia/solar" {
  export function apparentLongitude(T: number): number;
}

declare module "astronomia/moonposition" {
  export function position(jde: number): { lon: number; lat: number; range: number };
}

declare module "astronomia/planetposition" {
  export class Planet {
    constructor(data: unknown);
    position(jde: number): { lon: number; lat: number; range: number };
  }
}

declare module "astronomia/moonnode" {
  export function ascending(year: number): number;
  export function descending(year: number): number;
}

declare module "astronomia/data/vsop87Bmercury" {
  const data: { default?: unknown } & Record<string, unknown>;
  export default data;
}
declare module "astronomia/data/vsop87Bvenus" {
  const data: { default?: unknown } & Record<string, unknown>;
  export default data;
}
declare module "astronomia/data/vsop87Bearth" {
  const data: { default?: unknown } & Record<string, unknown>;
  export default data;
}
declare module "astronomia/data/vsop87Bmars" {
  const data: { default?: unknown } & Record<string, unknown>;
  export default data;
}
declare module "astronomia/data/vsop87Bjupiter" {
  const data: { default?: unknown } & Record<string, unknown>;
  export default data;
}
declare module "astronomia/data/vsop87Bsaturn" {
  const data: { default?: unknown } & Record<string, unknown>;
  export default data;
}
declare module "astronomia/data/vsop87Buranus" {
  const data: { default?: unknown } & Record<string, unknown>;
  export default data;
}
declare module "astronomia/data/vsop87Bneptune" {
  const data: { default?: unknown } & Record<string, unknown>;
  export default data;
}
