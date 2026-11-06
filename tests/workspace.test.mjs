import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const scripts = path.join(repoRoot, 'scripts')

function run(script, args = [], { cwd = here, env = {} } = {}) {
  return spawnSync(process.execPath, [path.join(scripts, script), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

function tempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-workspace-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('preflight reports hardware separately from provider readiness', () => {
  const result = run('preflight.mjs')
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.tools.node.available, true)
  assert.equal(report.gpu.ttsReady, false)
  assert.equal(report.capabilities.audioSynthesis.providerVerified, false)
  assert.equal(report.capabilities.audioSynthesis.readyForBatch, false)
  if (report.gpu.present) {
    assert.equal(report.gpu.present, true)
    assert.match(report.gpu.interpretation, /does not verify/)
  }
})

test('validator blocks timing after scene end in silent mode', (t) => {
  const tmp = tempRoot(t)
  fs.mkdirSync(path.join(tmp, 'audio'))
  fs.writeFileSync(path.join(tmp, 'production.json'), JSON.stringify({ schemaVersion: 1, mode: 'silent', voiceOver: false }))
  fs.writeFileSync(path.join(tmp, 'storyboard.json'), JSON.stringify({ scenes: [{ id: 's01-example', reuseClass: 'A', templateId: 'title-v1' }] }))
  fs.writeFileSync(path.join(tmp, 'timeline.json'), JSON.stringify({ durationSec: 5, scenes: [{ id: 's01-example', startSec: 0, durationSec: 5, keyframes: [5.5] }] }))
  fs.writeFileSync(path.join(tmp, 'claim-check.json'), JSON.stringify({ status: 'PASS' }))
  fs.writeFileSync(path.join(tmp, 'audio', 'manifest.json'), JSON.stringify({ chunks: [] }))
  const result = run('validate-episode.mjs', [tmp])
  assert.equal(result.status, 1)
  assert.match(result.stdout, /Out-of-bounds keyframe/)
})

test('new-episode rejects path traversal', () => {
  const result = run('new-episode.mjs', ['../wrong', 'ep-001'])
  assert.equal(result.status, 2)
})

test('external data root wins over the working directory and is idempotent', (t) => {
  const tmp = tempRoot(t)
  const data = path.join(tmp, 'external-data')
  const elsewhere = path.join(tmp, 'elsewhere')
  fs.mkdirSync(elsewhere, { recursive: true })
  const env = { VIDEO_STUDIO_ROOT: data }

  const roots = run('studio-root.mjs', [], { cwd: elsewhere, env })
  assert.equal(roots.status, 0, roots.stderr)
  const parsedRoots = JSON.parse(roots.stdout)
  assert.equal(parsedRoots.dataRoot, data)
  assert.equal(parsedRoots.codeRoot, repoRoot)
  assert.equal(parsedRoots.projects, path.join(data, 'projects'))

  const first = run('init-workspace.mjs', ['--json'], { cwd: elsewhere, env })
  assert.equal(first.status, 0, first.stderr)
  const firstReport = JSON.parse(first.stdout)
  assert.equal(firstReport.dataRoot, data)
  assert.ok(firstReport.created.length > 0)
  assert.ok(fs.existsSync(path.join(data, 'library', 'visual-styles', 'default', 'style.json')))
  assert.ok(fs.existsSync(path.join(data, 'library', 'catalog.json')))

  fs.writeFileSync(path.join(data, 'library', 'visual-styles', 'default', 'style.json'), '{"schemaVersion":1,"id":"local"}\n')
  const second = run('init-workspace.mjs', ['--json'], { cwd: elsewhere, env })
  assert.equal(second.status, 0, second.stderr)
  const secondReport = JSON.parse(second.stdout)
  assert.equal(secondReport.created.length, 0)
  assert.equal(fs.readFileSync(path.join(data, 'library', 'visual-styles', 'default', 'style.json'), 'utf8'), '{"schemaVersion":1,"id":"local"}\n')

  const created = run('new-episode.mjs', ['external-series', 'ep-001'], { cwd: elsewhere, env })
  assert.equal(created.status, 0, created.stderr)
  const episode = path.join(data, 'projects', 'external-series', 'episodes', 'ep-001')
  assert.equal(created.stdout.trim(), episode)
  assert.ok(fs.existsSync(path.join(episode, 'narration.md')))
  assert.ok(fs.existsSync(path.join(data, 'projects', 'external-series', 'project.json')))
  assert.equal(fs.existsSync(path.join(elsewhere, 'projects')), false)

  const projectFile = path.join(data, 'projects', 'external-series', 'project.json')
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'))
  project.styleRefs = ['indeterminate-forms']
  fs.writeFileSync(projectFile, JSON.stringify(project))
  const styles = run('validate-style-refs.mjs', [path.dirname(path.dirname(episode))], { cwd: elsewhere, env })
  assert.equal(styles.status, 0, styles.stdout + styles.stderr)
  assert.match(styles.stdout, /RESULT: PASS/)
})

test('CLI defaults to workspace without writing episode into package', (t) => {
  const workspace = tempRoot(t)
  const env = { VIDEO_STUDIO_ROOT: '', VIDEO_STUDIO_CONFIG: '' }
  const series = `workspace-${path.basename(workspace).toLowerCase()}`
  const result = run('new-episode.mjs', [series, 'ep-001'], { cwd: workspace, env })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(fs.existsSync(path.join(workspace, 'projects', series, 'episodes', 'ep-001')))
  assert.equal(fs.existsSync(path.join(repoRoot, 'projects', series)), false)
})

test('nested episode commands discover their initialized workspace', (t) => {
  const workspace = tempRoot(t)
  const env = { VIDEO_STUDIO_ROOT: '', VIDEO_STUDIO_CONFIG: '' }
  const first = run('new-episode.mjs', ['series', 'ep-001'], { cwd: workspace, env })
  assert.equal(first.status, 0, first.stderr)
  const episode = path.join(workspace, 'projects', 'series', 'episodes', 'ep-001')
  const roots = run('studio-root.mjs', [], { cwd: episode, env })
  assert.equal(roots.status, 0, roots.stderr)
  assert.equal(JSON.parse(roots.stdout).dataRoot, workspace)
  assert.equal(JSON.parse(roots.stdout).rootSource, 'workspace-ancestor')
  const second = run('new-episode.mjs', ['series', 'ep-002'], { cwd: episode, env })
  assert.equal(second.status, 0, second.stderr)
  assert.ok(fs.existsSync(path.join(workspace, 'projects', 'series', 'episodes', 'ep-002')))
  assert.equal(fs.existsSync(path.join(episode, 'projects')), false)
  assert.equal(fs.existsSync(path.join(episode, 'library')), false)
})

test('config file relative data root is anchored to config directory', (t) => {
  const root = tempRoot(t)
  const workspace = path.join(root, 'workspace')
  const configDir = path.join(root, 'config')
  fs.mkdirSync(workspace)
  fs.mkdirSync(configDir)
  const config = path.join(configDir, 'studio.config.json')
  fs.writeFileSync(config, JSON.stringify({ dataRoot: 'data' }))
  const result = run('studio-root.mjs', [], { cwd: workspace, env: { VIDEO_STUDIO_ROOT: '', VIDEO_STUDIO_CONFIG: config } })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).dataRoot, path.join(configDir, 'data'))
})

