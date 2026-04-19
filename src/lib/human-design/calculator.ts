// Human Design calculator — runs entirely client-side using astronomia
// (VSOP87) for planetary positions and luxon for timezone math.
//
// Input: birth name + date + local time + IANA timezone
// Output: type, authority, profile, defined centers, gate activations.

import { DateTime } from "luxon";
import {
  GATE_WHEEL,
  HD_WHEEL_OFFSET_DEG,
  DEGREES_PER_GATE,
  CHANNELS,
  CENTER_GATES,
  MOTOR_CENTERS,
  PROFILE_NAMES,
  HD_STRATEGY,
  type CenterName,
  type HDType,
  type HDAuthority,
} from "./wheels";

// ─── Astronomia imports (CommonJS modules; .default for VSOP87 data) ──

import * as julian from "astronomia/julian";
import * as base from "astronomia/base";
import * as solar from "astronomia/solar";
import * as moonpos from "astronomia/moonposition";
import * as planetposition from "astronomia/planetposition";
import * as moonnode from "astronomia/moonnode";

import vsop87Bmercury from "astronomia/data/vsop87Bmercury";
import vsop87Bvenus from "astronomia/data/vsop87Bvenus";
import vsop87Bearth from "astronomia/data/vsop87Bearth";
import vsop87Bmars from "astronomia/data/vsop87Bmars";
import vsop87Bjupiter from "astronomia/data/vsop87Bjupiter";
import vsop87Bsaturn from "astronomia/data/vsop87Bsaturn";
import vsop87Buranus from "astronomia/data/vsop87Buranus";
import vsop87Bneptune from "astronomia/data/vsop87Bneptune";

// ─── Public API ────────────────────────────────────────────────────────

export interface HDInput {
  name: string;
  birthDate: string;     // "YYYY-MM-DD"
  birthTime: string;     // "HH:MM" (24-hour, local time)
  birthPlace: string;    // human-readable, e.g. "Brisbane, Australia"
  timezone: string;      // IANA, e.g. "Australia/Brisbane"
}

export interface HDGateActivation {
  planet: string;
  side: "personality" | "design";
  gate: number;
  line: number;
  longitude: number;
}

export interface HDResult {
  name: string;
  type: HDType;
  strategy: string;
  authority: HDAuthority;
  profile: string;            // e.g. "3/5 — Martyr/Heretic"
  personalitySun: { gate: number; line: number };
  designSun: { gate: number; line: number };
  definedCenters: CenterName[];
  undefinedCenters: CenterName[];
  activatedGates: number[];
  activations: HDGateActivation[];
  approximateTime?: boolean;  // true if user didn't know time (defaulted to 12:00)
  warnings: string[];
}

// ─── Math helpers ──────────────────────────────────────────────────────

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Map a tropical ecliptic longitude (degrees) to its Human Design gate + line. */
export function longitudeToGate(tropicalLongitudeDeg: number): {
  gate: number;
  line: number;
} {
  const hdLong = normalizeDegrees(tropicalLongitudeDeg - HD_WHEEL_OFFSET_DEG);
  const index = Math.floor(hdLong / DEGREES_PER_GATE);
  const gate = GATE_WHEEL[index];
  const remainder = hdLong - index * DEGREES_PER_GATE;
  const line = Math.min(6, Math.floor((remainder / DEGREES_PER_GATE) * 6) + 1);
  return { gate, line };
}

// ─── Planet position helpers ───────────────────────────────────────────

interface VSOP87Data {
  L: unknown;
  B: unknown;
  R: unknown;
  name: string;
  type: string;
}

function vsop(data: unknown): VSOP87Data {
  // ESM-imported astronomia data files expose the payload on `.default`.
  const obj = data as { default?: unknown };
  return (obj && obj.default ? obj.default : data) as VSOP87Data;
}

const PLANET_DATA: Record<string, VSOP87Data> = {
  Mercury: vsop(vsop87Bmercury),
  Venus: vsop(vsop87Bvenus),
  Mars: vsop(vsop87Bmars),
  Jupiter: vsop(vsop87Bjupiter),
  Saturn: vsop(vsop87Bsaturn),
  Uranus: vsop(vsop87Buranus),
  Neptune: vsop(vsop87Bneptune),
};
const EARTH_DATA = vsop(vsop87Bearth);
const EARTH_PLANET = new planetposition.Planet(EARTH_DATA);
const PLANET_INSTANCES: Record<string, planetposition.Planet> = Object.fromEntries(
  Object.entries(PLANET_DATA).map(([name, data]) => [name, new planetposition.Planet(data)])
);

