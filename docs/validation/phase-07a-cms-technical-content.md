# Phase 7A: contenido técnico editorial

## Resultado

**Phase 7B: READY.** El CMS acepta, guarda, versiona y publica nodos técnicos
de Lexical sin cambiar el contrato de acceso de `Posts`. La implementación usa
las funciones de Lexical incluidas en Payload `3.89.0`; no añadió dependencias,
ni modificó el repositorio del portfolio, ni aplicó migraciones.

La interacción visual del editor de `/admin` no se probó con un navegador. La
configuración, el import map generado y las rondas de guardado/lectura mediante
la API local de Payload sí se probaron contra PostgreSQL local.

## Implementación y experiencia de autoría

- `Code` es un bloque de Lexical con un selector acotado de lenguaje y un campo
  `textarea` de texto plano. Conserva la sangría y los saltos de línea; no
  interpreta ni ejecuta HTML.
- `Math` es un bloque de visualización y `InlineMath` es un bloque en línea. Los
  dos guardan LaTeX sin procesar en `latex`; el admin ofrece edición de texto,
  no una vista previa de LaTeX. Así no se añade un renderizador con macros o
  HTML no confiable al CMS.
- `EXPERIMENTAL_TableFeature()` habilita el editor de tablas que incluye
  Payload/Lexical 3.89.0. Sigue siendo experimental en esa versión, por lo que
  la Fase 7B debe soportar sus nodos serializados y revalidar el comportamiento
  al actualizar Payload.
- Las funciones por defecto de `lexicalEditor` se conservan y las nuevas se
  agregan a ellas. Párrafos, listas, enlaces, imágenes y encabezados existentes
  continúan siendo documentos Lexical válidos.

El lenguaje de `Code` se valida explícitamente, incluso además del selector:
`text`, `typescript`, `javascript`, `tsx`, `json`, `bash`, `python` y `sql`.
Un valor fuera de esa lista se rechaza también al guardar un borrador. Payload
omite la validación normal de campos para borradores, por lo que un hook
`beforeValidate` revisa recursivamente estos nodos y mantiene esos límites en
todas las transiciones editoriales.

## Contrato REST serializado para la Fase 7B

`Posts.content` sigue siendo el objeto Lexical existente. Los siguientes son
ejemplos ilustrativos, sin datos de fixtures ni secretos:

```json
{
  "type": "block",
  "version": 2,
  "format": "",
  "fields": {
    "id": "<payload-block-id>",
    "blockType": "Code",
    "language": "typescript",
    "code": "const answer = 42;\n"
  }
}
```

```json
{
  "type": "block",
  "version": 2,
  "fields": {
    "id": "<payload-block-id>",
    "blockType": "Math",
    "latex": "\\int_0^1 x^2 \\, dx"
  }
}
```

```json
{
  "type": "inlineBlock",
  "version": 1,
  "fields": {
    "id": "<payload-block-id>",
    "blockType": "InlineMath",
    "latex": "x^2"
  }
}
```

Tables retain the Lexical nodes `table`, `tablerow` and `tablecell`, with cell
children containing ordinary Lexical paragraphs. Header cells use
`headerState`; `colSpan`, `rowSpan`, `backgroundColor` and `width` are optional
table metadata. The public REST client must continue to treat the rich-text
JSON as untrusted content data, not HTML.

Heading nodes remain standard Lexical `heading` nodes with `tag` (`h1`-`h6`).
No IDs are persisted or manually authored in this phase. The portfolio must
derive anchors deterministically from normalized visible heading text in
document order, appending stable numeric suffixes for collisions; it must not
rewrite this CMS JSON while rendering.

### Phase 7B renderer obligations

- Render only the documented `Code`, `Math`, `InlineMath` and table node forms;
  use a text/unknown-node fallback for unexpected block types or languages.
- Render code as text (`<pre><code>`) and never via injected HTML.
- Use a LaTeX renderer with HTML/trust macros disabled, bounded input handling,
  and a plaintext fallback for rendering failures.
- Escape ordinary Lexical text, preserve code whitespace, and derive heading
  anchors and table of contents entries without trusting custom IDs.
- Continue handling ordinary pre-Phase-7A nodes exactly as the existing
  renderer does.

## Security and access

`Posts` access controls, draft/version configuration, public REST
published-only query constraint, and revalidation hooks are unchanged. Code and
LaTeX are data only, with maximum lengths of 50,000 and 10,000 characters,
respectively. The CMS does not send technical node content in a webhook and no
browser-visible secret was added.

No SQL migration is required: all added data resides in the existing Lexical
JSON rich-text column. This local database remains managed by the established
development schema-push workflow. No migration was generated or applied, and
no production database was contacted.

## Validation

Environment used for live checks: Node `v24.22.1` selected through nvm, Bun
`1.1.18`, PostgreSQL 18 on the existing local `cms_portfolio_dev` database, and
a loopback CMS at `127.0.0.1:3011`. Local environment values were read only by
the processes that require them and are not reproduced here.

| Check | Result | Evidence |
| --- | --- | --- |
| `bun install --frozen-lockfile` | PASS | Existing Bun lock resolved with no changes. |
| `bun run generate:types` | PASS | Generated types remain compatible; rich text is intentionally generic Lexical JSON. |
| `bun run generate:importmap` | PASS | Table feature client import was generated. |
| `bun run typecheck` | PASS | After the editor configuration and validation script. |
| `bun run lint` | PASS | No lint diagnostics. |
| `bun run build` | PASS | Next 16.3.4 production build using local private environment. |
| `bun run validate:technical-content` | PASS | Real draft/save/publish/edit/version/public-read round trip; code whitespace, inert literal markup, code language, inline/display math and table nodes retained; anonymous write and an invalid language on a draft rejected; fixture post/category deleted in `finally`. |
| `bun run validate:editorial` | PASS | Existing category/tag/media/post public/draft/access regression passed; its expected rejected HTML-media attempt logged a MIME validation error before cleanup. |
| Browser admin interaction | BLOCKED | No browser-driven `/admin` test was run; this report does not claim visual editor verification. |
| Migration application | NOT RUN (intentional) | No relational schema change exists; never apply prior baseline migrations to the push-managed local database. |

The technical fixture was a uniquely named draft/post/category, deleted in the
test's `finally` cleanup. The existing administrator and pre-existing editorial
data were not reset or modified. Temporary CMS server processes used for the
checks were stopped after validation.

## Files and follow-up

- `src/blocks/TechnicalContent.ts`: bounded code-language, code, display-math
  and inline-math block definitions.
- `src/payload.config.ts`: enabled blocks and Payload's experimental table
  feature while retaining default Lexical features.
- `src/app/(payload)/admin/importMap.js`: generated table client import.
- `scripts/validate-technical-content.ts` and `package.json`: reproducible
  local API/serialization regression validation.

Phase 7B may implement portfolio rendering, syntax highlighting, defensive
math typesetting, table styles and table-of-contents anchors. It must not claim
browser/admin visual behavior from these API checks, and should add renderer
tests for unknown block types, unsupported languages, malformed tables and
unsafe LaTeX input.
