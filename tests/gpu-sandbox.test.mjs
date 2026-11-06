import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const wrapper = fileURLToPath(new URL('../scripts/dsh-gpu-sandbox', import.meta.url))

test('runner inserts existing GPU devices before the first separator', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-sandbox-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const devices = path.join(dir, 'dev')
  fs.mkdirSync(devices)
  fs.writeFileSync(path.join(devices, 'nvidia0'), '')
  fs.writeFileSync(path.join(devices, 'nvidiactl'), '')
  fs.mkdirSync(path.join(devices, 'dri'))
  const fake = path.join(dir, 'bwrap')
  fs.writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 })
  const result = spawnSync(wrapper, ['--ro-bind', '/', '/', '--', 'echo', '--', 'hello world'], {
    encoding: 'utf8', env: { ...process.env, DSH_GPU_SANDBOX_BWRAP: fake, DSH_GPU_SANDBOX_DEV_ROOT: devices },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.stdout.trimEnd().split('\n'), [
    '--ro-bind', '/', '/',
    '--dev-bind-try', path.join(devices, 'nvidia0'), path.join(devices, 'nvidia0'),
    '--dev-bind-try', path.join(devices, 'nvidiactl'), path.join(devices, 'nvidiactl'),
    '--dev-bind-try', path.join(devices, 'dri'), path.join(devices, 'dri'),
    '--', 'echo', '--', 'hello world',
  ])
})

test('runner rejects a missing separator without invoking bwrap', () => {
  const result = spawnSync(wrapper, ['--ro-bind', '/', '/'], {
    encoding: 'utf8', env: { ...process.env, DSH_GPU_SANDBOX_BWRAP: '/nonexistent-bwrap' },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /^bwrap: .*separator/)
})