test('initialization preserves accepted catalogs and validates them', (t) => {
  const workspace = tempRoot(t)
  const library = path.join(workspace, 'library')
  fs.mkdirSync(library)
  const catalog = path.join(library, 'catalog.json')
  const content = JSON.stringify({ entries: [{ id: 'accepted' }] })
  fs.writeFileSync(catalog, content)
  assert.equal(run('init-workspace.mjs', ['--data-root', workspace]).status, 0)
  assert.equal(fs.readFileSync(catalog, 'utf8'), content)
  fs.writeFileSync(catalog, '{}')
  assert.equal(run('init-workspace.mjs', ['--data-root', workspace]).status, 1)
})

test('a silent episode is created without fake narration and skips the narration gate', (t) => {
  const tmp = tempRoot(t)
  const data = path.join(tmp, 'data')
  const env = { VIDEO_STUDIO_ROOT: data }
  const result = run('new-episode.mjs', ['silent-series', 'ep-001', '--mode', 'silent'], { cwd: tmp, env })
  assert.equal(result.status, 0, result.stderr)
  const episode = path.join(data, 'projects', 'silent-series', 'episodes', 'ep-001')
  assert.equal(fs.existsSync(path.join(episode, 'narration.md')), false)
  assert.equal(fs.existsSync(path.join(episode, 'narration-review.json')), false)
  assert.ok(fs.existsSync(path.join(episode, 'visual-brief.md')))
  const production = JSON.parse(fs.readFileSync(path.join(episode, 'production.json'), 'utf8'))
  assert.equal(production.mode, 'silent')
  assert.equal(production.voiceOver, false)
  const narration = run('validate-narration.mjs', [episode], { cwd: tmp, env })
  assert.equal(narration.status, 0, narration.stdout + narration.stderr)
  assert.match(narration.stdout, /no narration gate/)

  const mixed = run('new-episode.mjs', ['mixed-series', 'ep-001', '--mode', 'mixed'], { cwd: tmp, env })
  assert.equal(mixed.status, 0, mixed.stderr)
  const mixedEpisode = path.join(data, 'projects', 'mixed-series', 'episodes', 'ep-001')
  assert.ok(fs.existsSync(path.join(mixedEpisode, 'narration.md')))
  assert.equal(JSON.parse(fs.readFileSync(path.join(mixedEpisode, 'production.json'), 'utf8')).voiceOver, true)
})

