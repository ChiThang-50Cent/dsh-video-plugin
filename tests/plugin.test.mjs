import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { apply, Config, dataRootOf, parseFrontmatter, studioHeader } from '../index.js'
import { resolveDataRoot } from '../scripts/studio-paths.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')

function provider(config = {}) {
  let result
  apply({ skills: { registerProvider: (create) => { result = create({}) } }, logger: { warn() {} } }, config)
  return result
}

test('registers a synchronous workspace-sensitive bundled provider with resource bases', async () => {
  const p = provider()
  const skills = await p.list({ cwd: '/tmp/wsA' })
  assert.deepEqual(skills.map((skill) => skill.name).sort(), [
    'video-audio', 'video-intake', 'video-narration', 'video-produce', 'video-qa',
    'video-reuse', 'video-scene-code', 'video-storyboard', 'video-workspace',
  ])
  for (const skill of skills) {
    assert.ok(skill.description.length > 20)
    assert.equal(skill.resourceBase.path, path.dirname(skill.path))
    assert.equal(skill.resourceBase.kind, 'directory')
    assert.equal(skill.rank, 600)
    const definition = await p.get(skill, { cwd: '/tmp/wsA', signal: new AbortController().signal })
    assert.equal(Object.hasOwn(definition, 'rank'), false)
    assert.equal(Object.hasOwn(definition, 'locator'), false)
    assert.ok((await p.get(skill, { cwd: '/tmp/wsA' })).content.includes('Studio data root: `/tmp/wsA`'))
    assert.ok((await p.get(skill, { cwd: '/tmp/wsB' })).content.includes('Studio data root: `/tmp/wsB`'))
    const unknown = (await p.get(skill, {})).content
    assert.match(unknown, /data root: the session workspace/)
    assert.ok(unknown.includes(path.join(repoRoot, 'scripts', 'studio-root.mjs')))
  }
})

test('explicit roots resolve relative to each workspace', async () => {
  const p = provider({ dataRoot: 'data' })
  const skill = (await p.list())[0]
  const content = (await p.get(skill, { cwd: '/tmp/wsA' })).content
  assert.ok(content.includes(`Studio code root: \`${repoRoot}\``))
  assert.ok(content.includes('Studio data root: `/tmp/wsA/data`'))
  assert.equal(dataRootOf('data', { cwd: '/tmp/wsA', env: {} }), '/tmp/wsA/data')
})

test('provider discovers an initialized workspace from an episode cwd', async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-provider-'))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  fs.mkdirSync(path.join(workspace, 'library'))
  fs.writeFileSync(path.join(workspace, 'library', 'catalog.json'), '{"entries":[]}')
  const episode = path.join(workspace, 'projects', 'series', 'episodes', 'ep-001')
  fs.mkdirSync(episode, { recursive: true })
  const p = provider()
  const skill = (await p.list({ cwd: episode }))[0]
  assert.ok((await p.get(skill, { cwd: episode })).content.includes(`Studio data root: \`${workspace}\``))
})

test('data-root precedence is explicit > env > config > workspace', () => {
  const configFile = { dataRoot: 'config-data', path: '/var/studio/studio.config.json' }
  assert.equal(resolveDataRoot({ dataRoot: 'relative-data', cwd: '/tmp', env: {}, configFile }).dataRoot, '/tmp/relative-data')
  assert.equal(resolveDataRoot({ cwd: '/tmp', env: { VIDEO_STUDIO_ROOT: 'env-data' }, configFile }).dataRoot, '/tmp/env-data')
  assert.equal(resolveDataRoot({ cwd: '/tmp', env: {}, configFile }).dataRoot, '/var/studio/config-data')
  assert.equal(resolveDataRoot({ cwd: '/tmp', env: {}, configFile: {} }).dataRoot, '/tmp')
})

test('config schema rejects invalid data roots', () => {
  const validate = Config['~standard'].validate
  for (const dataRoot of ['', '  ', 5, null]) assert.ok(validate({ dataRoot }).issues)
  assert.deepEqual(validate({ dataRoot: 'data' }).value, { dataRoot: 'data' })
})

test('header is well formed and uses computed code root', () => {
  const header = studioHeader('/tmp/video-data', repoRoot)
  assert.ok(header.includes(`Studio code root: \`${repoRoot}\``))
  assert.doesNotMatch(header, /undefined|> >/)
})

test('parses frontmatter without eating the body', () => {
  const { meta, body } = parseFrontmatter('---\nname: demo\ndescription: >\n  folded\n  text\n---\n\n# Body\n')
  assert.equal(meta.name, 'demo')
  assert.equal(meta.description, 'folded text')
  assert.equal(body.trimStart(), '# Body\n')
})
