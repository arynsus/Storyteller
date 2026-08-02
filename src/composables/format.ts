/** Human-readable byte/duration/date formatting shared by History and Settings. */

export function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, exponent);
    return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

/** 1:04:07 for hour-long chapters, 4:07 for short ones. */
export function formatDuration(seconds?: number): string {
    if (!seconds || !Number.isFinite(seconds)) return "--:--";
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** Rounded-up total for a whole book: "12 h 40 min". */
export function formatLongDuration(seconds: number): string {
    if (!seconds || !Number.isFinite(seconds)) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function formatDate(timestamp?: number, locale?: string): string {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
