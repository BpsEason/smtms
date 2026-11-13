export const EMPTY_TEXT = "—";

const taiwanDateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const taiwanDateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatTaiwanDate(value: string | null | undefined): string {
  if (!value) {
    return EMPTY_TEXT;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return EMPTY_TEXT;
  }
  return taiwanDateFormatter.format(date);
}

export function formatTaiwanDateTime(value: string | null | undefined): string {
  if (!value) {
    return EMPTY_TEXT;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return EMPTY_TEXT;
  }
  return taiwanDateTimeFormatter.format(date);
}

export function formatParty(
  name: string | null | undefined,
  code: string | null | undefined,
): string | null {
  if (name && code) {
    return `${name} (${code})`;
  }
  return name ?? code ?? null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return EMPTY_TEXT;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatHistoryPayload(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return EMPTY_TEXT;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return EMPTY_TEXT;
    }
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function getStatusColor(status: string): "success" | "warning" | "error" | "processing" | "default" {
  const normalized = status.toLowerCase();
  if (["active", "available", "passed", "released", "approved", "complete", "completed", "closed"].includes(normalized)) {
    return "success";
  }
  if (["pending", "hold", "quarantine", "received", "in_progress", "pending_confirmation"].includes(normalized)) {
    return "warning";
  }
  if (["failed", "rejected", "inactive", "blocked", "returned"].includes(normalized)) {
    return "error";
  }
  if (normalized === "investigating") {
    return "processing";
  }
  return "default";
}