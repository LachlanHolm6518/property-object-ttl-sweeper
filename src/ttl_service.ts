import { createServer } from "node:http";
import { z } from "zod";
import { InfraiError, storageFromEnvironment } from "./infrai_storage.js";
import { ensurePropertyBucket, sweepPropertyObjects } from "./property_sweeper.js";

const SweepBody = z.object({
  now: z.string().datetime(),
  dryRun: z.boolean().default(false),
}).strict();

const bucket = process.env.PROPERTY_BUCKET ?? "property-throwaway-objects";
const port = Number(process.env.PORT ?? "3000");
const storage = storageFromEnvironment();
const bucketReady = ensurePropertyBucket(storage, bucket);

function reply(response: import("node:http").ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/sweep") {
    reply(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = SweepBody.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    await bucketReady;
    const result = await sweepPropertyObjects(storage, bucket, new Date(input.now), input.dryRun);
    reply(response, 200, result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "invalid_request" });
      return;
    }
    if (error instanceof InfraiError) {
      reply(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
      });
      return;
    }
    reply(response, 500, { error: "service_error" });
  }
}).listen(port, () => {
  console.log(`property TTL service listening on http://localhost:${port}`);
});
