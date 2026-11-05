import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, dataRootOf, parseFrontmatter } from '../index.js'

test('registers every studio skill with resolved roots', async () => {
  const registered = []
  const ctx = {
    skills: { register: (skill) => { registered.push(skill); return () => {} } },
    logger: { warn() {} },
  }
  await apply(ctx, {})
  assert.equal(registered.length, 9)
  assert.deepEqual(registered.map((skill) => skill.name).sort(), [
    'video-audio', 'video-intake', 'video-narration', 'video-produce', 'video-qa',
    'video-reuse', 'video-scene-code', 'video-storyboard', 'video-workspace',
  ])
  for (const skill of registered) {
    assert.ok(skill.description.length > 20, `${skill.name} needs a routing description`)
    assert.ok(skill.path.endsWith('SKILL.md'))
    assert.equal(skill.source, 'runtime')
    assert.match(skill.content, /Studio root/)
    assert.match(skill.content, /AGENTS\.md/)
    assert.match(skill.content, /never against the session working directory/)
  }
})

test('honours an explicit data root', async () => {
  const registered = []
  const ctx = { skills: { register: (skill) => { registered.push(skill); return () => {} } }, logger: { warn() {} } }
  await apply(ctx, { dataRoot: '/tmp/studio-data' })
  assert.match(registered[0].content, /Studio data root.*\/tmp\/studio-data/)
  assert.equal(dataRootOf('/tmp/studio-data'), '/tmp/studio-data')
  assert.equal(dataRootOf(undefined), dataRootOf(''))
})

test('parses frontmatter without eating the body', () => {
  const { meta, body } = parseFrontmatter('---\nname: demo\ndescription: >\n  folded\n  text\n---\n\n# Body\n')
  assert.equal(meta.name, 'demo')
  assert.equal(meta.description, 'folded text')
  assert.equal(body.trimStart(), '# Body\n')
})