test('a clean npm package initializes its library and resolves built-in styles', (t) => {
  const tmp = tempRoot(t)
  const packDir = path.join(tmp, 'pack')
  fs.mkdirSync(packDir)
  const pack = spawnSync('npm', ['pack', '--silent', '--pack-destination', packDir], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(pack.status, 0, pack.stderr)
  const tarball = path.join(packDir, pack.stdout.trim())
  assert.ok(fs.existsSync(tarball))

  const listing = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
  const files = listing.stdout.split('\n').filter(Boolean)
  for (const required of [
    'package/index.js',
    'package/scripts/init-workspace.mjs',
    'package/scripts/lib/narration-integrity.mjs',
    'package/library/catalog.json',
    'package/library/visual-styles/default/style.json',
    'package/library/styles/indeterminate-forms/style.json',
    'package/library/styles/indeterminate-forms/notes.md',
    'package/library/styles/indeterminate-forms/reference.external.md',
  ]) assert.ok(files.includes(required), `package is missing ${required}`)
  for (const forbidden of ['reference.vi.md', 'tests/', 'projects/', '.git']) {
    assert.equal(files.some((file) => file.includes(forbidden)), false, `package must not include ${forbidden}`)
  }

  const install = path.join(tmp, 'install')
  fs.mkdirSync(install)
  const extract = spawnSync('tar', ['-xzf', tarball, '-C', install], { encoding: 'utf8' })
  assert.equal(extract.status, 0, extract.stderr)
  const packageRoot = path.join(install, 'package')
  const data = path.join(tmp, 'installed-data')
  const elsewhere = path.join(tmp, 'installed-workspace')
  fs.mkdirSync(elsewhere, { recursive: true })

  const init = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'init-workspace.mjs'), '--data-root', data], { cwd: elsewhere, encoding: 'utf8' })
  assert.equal(init.status, 0, init.stderr)
  assert.ok(fs.existsSync(path.join(data, 'library', 'visual-styles', 'default', 'style.json')))
  assert.ok(fs.existsSync(path.join(data, 'library', 'styles', 'indeterminate-forms', 'notes.md')))
  assert.equal(fs.existsSync(path.join(data, 'library', 'styles', 'indeterminate-forms', 'reference.vi.md')), false)

  const created = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'new-episode.mjs'), 'installed-series', 'ep-001', '--data-root', data], { cwd: elsewhere, encoding: 'utf8' })
  assert.equal(created.status, 0, created.stderr)
  const projectDir = path.join(data, 'projects', 'installed-series')
  const projectFile = path.join(projectDir, 'project.json')
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'))
  project.styleRefs = ['indeterminate-forms']
  fs.writeFileSync(projectFile, JSON.stringify(project))
  const style = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'validate-style-refs.mjs'), projectDir, '--data-root', data], { cwd: elsewhere, encoding: 'utf8' })
  assert.equal(style.status, 0, style.stdout + style.stderr)
  assert.match(style.stdout, /RESULT: PASS/)

  const register = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const mod = await import(${JSON.stringify(path.join(packageRoot, 'index.js'))});
    let provider;
    mod.apply({ skills: { registerProvider: (create) => { provider = create({}) } }, logger: { warn() {} } }, { dataRoot: ${JSON.stringify(data)} });
    const skills = await provider.list({ cwd: ${JSON.stringify(elsewhere)} });
    console.log(JSON.stringify({ count: skills.length, first: (await provider.get(skills[0], { cwd: ${JSON.stringify(elsewhere)} })).content.split('\\n').slice(0, 2).join('\\n') }));
  `], { cwd: elsewhere, encoding: 'utf8' })
  assert.equal(register.status, 0, register.stderr)
  const registration = JSON.parse(register.stdout)
  assert.equal(registration.count, 9)
  assert.match(registration.first, new RegExp(data.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
