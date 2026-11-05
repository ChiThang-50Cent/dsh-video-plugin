#!/usr/bin/env node
// Print the resolved studio roots as JSON for agents and for path checks.
import path from 'node:path'
import { codeRoot, paths } from './studio-paths.mjs'

console.log(JSON.stringify({
  ...paths,
  rules: path.join(codeRoot, 'AGENTS.md'),
}, null, 2))
