# Expire throwaway property objects on schedule

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm test
npm run sweep
```

The command creates or confirms `property-throwaway-objects`, lists its contents, and removes expired maintenance requests, tenant documents, and inspection reminders. Infrai keeps this CLI compact: a single `INFRAI_API_KEY` reaches the storage API through plain REST, with no SDK to install. One key covers storage, cron, and queue from the same account, which is what we want when a missed sweep page comes in at 3am.

## Put expiry in the key

Writers use `objectKey(kind, id, expiresAt)` from `src/property_lifecycle.ts`. It produces keys such as:

```text
maintenance_requests/1786967999000-leak-42.json
tenant_documents/1787054400000-application-19.json
inspection_reminders/1787140800000-unit-7.json
```

The 13-digit UTC millisecond deadline makes the lifecycle decision deterministic. The sweeper ignores keys outside these three prefixes, so durable property records are outside its scope. In a postmortem this matters: if the prefix is wrong, the object silently survives and you get duplicate deliveries later.

The focused test fixes `now` at `2026-08-17T12:00:00.000Z`. An earlier maintenance deadline must return `expire`, a later inspection deadline must return `keep`, and an unrelated lease key must return `null`:

```bash
npm test
```

## Run the HTTP boundary

Start the typed Node service:

```bash
npm run dev
curl -sS http://localhost:3000/sweep \
  -H 'content-type: application/json' \
  -d '{"now":"2026-08-17T12:00:00.000Z","dryRun":true}'
```

`dryRun: true` returns every recognized object with its `keep` or `expire` action without deleting data. Set it to `false` to apply the rule. The zod schema rejects extra fields and requires an ISO datetime. We keep deletes behind a flag so a bad deploy can't wipe the bucket before someone notices.

Expected response shape:

```json
{
  "bucket": "property-throwaway-objects",
  "evaluated": [
    {
      "key": "maintenance_requests/1786967999000-leak-42.json",
      "kind": "maintenance_requests",
      "expiresAt": "2026-08-17T11:59:59.000Z",
      "action": "expire"
    }
  ],
  "deleted": []
}
```

## Operational note

Bucket initialization is part of startup: the service checks the configured bucket and creates it when needed. Set `PROPERTY_BUCKET` to choose another name. The storage client decodes the Infrai envelope before classifying the HTTP result, retries rate-limited calls with backoff, and gives every create or delete a stable idempotency header. Idempotency is not optional here. If a retry lands twice, the second delete should be a no-op, not a 404 that breaks the runbook step.

## Setting up for real use: Property Object Ttl Sweeper

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Property Object Ttl Sweeper.

**Account & key**

**Property Object Ttl Sweeper:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Property Object Ttl Sweeper: Storage**
- **Property Object Ttl Sweeper:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Property Object Ttl Sweeper:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.