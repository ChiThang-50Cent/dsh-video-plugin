import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPreflight } from '../scripts/preflight.mjs'

const success = (stdout = '') => ({ ok: true, stdout, stderr: '', status: 0, signal: null })
const failure = (errorCode = 'ENOENT') => ({ ok: false, stdout: '', stderr: 'not available', status: null, signal: null, errorCode })

function report({ smi = failure(), nvenc = failure(), cuda = failure(), pci = failure(), driverGpus = [], host = [], python, env = {} } = {}) {
  const calls = []
  const probes = {
    exists: (path) => host.includes(path),
    readDirectory: () => driverGpus,
    probeCommand: (command) => ({ available: true, command, resolved: command, summary: '', error: null }),
    runBounded: (command, args, options) => {
      calls.push({ command, args, options })
      if (command === 'lspci') return pci
      if (command === 'nvidia-smi') return smi
      if (command === 'ffmpeg') return nvenc
      return cuda
    },
  }
  return { result: buildPreflight({ env, python, probes }), calls }
}

test('successful real encoder probe recommends NVENC without asserting TTS readiness', () => {
  const { result, calls } = report({ smi: success('GPU A, 1024, 8.6\n'), nvenc: success(), env: { CUDA_VISIBLE_DEVICES: '0' } })
  assert.equal(result.gpu.status, 'available')
  assert.equal(result.gpu.recommendedEncoder, 'h264_nvenc')
  assert.equal(result.gpu.devices[0].memoryFreeMiB, 1024)
  assert.equal(result.gpu.visibility.cudaVisibleDevices, '0')
  assert.equal(result.gpu.ttsReady, false)
  assert.equal(result.gpu.cuda.tested, false)
  const encode = calls.find((call) => call.command === 'ffmpeg')
  assert.ok(encode.args.includes('h264_nvenc'))
  assert.ok(encode.args.includes('color=c=black:s=320x240:r=25:d=1'))
  assert.equal(encode.options.timeoutMs, 10000)
  assert.equal(encode.options.retries, 0)
})

test('distinguishes unavailable encoder, inaccessible GPU and no evidence', () => {
  const detected = report({ smi: success('GPU A, 512, 8.0\n') }).result.gpu
  assert.equal(detected.status, 'available')
  assert.equal(detected.recommendedEncoder, 'libx264')
  assert.ok(detected.remediation)
  const hidden = report({ host: ['/dev/dxg'], env: { NVIDIA_VISIBLE_DEVICES: 'none' } }).result.gpu
  assert.equal(hidden.status, 'hidden-by-sandbox')
  assert.equal(hidden.visibility.wslGpuDevice, true)
  assert.equal(hidden.visibility.nvidiaVisibleDevices, 'none')
  assert.equal(report({ driverGpus: ['0000:01:00.0'] }).result.gpu.status, 'hidden-by-sandbox')
  assert.equal(report({ pci: success('01:00.0 VGA compatible controller: NVIDIA Corporation Device\\n') }).result.gpu.status, 'hidden-by-sandbox')
  assert.equal(report().result.gpu.status, 'absent')
})

test('optional Python CUDA probe reports actual result and failure independently', () => {
  const cuda = success(JSON.stringify({ available: true, deviceCount: 1, torchVersion: '2', cudaVersion: '12' }))
  const { result, calls } = report({ python: '/env/bin/python', cuda })
  assert.equal(result.gpu.cuda.available, true)
  assert.equal(result.gpu.cuda.deviceCount, 1)
  assert.equal(result.gpu.status, 'absent')
  const call = calls.find((entry) => entry.command === '/env/bin/python')
  assert.equal(call.options.timeoutMs, 15000)
  assert.equal(call.options.retries, 0)
  assert.equal(report({ python: 'python3', cuda: failure('ETIMEDOUT') }).result.gpu.cuda.error, 'ETIMEDOUT')
  assert.equal(report({ python: 'python3', cuda: success('bad') }).result.gpu.cuda.error, 'invalid-output')
})
