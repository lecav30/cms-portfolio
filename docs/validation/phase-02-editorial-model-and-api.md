# Phase 2 editorial model and secure REST API

## Summary

Phase 2 adds `Categories`, `Tags`, `Media`, and `Posts` to the standalone
Payload CMS. It keeps the existing single-admin `Users` collection unchanged.
The model is Spanish-first and uses Payload 3.89.0 native drafts/versions for
post lifecycle rather than a competing custom status field.

The only dependency added is the official `@payloadcms/richtext-lexical` at
the same pinned `3.89.0` version as the rest of Payload. It configures Lexical
as the top-level rich-text editor.

## Collection and lifecycle design

| Collection | Fields and relationships | Access |
| --- | --- | --- |
| `categories` | Required `name`, unique normalized `slug`, optional `description`, timestamps | Public read; authenticated create/update/delete. |
| `tags` | Required `name`, unique normalized `slug`, timestamps | Public read; authenticated create/update/delete. |
| `media` | Required public-safe `alt`, Payload upload metadata, timestamps | Public read; authenticated upload/update/delete. JPEG, PNG, WebP, AVIF, GIF only. |
| `posts` | Required `title`, unique `slug`, required Lexical `content` and `category`; optional `excerpt`, `coverImage`, tags, SEO fields; `contentType`, `publishedAt`, `noIndex`, timestamps | Public reads are database-constrained to published records. Authenticated CRUD and version reads. |

`Posts` enables Payload versions with drafts and autosave. Payload owns `_status`:
draft is the default, publishing uses `_status: "published"`, and unpublishing
uses `_status: "draft"`. A before-change hook sets `publishedAt` at first
publication and preserves it across later edits, unpublishing, and
re-publication.

Slug normalization removes diacritics (for example, `Tecnología Ágil` becomes
`tecnologia-agil`), lowercases, and replaces non-alphanumerics with one hyphen.
It does not invent suffixes. The `unique` field constraint creates a database
unique index, so collisions are rejected deterministically. Slugs are permanent
URL identifiers; redirect handling for deliberate changes belongs to the future
portfolio integration phase.

## REST contract and security

| Request class | Result |
| --- | --- |
| Anonymous `GET /api/posts` and `GET /api/posts/:id` | Published posts only. The access constraint is merged with caller filters. |
| Anonymous draft direct ID, `draft=true`, draft filter, depth/population | No successful response; live validation observed HTTP `404` for direct/draft lookups and no draft in a depth-10 filtered list. |
| Anonymous post-version lookup | No successful response; live validation observed HTTP `404`. |
| Anonymous POST to each editorial collection | HTTP `403`. |
| Authenticated collection operations | Allowed for all editorial create/update/delete actions. Validation used the existing admin as the local API user with `overrideAccess: false`. |
| Anonymous categories, tags, and media reads | Allowed because their schemas contain only intentional public metadata. |

Media is deliberately publicly readable so a published Post can populate a
cover image in REST. It has no user relationship or private editorial fields;
the live test verified no user authentication fields in its public response.
This means only assets suitable for public distribution may be uploaded. Media
storage remains the ignored local `media/` directory until Phase 3 introduces
Cloudflare R2; it is not suitable for Vercel production.

GraphQL is disabled at the root config. REST is the defined integration surface,
so disabling GraphQL avoids maintaining an additional public query contract.
The live endpoint check returned HTTP `404` for `/api/graphql`.

## Schema and migration state

Before local schema synchronization, a schema-only `pg_dump` snapshot was
created in protected temporary storage after confirming the target was the
local-only `cms_portfolio_dev` database and that its existing Users count was
one. Payload development push then created the editorial and versions tables;
the existing administrator remained unchanged.

`src/migrations/20261029_025459_phase_02_editorial_collections.ts` and its
snapshot are reviewed baseline migrations. Because Phase 1 had used local
development push without a prior migration snapshot, this baseline includes
the Phase 1 Users/Payload tables as well as the new editorial tables. It is
pending according to `bun run migrate:status` and was **not applied** to the
already push-managed local database. Applying it there would conflict with
existing tables.

For a fresh production Neon database: review this baseline SQL, back up the
target, apply it once using `bun run migrate`, then use only later reviewed
migrations. Do not apply it to an existing development database, and do not
run destructive down/reset/fresh commands against shared or production data.

## Validation performed

| Check | Result | Evidence |
| --- | --- | --- |
| Node / Bun | PASS | Node `v24.22.1`, Bun `1.1.18`. |
| Local DB identity | PASS | Confirmed `cms_portfolio_dev`; PostgreSQL user/credentials were not recorded. |
| Development schema sync | PASS | Categories, tags, media, posts, relationship, and post-version tables present; Users count stayed `1`. |
| Local API admin CRUD | PASS | Existing admin context with access checks enabled created, updated, published, unpublished, re-published, and deleted temporary category, tag, media, and post records. |
| Slug uniqueness / normalization | PASS | Accent normalization asserted; duplicate normalized category slug was rejected. |
| Media MIME policy | PASS | Authenticated local upload of `text/html` was rejected; PNG test upload succeeded and was deleted. |
| Public draft isolation | PASS | Direct, `draft=true`, filter/depth, and versions probes did not yield a public draft. |
| Public published read / relationship safety | PASS | Published list/detail and populated cover image returned HTTP `200`; public media response contained no user authentication fields. |
| Anonymous mutations | PASS | POST to categories, tags, media, and posts each returned HTTP `403`. |
| Publish timestamp stability | PASS | `publishedAt` was set on first publish and unchanged after unpublish/re-publish. |
| Fixture cleanup | PASS | Categories, tags, media, and posts counts were all `0` after the test; Users remained `1`. |
| Frozen install / typecheck / lint / build | PASS | `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`, and `bun run build` succeeded. |
| Migration status | PASS (review only) | Baseline migration is pending and intentionally unapplied locally. |

The 5 MiB Media request limit is configured through Payload's supported root
upload/Busboy configuration. It was inspected in the installed Payload types
and configuration but not exercised through an authenticated multipart REST
request, because the retained local validation intentionally does not retain or
replay the administrator password. Phase 1 already verified Payload login/JWT
authentication; this phase exercised editorial admin authorization through the
real existing user in the Payload local API with access overrides disabled.

## Files changed

- `src/access/editorial.ts` — shared authenticated and published-only access rules.
- `src/fields/slug.ts` — deterministic normalized slug hook and validation.
- `src/collections/` — editorial collection definitions.
- `src/payload.config.ts` — collections, Lexical editor, upload limit, GraphQL disablement.
- `src/migrations/` — reviewed baseline migration and snapshot.
- `scripts/validate-editorial-model.ts` and `package.json` — reproducible local integration check.
- `README.md` — API, migration, slug, and local-media documentation.
- `.gitignore` — local `media/` files.

No environment variable names or values changed. No provider, portfolio, Neon,
Vercel, or R2 resource was modified. No secret-bearing file was staged.

## Handoff

**Phase 3 readiness: READY.** The next phase can replace only the local Media
storage adapter with R2 and retain the Media/Post relationship and access model.
Before production deployment, provision a fresh Neon target and apply the
reviewed baseline migration once; do not copy the local development database or
its schema-push history into production.
