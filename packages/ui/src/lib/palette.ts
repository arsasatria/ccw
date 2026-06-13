// 9 warm swatches. No neon, no purple. Each is a 2-stop linear gradient.
export const SWATCHES: { name: string; from: string; to: string }[] = [
  { name: "honey",  from: "oklch(0.92 0.05 80)",  to: "oklch(0.78 0.09 70)" },
  { name: "amber",  from: "oklch(0.85 0.09 65)",  to: "oklch(0.65 0.13 50)" },
  { name: "rose",   from: "oklch(0.85 0.06 35)",  to: "oklch(0.65 0.12 25)" },
  { name: "clay",   from: "oklch(0.78 0.05 50)",  to: "oklch(0.55 0.1 40)" },
  { name: "moss",   from: "oklch(0.78 0.06 130)", to: "oklch(0.55 0.1 140)" },
  { name: "sage",   from: "oklch(0.85 0.04 150)", to: "oklch(0.65 0.07 155)" },
  { name: "ocean",  from: "oklch(0.75 0.06 220)", to: "oklch(0.5 0.1 230)" },
  { name: "dusk",   from: "oklch(0.65 0.06 280)", to: "oklch(0.4 0.08 290)" },
  { name: "graphite", from: "oklch(0.55 0.005 60)", to: "oklch(0.35 0.008 60)" },
];

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function swatchFor(seed: string): { from: string; to: string; name: string } {
  return SWATCHES[hash(seed) % SWATCHES.length];
}
