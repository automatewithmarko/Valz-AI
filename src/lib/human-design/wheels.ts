// Human Design constants — gate wheel, channels, centers, type/authority logic.

// Standard HD gate sequence in tropical-zodiac order, starting at the
// beginning of gate 41 (~302° tropical longitude, i.e. 2°00' Aquarius).
// Each gate spans 5.625° (= 360° / 64).
export const GATE_WHEEL = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42,  3,
  27, 24,  2, 23,  8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56,
  31, 33,  7,  4, 29, 59, 40, 64, 47,  6, 46, 18, 48, 57, 32, 50,
  28, 44,  1, 43, 14, 34,  9,  5, 26, 11, 10, 58, 38, 54, 61, 60,
] as const;

// Tropical longitude (deg) where gate 41 (index 0 of the wheel) begins.
export const HD_WHEEL_OFFSET_DEG = 302;
export const DEGREES_PER_GATE = 5.625;

// All 36 Human Design channels — pairs of gates that, when both are
// activated, define both connected centers.
export const CHANNELS: ReadonlyArray<readonly [number, number]> = [
  [1, 8], [2, 14], [3, 60], [4, 63], [5, 15], [6, 59], [7, 31], [9, 52],
  [10, 20], [10, 34], [10, 57], [11, 56], [12, 22], [13, 33], [16, 48],
  [17, 62], [18, 58], [19, 49], [20, 34], [20, 57], [21, 45], [23, 43],
  [24, 61], [25, 51], [26, 44], [27, 50], [28, 38], [29, 46], [30, 41],
  [32, 54], [34, 57], [35, 36], [39, 55], [40, 37], [47, 64], [46, 29],
];

export type CenterName =
  | "head"
  | "ajna"
  | "throat"
  | "gCenter"
  | "heart"
  | "sacral"
  | "solarPlexus"
  | "spleen"
  | "root";

export const CENTER_GATES: Record<CenterName, ReadonlyArray<number>> = {
  head: [64, 61, 63],
  ajna: [47, 24, 4, 17, 11, 43],
  throat: [62, 23, 56, 35, 12, 45, 33, 8, 31, 20, 16],
  gCenter: [1, 2, 7, 13, 10, 15, 25, 46],
  heart: [21, 40, 26, 51],
  sacral: [5, 14, 29, 59, 9, 3, 42, 27, 34],
  solarPlexus: [6, 37, 22, 36, 30, 55, 49],
  spleen: [48, 57, 44, 50, 32, 28, 18],
  root: [58, 38, 54, 53, 60, 52, 19, 39, 41],
};

// Motor centers — each can power the throat for type determination.
export const MOTOR_CENTERS: ReadonlyArray<CenterName> = [
  "sacral",
  "root",
  "solarPlexus",
  "heart",
];

// Profile names by line pair, e.g. "1/3" → "Investigator/Martyr"
export const PROFILE_NAMES: Record<string, string> = {
  "1/3": "Investigator/Martyr",
  "1/4": "Investigator/Opportunist",
  "2/4": "Hermit/Opportunist",
  "2/5": "Hermit/Heretic",
  "3/5": "Martyr/Heretic",
  "3/6": "Martyr/Role Model",
  "4/1": "Opportunist/Investigator",
  "4/6": "Opportunist/Role Model",
  "5/1": "Heretic/Investigator",
  "5/2": "Heretic/Hermit",
  "6/2": "Role Model/Hermit",
  "6/3": "Role Model/Martyr",
};

export type HDType =
  | "Manifestor"
  | "Generator"
  | "Manifesting Generator"
  | "Projector"
  | "Reflector";

export type HDAuthority =
  | "Emotional"
  | "Sacral"
  | "Splenic"
  | "Ego"
  | "Self-Projected"
  | "Mental"
  | "Lunar";

export const HD_STRATEGY: Record<HDType, string> = {
  Manifestor: "Inform before you act",
  Generator: "Wait to respond",
  "Manifesting Generator": "Respond, then move fast",
  Projector: "Wait for the invitation",
  Reflector: "Wait a lunar cycle",
};
