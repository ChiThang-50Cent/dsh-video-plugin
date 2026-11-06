import fs from 'node:fs/promises'
import path from 'node:path'

export async function writeReport(filename, report) {
  await fs.mkdir(path.dirname(path.resolve(filename)), { recursive: true })
  await fs.writeFile(filename, `${JSON.stringify(report, null, 2)}\n`)
}