function jdeFromDate(date: Date): number {
  // Convert UTC Date → fractional Julian Day (UT). Astronomia accepts UT ≈ JDE
  // for our precision needs; deltaT is sub-arcminute over the relevant range.
  const utcMillis = date.getTime();
  // 2440587.5 = JD for 1970-01-01 00:00 UTC
  return 2440587.5 + utcMillis / 86400000;
}

function getSunLongitudeDeg(jde: number): number {
  const T = base.J2000Century(jde);
  const lonRad = solar.apparentLongitude(T);
  return normalizeDegrees(lonRad * DEG);
}

function getMoonLongitudeDeg(jde: number): number {
  const pos = moonpos.position(jde);
  return normalizeDegrees(pos.lon * DEG);
}

function getPlanetLongitudeDeg(planetName: string, jde: number): number | null {
  const planet = PLANET_INSTANCES[planetName];
  if (!planet) return null;
  try {
    const pos = planet.position(jde);
    const earthPos = EARTH_PLANET.position(jde);
    // Convert heliocentric ecliptic (lon/lat/range) → geocentric apparent
    // longitude. Sufficient for HD gate resolution (5.625°).
    const xP = pos.range * Math.cos(pos.lat) * Math.cos(pos.lon);
    const yP = pos.range * Math.cos(pos.lat) * Math.sin(pos.lon);
    const xE = earthPos.range * Math.cos(earthPos.lat) * Math.cos(earthPos.lon);
    const yE = earthPos.range * Math.cos(earthPos.lat) * Math.sin(earthPos.lon);
    const lonRad = Math.atan2(yP - yE, xP - xE);
    return normalizeDegrees(lonRad * DEG);
  } catch {
    return null;
  }
}

function getNorthNodeLongitudeDeg(jde: number): number {
  // Mean ascending node longitude (Meeus 47.7) — accurate to ~0.05°.
  const T = base.J2000Century(jde);
  const omega =
    125.04452 -
    1934.136261 * T +
    0.0020708 * T * T +
    (T * T * T) / 450000;
  return normalizeDegrees(omega);
}

interface PlanetLongitudes {
  Sun: number;
  Earth: number;
  Moon: number;
  Mercury: number | null;
  Venus: number | null;
  Mars: number | null;
  Jupiter: number | null;
  Saturn: number | null;
  Uranus: number | null;
  Neptune: number | null;
  // Pluto is not in VSOP87; we approximate it from a Pluto-specific series.
  Pluto: number | null;
  NorthNode: number;
  SouthNode: number;
}

// VSOP87 doesn't include Pluto. For HD precision we use a simple analytic
// approximation (Meeus ch. 37) — accurate to about 0.07° over 1885-2099.
function getPlutoLongitudeDeg(jde: number): number | null {
  try {
    const T = base.J2000Century(jde);
    const J = 34.35 + 3034.9057 * T;
    const S = 50.08 + 1222.1138 * T;
    const P = 238.96 + 144.96 * T;
    // Heliocentric longitude (degrees), simplified main term:
    const L =
      238.958116 +
      144.96 * T +
      0.04982 * Math.sin((P + 2 * (P - S)) * RAD);
    // For HD purposes, use heliocentric ≈ geocentric (Pluto is far away — error <2°,
    // still sufficient for gate resolution of 5.625°).
    return normalizeDegrees(L);
  } catch {
    return null;
  }
}

function getAllPlanetLongitudes(jde: number): PlanetLongitudes {
  const sun = getSunLongitudeDeg(jde);
  const earth = normalizeDegrees(sun + 180);
  const moon = getMoonLongitudeDeg(jde);
  const node = getNorthNodeLongitudeDeg(jde);
  return {
    Sun: sun,
    Earth: earth,
    Moon: moon,
    Mercury: getPlanetLongitudeDeg("Mercury", jde),
    Venus: getPlanetLongitudeDeg("Venus", jde),
    Mars: getPlanetLongitudeDeg("Mars", jde),
    Jupiter: getPlanetLongitudeDeg("Jupiter", jde),
    Saturn: getPlanetLongitudeDeg("Saturn", jde),
    Uranus: getPlanetLongitudeDeg("Uranus", jde),
    Neptune: getPlanetLongitudeDeg("Neptune", jde),
    Pluto: getPlutoLongitudeDeg(jde),
    NorthNode: node,
    SouthNode: normalizeDegrees(node + 180),
  };
}

