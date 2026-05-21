// Lightweight wrapper around the browser Notification API. In Tauri webview
// this surfaces native OS notifications; in a regular browser it falls back to
// the standard web notification banner. Permission is requested lazily.

let permissionPromise: Promise<NotificationPermission> | null = null;

function ensurePermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return Promise.resolve("denied" as NotificationPermission);
  }
  if (Notification.permission === "granted") {
    return Promise.resolve("granted");
  }
  if (Notification.permission === "denied") {
    return Promise.resolve("denied");
  }
  if (permissionPromise) return permissionPromise;
  permissionPromise = Notification.requestPermission().catch(
    () => "denied" as NotificationPermission,
  );
  return permissionPromise;
}

export async function notify(title: string, body?: string): Promise<void> {
  try {
    const permission = await ensurePermission();
    if (permission !== "granted") return;
    new Notification(title, { body });
  } catch {
    // ignore notification failures silently
  }
}

export function primeNotificationPermission(): void {
  void ensurePermission();
}
