import { randomUUID } from 'node:crypto'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import type { Post } from '../src/payload-types'

const origin = process.env.CMS_TEST_ORIGIN ?? 'http://127.0.0.1:3011'
const fixtureID = randomUUID().slice(0, 8)
const codeFixture = "const total = 1 + 2\n\nif (total > 0) {\n  console.log('<script>inert</script>')\n}\n"
const updatedCodeFixture = `${codeFixture}// versión editada\n`

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function expectRejected(operation: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await operation()
  } catch {
    return
  }

  throw new Error(`${label} unexpectedly succeeded`)
}

function text(textContent: string) {
  return {
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text: textContent,
    type: 'text',
    version: 1,
  }
}

function paragraph(children: Array<Record<string, unknown>>) {
  return {
    children,
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
    type: 'paragraph',
    version: 1,
  }
}

const codeNode = (code: string) => ({
  fields: {
    blockName: '',
    blockType: 'Code',
    code,
    id: '665f00000000000000000001',
    language: 'typescript',
  },
  format: '',
  type: 'block',
  version: 2,
})

const inlineMathNode = {
  fields: {
    blockName: '',
    blockType: 'InlineMath',
    id: '665f00000000000000000002',
    latex: 'x^2 + y^2',
  },
  type: 'inlineBlock',
  version: 1,
}

const displayMathNode = {
  fields: {
    blockName: '',
    blockType: 'Math',
    id: '665f00000000000000000003',
    latex: '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
  },
  format: '',
  type: 'block',
  version: 2,
}

