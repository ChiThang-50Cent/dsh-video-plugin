import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

test('the package version is the newest released changelog entry and is shipped with its link', () => {
  const { version, files } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  const released = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/gm)].map((match) => match[1])
  assert.equal(released[0], version, 'bump package.json and add a changelog heading together')
  assert.equal(new Set(released).size, released.length, 'each version appears once')
  for (const entry of released) assert.match(changelog, new RegExp(`^\\[${entry.replaceAll('.', '\\.')}\\]: `, 'm'), `missing link for ${entry}`)
  assert.ok(files.includes('CHANGELOG.md'))
})
