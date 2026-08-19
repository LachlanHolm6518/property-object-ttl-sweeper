export const PROPERTY_KINDS = [
  "maintenance_requests",
  "tenant_documents",
  "inspection_reminders",
] as const;

export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export type LifecycleDecision = {
  key: string;
  kind: PropertyKind;
  expiresAt: string;
  action: "keep" | "expire";
};

const KEY_PATTERN = /^(maintenance_requests|tenant_documents|inspection_reminders)\/(\d{13})-[A-Za-z0-9_-]+\.json$/;

export function objectKey(
  kind: PropertyKind,
  id: string,
  expiresAt: Date,
): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Object id must be URL-safe");
  return `${kind}/${expiresAt.getTime()}-${id}.json`;
}

export function lifecycleDecision(key: string, now: Date): LifecycleDecision | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const expiresAt = new Date(Number(match[2]));
  return {
    key,
    kind: match[1] as PropertyKind,
    expiresAt: expiresAt.toISOString(),
    action: expiresAt.getTime() <= now.getTime() ? "expire" : "keep",
  };
}