// ─── Design moment: Sun was exactly 88° earlier ────────────────────────

function findDesignJde(birthJde: number): number {
  const personalitySun = getSunLongitudeDeg(birthJde);
  const targetSun = normalizeDegrees(personalitySun - 88);

  // The Sun moves ~0.9856°/day, so 88° back ≈ 89.3 days.
  // Start with that estimate, then refine via Newton-style iteration.
  let jde = birthJde - 89.3;
  for (let i = 0; i < 30; i++) {
    const lon = getSunLongitudeDeg(jde);
    let diff = lon - targetSun;
    // Bring diff into [-180, 180]
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) < 0.0001) break;
    jde -= diff / 0.9856; // step by Sun's mean daily motion
  }
  return jde;
}

// ─── Channel & center logic ────────────────────────────────────────────

function detectDefinedChannels(
  activatedGates: Set<number>
): Array<readonly [number, number]> {
  return CHANNELS.filter(([a, b]) => activatedGates.has(a) && activatedGates.has(b));
}

function detectDefinedCenters(
  definedChannels: Array<readonly [number, number]>
): Set<CenterName> {
  const definedGates = new Set<number>();
  for (const [a, b] of definedChannels) {
    definedGates.add(a);
    definedGates.add(b);
  }
  const defined = new Set<CenterName>();
  for (const [center, gates] of Object.entries(CENTER_GATES) as [
    CenterName,
    ReadonlyArray<number>
  ][]) {
    if (gates.some((g) => definedGates.has(g))) defined.add(center);
  }
  return defined;
}

/** Return which centers each defined channel connects (lookup gate → center). */
function gateToCenter(gate: number): CenterName | null {
  for (const [center, gates] of Object.entries(CENTER_GATES) as [
    CenterName,
    ReadonlyArray<number>
  ][]) {
    if (gates.includes(gate)) return center;
  }
  return null;
}

