---
name: intervals-icu-api
description: Reference for the Intervals.icu REST API (OpenAPI spec bundled). Use whenever adding, modifying, or verifying an Intervals.icu endpoint in the intervals-icu-client / intervals-icu-mcp-tools packages — to confirm exact paths, HTTP methods, required query params, request/response schemas, or auth. Always check the spec instead of guessing endpoint shapes.
---

# Intervals.icu API reference

The full official OpenAPI spec lives next to this file:

```
.claude/skills/intervals-icu-api/reference/openapi.json
```

(OpenAPI 3.0.1, Intervals.icu API v1, 116 paths, base URL `https://intervals.icu/api/v1`.)

**Never guess an Intervals.icu endpoint.** The public docs page is JS-rendered and not
fetchable; this bundled spec is the source of truth. Query it with the recipes below
before implementing or changing any client method.

## Authentication

- **HTTP Basic**: username is the literal string `API_KEY`, password is the account API
  key (from Intervals.icu settings). The client builds `Authorization: Basic base64("API_KEY:<key>")`.
- OAuth bearer also exists (`AccessToken` scheme) for multi-athlete use — not used here.

## Query recipes

Run these from the repo root.

List every path + methods matching a keyword:

```bash
node -e '
const s=require("./.claude/skills/intervals-icu-api/reference/openapi.json");
const kw=process.argv[1].toLowerCase();
for(const k of Object.keys(s.paths).sort()){
  if(!k.toLowerCase().includes(kw)) continue;
  const m=Object.keys(s.paths[k]).filter(x=>["get","post","put","delete","patch"].includes(x));
  console.log(m.map(x=>x.toUpperCase()).join(",").padEnd(18), k);
}' wellness
```

Inspect the parameters of one operation:

```bash
node -e '
const s=require("./.claude/skills/intervals-icu-api/reference/openapi.json");
const [path,method]=process.argv.slice(1);
const op=s.paths[path][method];
console.log(op.summary||op.operationId);
for(const p of (op.parameters||[])) {
  console.log(`- ${p.name} (${p.in}${p.required?", REQUIRED":""}): ${JSON.stringify(p.schema)}`);
}' "/api/v1/athlete/{id}/power-curves{ext}" get
```

Resolve a response/request schema (`$ref` under `components.schemas`):

```bash
node -e '
const s=require("./.claude/skills/intervals-icu-api/reference/openapi.json");
console.log(JSON.stringify(s.components.schemas[process.argv[1]],null,2))' ActivityFilter
```

## Gotchas already confirmed (do not re-discover the hard way)

- **Curves are plural**: `/athlete/{id}/power-curves`, `/hr-curves`, `/pace-curves`.
  `type` (sport enum: Ride, Run, Swim, TrailRun, …) is **required**; `curves` (durations)
  and `newest` are optional. There is **no `oldest`**. Per-activity variants are singular:
  `/activity/{id}/power-curve{ext}`.
- **`GET /athlete/{id}/activities`**: `oldest` is **required**.
- **`DELETE /athlete/{id}/events`** (delete by range): `oldest` and `category` (array) are
  **required**.
- Many GET paths carry a trailing `{ext}`/`{format}` template segment (e.g. `wellness{ext}`,
  `events{format}`). Calling the bare path (empty ext) returns JSON; append `.csv` for CSV.
- **Array query params** (`curves`, `category`, `types`, `fields`) are sent as repeated
  params (`?category=A&category=B`).
- Filter params `f1`/`f2`/`f3` on curve endpoints are marked `required` in the spec but
  described as "if set" — currently omitted; validate against the live API with a real key.

## When you change the client

After confirming an endpoint here, update `libs/intervals-icu-client/src/client.ts`
(+ schema in `schemas.ts`, + msw test in `client.spec.ts`), then the matching tool in
`libs/intervals-icu-mcp-tools/`. See `apps/intervals-icu-mcp/AGENTS.md` → "Ajouter un
nouveau tool MCP".
