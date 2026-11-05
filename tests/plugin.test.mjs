import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { apply, dataRootOf, parseFrontmatter, studioHeader } from '../index.js'
import { resolveDataRoot } from '../scripts/studio-paths.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')

function context() {
  const registered = []
  return {
    registered,
    ctx: {
      skills: { register: (skill) => { registered.push(skill); return () => {} } },
      logger: { warn() {} },
    },
  }
}

test('registers every studio skill with resolved roots', async () => {
  const { registered, ctx } = context()
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
    assert.match(skill.content, /Studio (?:code root|root)/)
    assert.match(skill.content, /AGENTS\.md/)
    assert.match(skill.content, /never against the session working directory/)
    assert.doesNotMatch(skill.content, /^> >/m)
  }
})

test('honours an explicit data root and keeps code/data roots distinct', async () => {
  const { registered, ctx } = context()
  await apply(ctx, { dataRoot: '/tmp/studio-data' })
  assert.match(registered[0].content, /Studio code root: `.*dsh-video-studio`/)
  assert.match(registered[0].content, /Studio data root: `\/tmp\/studio-data` \(projects, library, cache\)/)
  assert.equal(dataRootOf('/tmp/studio-data'), '/tmp/studio-data')
  assert.equal(dataRootOf(undefined, { env: {} }), repoRoot)
})

test('data-root precedence is explicit > env > config > package', () => {
  const configFile = { dataRoot: '/tmp/config-data', path: '/tmp/studio.config.json' }
  assert.equal(resolveDataRoot({ dataRoot: 'relative-data', codeRoot: repoRoot, configFile }).dataRoot, path.join(repoRoot, 'relative-data'))
  assert.equal(resolveDataRoot({ codeRoot: repoRoot, cwd: '/tmp', env: { VIDEO_STUDIO_ROOT: 'env-data' }, configFile }).dataRoot, '/tmp/env-data')
  assert.equal(resolveDataRoot({ codeRoot: repoRoot, env: {}, configFile }).dataRoot, '/tmp/config-data')
  assert.equal(resolveDataRoot({ codeRoot: repoRoot, env: {}, configFile: {} }).dataRoot, repoRoot)
})

test('the studio header is well formed and never prints undefined', () => {
  const same = studioHeader(repoRoot, repoRoot)
  assert.match(same, /^> Studio root: `.*` \(code, projects, library, cache\)$/m)
  assert.doesNotMatch(same, /undefined|> >/)
  const split = studioHeader('/tmp/video-data', repoRoot)
  assert.match(split, /^> Studio code root: `.*`$/m)
  assert.match(split, /^> Studio data root: `\/tmp\/video-data` \(projects, library, cache\)$/m)
  assert.doesNotMatch(split, /undefined|> >/)
})

test('parses frontmatter without eating the body', () => {
  const { meta, body } = parseFrontmatter('---\nname: demo\ndescription: >\n  folded\n  text\n---\n\n# Body\n')
  assert.equal(meta.name, 'demo')
  assert.equal(meta.description, 'folded text')
  assert.equal(body.trimStart(), '# Body\n')
})
