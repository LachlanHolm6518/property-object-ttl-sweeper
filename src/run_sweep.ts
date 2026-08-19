import { storageFromEnvironment } from "./infrai_storage.js";
import { ensurePropertyBucket, sweepPropertyObjects } from "./property_sweeper.js";

const bucket = process.env.PROPERTY_BUCKET ?? "property-throwaway-objects";
const storage = storageFromEnvironment();
await ensurePropertyBucket(storage, bucket);
const result = await sweepPropertyObjects(storage, bucket, new Date(), false);
console.log(JSON.stringify(result, null, 2));
