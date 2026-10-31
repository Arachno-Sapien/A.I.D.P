import type { Theme } from "../../lib/bindings";

/**
 * Every theme's colours, in one place (decision 0020). Components keep their
 * Tailwind classes (`bg-neutral-950`, `text-neutral-100`, `bg-accent`); a theme
 * redefines the variables behind them. Effects colour alone can't give live in
 * `src/themes.css`, keyed by `data-theme`.
 */
export type ThemeId = Exclude<Theme, "system">;

export interface ThemeSpec {
  label: string;
  /** Which editor and terminal colours go with it. */
  base: "dark" | "light";
  /** For the picker: background, surface, accent. */
  swatch: [string, string, string];
  /** For see-through surfaces: the lightest colour behind them, for contrast checks. */
  backdrop?: string;
  vars: Record<string, string>;
}

const MONO = '"Cascadia Code", "JetBrains Mono", Consolas, monospace';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';

/** `--color-neutral-50` … `-950` from eleven hex colours, light end first. */
function ramp(colours: string[]): Record<string, string> {
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  return Object.fromEntries(steps.map((s, i) => [`--color-neutral-${s}`, colours[i]]));
}

/** Tailwind's own neutral greys: today's Dark look. */
const NEUTRAL = [
  "#fafafa", "#f5f5f5", "#e5e5e5", "#d4d4d4", "#a1a1a1", "#737373",
  "#525252", "#404040", "#262626", "#171717", "#0a0a0a",
];

/** On a light base, "white" text and status colours must be dark enough to read. */
const LIGHT_SWAPS = {
  "--color-black": "#ffffff",
  "--color-red-400": "#c10007",
  "--color-amber-400": "#bb4d00",
  "--color-green-400": "#008236",
};

export const THEMES: Record<ThemeId, ThemeSpec> = {
  dark: {
    label: "Dark",
    base: "dark",
    swatch: ["#0a0a0a", "#262626", "#4f46e5"],
    vars: {
      ...ramp(NEUTRAL),
      "--color-accent": "#4f46e5",
      "--color-accent-fg": "#ffffff",
      "--color-popup": "#171717",
    },
  },
  light: {
    label: "Light",
    base: "light",
    swatch: ["#fafafa", "#e5e5e5", "#4f46e5"],
    vars: {
      ...ramp([...NEUTRAL].reverse()),
      ...LIGHT_SWAPS,
      "--color-white": "#000000",
      "--color-popup": "#f5f5f5",
      "--color-accent": "#4f46e5",
      "--color-accent-fg": "#ffffff",
    },
  },
  glass: {
    label: "Glass",
    base: "dark",
    swatch: ["#0b0b16", "#3a1f6b", "#6d4aff"],
    // The lightest colour of the backdrop in src/themes.css; text may sit on it directly.
    backdrop: "#0b4757",
    vars: {
      // The three darkest steps are see-through (78–85%), so the backdrop shows.
      ...ramp([
        "#f9f8fd", "#f1f0fa", "#e2e0f2", "#cfcde6", "#b4b2d0", "#8e8cb0",
        "#6b6990", "#4a4870", "#2a2846d9", "#161628cc", "#0c0c18c7",
      ]),
      "--color-accent": "#6d4aff",
      // Solid: an open dropdown list is drawn over white.
      "--color-popup": "#161628",
      "--color-accent-fg": "#ffffff",
    },
  },
  soft: {
    label: "Soft",
    base: "dark",
    swatch: ["#24262b", "#33363d", "#5b5bd6"],
    vars: {
      ...ramp([
        "#f5f6f8", "#e8eaee", "#d6d9df", "#bfc3cb", "#a9adb6", "#8a8f99",
        "#6b707a", "#4a4e57", "#33363d", "#2a2c32", "#24262b",
      ]),
      "--color-accent": "#5b5bd6",
      "--color-popup": "#2a2c32",
      "--color-accent-fg": "#ffffff",
    },
  },
  cyber: {
    label: "Cyber",
    base: "dark",
    swatch: ["#05070f", "#111a30", "#00e5ff"],
    vars: {
      ...ramp([
        "#f4f9ff", "#e6f1ff", "#cfe0f7", "#a9c1e6", "#7f9cc8", "#4f6a9a",
        "#2c3f66", "#1d2a48", "#111a30", "#0a0f1e", "#05070f",
      ]),
      "--color-accent": "#00e5ff",
      "--color-popup": "#0a0f1e",
      "--color-accent-fg": "#001018",
      "--color-accent-2": "#ff2bd6",
      "--font-label": MONO,
    },
  },
  elegant: {
    label: "Elegant",
    base: "light",
    swatch: ["#fbf8f1", "#e9e2d3", "#0f5e5a"],
    vars: {
      ...ramp([
        "#16130f", "#231f19", "#332d25", "#463f35", "#5f574a", "#8c8270",
        "#b9ae98", "#d8cfbc", "#e9e2d3", "#f4efe4", "#fbf8f1",
      ]),
      ...LIGHT_SWAPS,
      "--color-black": "#fbf8f1",
      "--color-white": "#16130f",
      "--color-accent": "#0f5e5a",
      "--color-popup": "#f4efe4",
      "--color-accent-fg": "#fbf8f1",
      "--font-heading": SERIF,
    },
  },
};

function channels(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "");
  const byte = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [byte(0), byte(2), byte(4), h.length === 8 ? byte(6) / 255 : 1];
}

function luminance([r, g, b]: number[]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast of `fg` on `bg`; a see-through `bg` is first laid over `backdrop`. */
export function contrast(fg: string, bg: string, backdrop = "#000000"): number {
  const [r, g, b, alpha] = channels(bg);
  const [br, bgreen, bb] = channels(backdrop);
  const under = [
    r * alpha + br * (1 - alpha),
    g * alpha + bgreen * (1 - alpha),
    b * alpha + bb * (1 - alpha),
  ];
  const a = luminance(channels(fg));
  const c = luminance(under);
  return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
}