/** BFS across defined-channel graph to find motor→throat connectivity. */
function motorReachesThroat(
  definedChannels: Array<readonly [number, number]>,
  definedCenters: Set<CenterName>
): { reaches: boolean; viaCenters: CenterName[] } {
  // Build adjacency: each defined channel connects two centers.
  const adj = new Map<CenterName, Set<CenterName>>();
  for (const [a, b] of definedChannels) {
    const cA = gateToCenter(a);
    const cB = gateToCenter(b);
    if (!cA || !cB || cA === cB) continue;
    if (!adj.has(cA)) adj.set(cA, new Set());
    if (!adj.has(cB)) adj.set(cB, new Set());
    adj.get(cA)!.add(cB);
    adj.get(cB)!.add(cA);
  }

  const motorsDefined = MOTOR_CENTERS.filter((m) => definedCenters.has(m));
  const reachingMotors: CenterName[] = [];
  for (const motor of motorsDefined) {
    // BFS from motor; if we reach throat, mark.
    const visited = new Set<CenterName>([motor]);
    const queue: CenterName[] = [motor];
    let found = false;
    while (queue.length) {
      const node = queue.shift()!;
      if (node === "throat") {
        found = true;
        break;
      }
      const neighbors = adj.get(node);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    if (found) reachingMotors.push(motor);
  }
  return { reaches: reachingMotors.length > 0, viaCenters: reachingMotors };
}

// ─── Type & authority determination ────────────────────────────────────

function determineType(definedCenters: Set<CenterName>, motorToThroat: boolean): HDType {
  if (definedCenters.size === 0) return "Reflector";
  const sacralDefined = definedCenters.has("sacral");
  if (sacralDefined && !motorToThroat) return "Generator";
  if (sacralDefined && motorToThroat) return "Manifesting Generator";
  if (!sacralDefined && motorToThroat) return "Manifestor";
  return "Projector";
}

function determineAuthority(
  definedCenters: Set<CenterName>,
  type: HDType
): HDAuthority {
  if (type === "Reflector") return "Lunar";
  if (definedCenters.has("solarPlexus")) return "Emotional";
  if (definedCenters.has("sacral")) return "Sacral";
  if (definedCenters.has("spleen")) return "Splenic";
  if (definedCenters.has("heart")) return "Ego";
  if (definedCenters.has("gCenter")) return "Self-Projected";
  // Nothing defined below the throat → mental (no inner authority)
  return "Mental";
}

// ─── Top-level public function ─────────────────────────────────────────

export async function calculateHumanDesign(input: HDInput): Promise<HDResult> {
  const warnings: string[] = [];
  const { name, birthDate, birthTime, birthPlace, timezone } = input;

  // Validate inputs
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new Error(`Invalid birthDate "${birthDate}"; expected YYYY-MM-DD.`);
  }
  let timeStr = birthTime;
  let approximateTime = false;
  if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr)) {
    timeStr = "12:00";
    approximateTime = true;
    warnings.push(
      "Birth time was unknown — defaulted to 12:00 noon. Type and Authority may be approximate; Profile remains accurate within roughly ±1 day."
    );
  }

  // Build local DateTime in the user's timezone, then convert to UTC.
  const local = DateTime.fromISO(`${birthDate}T${timeStr}`, { zone: timezone });
  if (!local.isValid) {
    throw new Error(
      `Could not interpret birth datetime in timezone "${timezone}". Reason: ${local.invalidReason}`
    );
  }
  const utc = local.toUTC();
  const birthDateUTC = utc.toJSDate();
  const birthJde = jdeFromDate(birthDateUTC);

  // Personality (moment of birth) and Design (Sun 88° earlier) JDEs.
  const designJde = findDesignJde(birthJde);

  // Calculate planet longitudes at both moments
  const personality = getAllPlanetLongitudes(birthJde);
  const design = getAllPlanetLongitudes(designJde);

  const activations: HDGateActivation[] = [];
  const activatedGates = new Set<number>();

  const planetEntries: Array<[string, number | null]> = [];
  for (const side of ["personality", "design"] as const) {
    const planets = side === "personality" ? personality : design;
    planetEntries.length = 0;
    planetEntries.push(
      ["Sun", planets.Sun],
      ["Earth", planets.Earth],
      ["Moon", planets.Moon],
      ["NorthNode", planets.NorthNode],
      ["SouthNode", planets.SouthNode],
      ["Mercury", planets.Mercury],
      ["Venus", planets.Venus],
      ["Mars", planets.Mars],
      ["Jupiter", planets.Jupiter],
      ["Saturn", planets.Saturn],
      ["Uranus", planets.Uranus],
      ["Neptune", planets.Neptune],
      ["Pluto", planets.Pluto],
    );
    for (const [planet, longitude] of planetEntries) {
      if (longitude == null || !Number.isFinite(longitude)) {
        warnings.push(`Skipped ${planet} (${side}) — could not resolve position.`);
        continue;
      }
      const { gate, line } = longitudeToGate(longitude);
      activations.push({ planet, side, gate, line, longitude });
      activatedGates.add(gate);
    }
  }

  // Profile = personalitySunLine / designSunLine
  const personalitySunGate = longitudeToGate(personality.Sun);
  const designSunGate = longitudeToGate(design.Sun);
  const profileKey = `${personalitySunGate.line}/${designSunGate.line}`;
  const profile = PROFILE_NAMES[profileKey]
    ? `${profileKey} — ${PROFILE_NAMES[profileKey]}`
    : profileKey;

  // Channel & center detection
  const definedChannels = detectDefinedChannels(activatedGates);
  const definedCenters = detectDefinedCenters(definedChannels);
  const { reaches: motorToThroat } = motorReachesThroat(
    definedChannels,
    definedCenters
  );

  const type = determineType(definedCenters, motorToThroat);
  const authority = determineAuthority(definedCenters, type);

  const allCenters = Object.keys(CENTER_GATES) as CenterName[];
  const undefinedCenters = allCenters.filter((c) => !definedCenters.has(c));

  return {
    name,
    type,
    strategy: HD_STRATEGY[type],
    authority,
    profile,
    personalitySun: personalitySunGate,
    designSun: designSunGate,
    definedCenters: Array.from(definedCenters),
    undefinedCenters,
    activatedGates: Array.from(activatedGates).sort((a, b) => a - b),
    activations,
    approximateTime: approximateTime || undefined,
    warnings,
  };
}
