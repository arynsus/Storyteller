// Deterministically maps an arbitrary config object to a color from a fixed
// palette, so rows sharing the same config show the same swatch and an
// outlier config is visually obvious at a glance.
const PALETTE = [
    "#7c6cff", // st-accent
    "#37d39b", // st-success
    "#ffb020", // st-warning
    "#ff5c72", // st-danger
    "#4fd1ff",
    "#f472b6",
    "#facc15",
    "#34d399",
    "#a78bfa",
    "#fb923c",
];

export function colorForConfig(payload: unknown): string {
    const str = JSON.stringify(payload) ?? "";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
}