const tableNode = {
  children: [
    {
      children: [
        {
          backgroundColor: null,
          children: [paragraph([text('Lenguaje')])],
          colSpan: 1,
          direction: null,
          format: '',
          headerState: 3,
          indent: 0,
          rowSpan: 1,
          type: 'tablecell',
          version: 1,
          width: undefined,
        },
        {
          backgroundColor: null,
          children: [paragraph([text('Uso')])],
          colSpan: 1,
          direction: null,
          format: '',
          headerState: 3,
          indent: 0,
          rowSpan: 1,
          type: 'tablecell',
          version: 1,
          width: undefined,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'tablerow',
      version: 1,
    },
    {
      children: [
        {
          backgroundColor: null,
          children: [paragraph([text('TypeScript')])],
          colSpan: 1,
          direction: null,
          format: '',
          headerState: 0,
          indent: 0,
          rowSpan: 1,
          type: 'tablecell',
          version: 1,
          width: undefined,
        },
        {
          backgroundColor: null,
          children: [paragraph([text('API')])],
          colSpan: 1,
          direction: null,
          format: '',
          headerState: 0,
          indent: 0,
          rowSpan: 1,
          type: 'tablecell',
          version: 1,
          width: undefined,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'tablerow',
      version: 1,
    },
  ],
  direction: null,
  format: '',
  indent: 0,
  type: 'table',
  version: 1,
}

const technicalContent = (code: string): NonNullable<Post['content']> =>
  ({
    root: {
      children: [
        paragraph([text('Contenido ordinario compatible.')]),
        {
          children: [text('Contrato técnico')],
          direction: null,
          format: '',
          indent: 0,
          tag: 'h2',
          type: 'heading',
          version: 1,
        },
        codeNode(code),
        paragraph([text('La fórmula en línea es '), inlineMathNode, text('.')]),
        displayMathNode,
        tableNode,
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }) as NonNullable<Post['content']>

function nodes(content: Post['content']): Array<Record<string, unknown>> {
  return content.root.children as Array<Record<string, unknown>>
}

function fieldValue(node: Record<string, unknown>, key: string): unknown {
  const fields = node.fields
  assert(fields && typeof fields === 'object', `Technical node is missing ${key}.`)
  return (fields as Record<string, unknown>)[key]
}

async function main(): Promise<void> {
  const payload = await getPayload({ config })
  const admins = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
  const admin = admins.docs[0]
  assert(admin, 'A local administrator is required for technical-content validation.')

  let categoryID: number | undefined
  let postID: number | undefined

  try {
    const category = await payload.create({
      collection: 'categories',
      data: {
        description: 'Fixture temporal de contenido técnico.',
        name: `Contenido técnico ${fixtureID}`,
        slug: `contenido-tecnico-${fixtureID}`,
      },
      overrideAccess: false,
      user: admin,
    })
    categoryID = category.id

    await expectRejected(
      () =>
        payload.create({
          collection: 'posts',
          data: {
            category: categoryID,
            content: {
              ...technicalContent(codeFixture),
              root: {
                ...technicalContent(codeFixture).root,
                children: [
                  codeNode(codeFixture),
                  {
                    ...codeNode(codeFixture),
                    fields: { ...codeNode(codeFixture).fields, language: 'not-a-language' },
                  },
                ],
              },
            },
            contentType: 'article',
            title: `Lenguaje no permitido ${fixtureID}`,
          },
          draft: true,
          overrideAccess: false,
          user: admin,
        }),
      'An unsupported code language',
    )

    await expectRejected(
      () =>
        payload.create({
          collection: 'posts',
          data: {
            category: categoryID,
            content: technicalContent(codeFixture),
            contentType: 'article',
            title: `Escritura anónima ${fixtureID}`,
          },
          draft: true,
          overrideAccess: false,
        }),
      'Anonymous editorial write',
    )

    const draft = await payload.create({
      collection: 'posts',
      data: {
        category: categoryID,
        content: technicalContent(codeFixture),
        contentType: 'tutorial',
        excerpt: 'Fixture temporal para validar nodos técnicos de Lexical.',
        title: `Contenido técnico ${fixtureID}`,
      },
      draft: true,
      overrideAccess: false,
      user: admin,
    })
    postID = draft.id
    assert(draft._status === 'draft', 'Technical fixture did not save as a draft.')
    assert(nodes(draft.content).some((node) => node.type === 'block'), 'Display blocks were not persisted.')
    assert(nodes(draft.content).some((node) => node.type === 'table'), 'Table was not persisted.')

    const draftPublic = await fetch(`${origin}/api/posts/${postID}`)
    assert(draftPublic.status === 404, `Draft returned ${draftPublic.status} from the public REST API.`)

    const published = await payload.update({
      collection: 'posts',
      data: { _status: 'published' },
      id: postID,
      overrideAccess: false,
      user: admin,
    })
    assert(published._status === 'published', 'Technical fixture did not publish.')

    const publishedNodes = nodes(published.content)
    const publishedCode = publishedNodes.find((node) => node.type === 'block' && fieldValue(node, 'blockType') === 'Code')
    assert(publishedCode, 'Published code block is missing.')
    assert(fieldValue(publishedCode, 'language') === 'typescript', 'Code language was not preserved.')
    assert(fieldValue(publishedCode, 'code') === codeFixture, 'Code whitespace or literal text was not preserved.')
    const publishedMath = publishedNodes.find((node) => node.type === 'block' && fieldValue(node, 'blockType') === 'Math')
    assert(publishedMath && fieldValue(publishedMath, 'latex') === displayMathNode.fields.latex, 'Display math was not preserved.')
    const inlineMath = publishedNodes
      .filter((node) => node.type === 'paragraph')
      .flatMap((node) => (node.children as Array<Record<string, unknown>> | undefined) ?? [])
      .find((node) => node.type === 'inlineBlock')
    assert(inlineMath && fieldValue(inlineMath, 'latex') === inlineMathNode.fields.latex, 'Inline math was not preserved.')

    const publicPost = await fetch(`${origin}/api/posts/${postID}?depth=0`)
    assert(publicPost.status === 200, `Published post returned ${publicPost.status} from the public REST API.`)
    const publicPostBody = (await publicPost.json()) as { content?: Post['content']; id?: number }
    assert(publicPostBody.id === postID, 'Public REST API returned a different post.')
    assert(publicPostBody.content && nodes(publicPostBody.content).some((node) => node.type === 'table'), 'Public REST API omitted table data.')

    const updated = await payload.update({
      collection: 'posts',
      data: { content: technicalContent(updatedCodeFixture) },
      id: postID,
      overrideAccess: false,
      user: admin,
    })
    const updatedCode = nodes(updated.content).find((node) => node.type === 'block' && fieldValue(node, 'blockType') === 'Code')
    assert(updatedCode && fieldValue(updatedCode, 'code') === updatedCodeFixture, 'Technical content did not survive an edit.')

    const versions = await payload.findVersions({
      collection: 'posts',
      limit: 10,
      overrideAccess: false,
      user: admin,
      where: { parent: { equals: postID } },
    })
    assert(versions.totalDocs >= 2, 'Technical post did not retain versions after publish and edit.')
  } finally {
    if (postID) {
      await payload.delete({ collection: 'posts', id: postID, overrideAccess: false, user: admin })
    }
    if (categoryID) {
      await payload.delete({ collection: 'categories', id: categoryID, overrideAccess: false, user: admin })
    }
  }

  console.log('phase7a_technical_content=pass')
}

await main()
