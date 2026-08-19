import { InfraiStorage } from "./infrai_storage.js";
import { lifecycleDecision, type LifecycleDecision } from "./property_lifecycle.js";

export type SweepResult = {
  bucket: string;
  evaluated: LifecycleDecision[];
  deleted: string[];
};

export async function ensurePropertyBucket(
  storage: InfraiStorage,
  bucket: string,
): Promise<void> {
  try {
    await storage.storage.bucket.get(bucket);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    await storage.storage.bucket.create(bucket);
  }
}

export async function sweepPropertyObjects(
  storage: InfraiStorage,
  bucket: string,
  now: Date,
  dryRun: boolean,
): Promise<SweepResult> {
  const { items } = await storage.storage.object.list(bucket);
  const evaluated = items
    .map(({ key }) => lifecycleDecision(key, now))
    .filter((decision): decision is LifecycleDecision => decision !== null);
  const deleted: string[] = [];

  for (const decision of evaluated) {
    if (decision.action !== "expire" || dryRun) continue;
    const head = await storage.storage.object.head(bucket, decision.key);
    if (!head.found) continue;
    await storage.storage.object.delete(bucket, decision.key);
    deleted.push(decision.key);
  }

  return { bucket, evaluated, deleted };
}
