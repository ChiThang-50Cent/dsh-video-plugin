import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const kit = path.join(import.meta.dirname, '..', 'kit')

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(kit, name), 'utf8'))
}

test('kit contracts parse and declare the current schemas', () => {
  assert.equal(read('project.json').defaultMode, 'narrated')
  assert.equal(read('production.json').mode, 'narrated')
  const throughline = read('throughline-map.json')
  assert.equal(throughline.schemaVersion, 1)
  for (const field of ['centralQuestion', 'promise', 'audience']) assert.equal(typeof throughline[field], 'string')
  assert.equal(throughline.sections[0].purpose.length > 0, true)
  assert.equal(read('claim-check.json').schemaVersion, 2)
  const review = read('narration-review.json')
  assert.equal(review.schemaVersion, 2)
  assert.equal(review.status, 'blocked')
  assert.equal(review.criteriaEvidence !== undefined, true)
  assert.equal(read('segments.json').schemaVersion, 2)
  const result = read('scene-result.json')
  assert.equal(Array.isArray(result.changedFiles), true)
  assert.equal(result.status, 'FAIL')
  assert.equal(Array.isArray(read('worker-plan.json').workers), true)
})
