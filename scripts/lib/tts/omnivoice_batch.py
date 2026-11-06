#!/usr/bin/env python3
"""Persistent OmniVoice worker; stdout is reserved for the JSON-lines protocol."""
import argparse
import contextlib
import json
import os
import sys

protocol = os.fdopen(os.dup(1), 'w', buffering=1)
os.dup2(2, 1)


def send(value):
    print(json.dumps(value, ensure_ascii=False), file=protocol, flush=True)


parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True)
parser.add_argument('--device', required=True)
parser.add_argument('--voice-reference', required=True)
parser.add_argument('--ref-text', required=True)
args = parser.parse_args()

import torch
import soundfile as sf
from importlib.metadata import PackageNotFoundError, version
from omnivoice.models.omnivoice import OmniVoice

if args.device.startswith('cuda') and not torch.cuda.is_available():
    raise RuntimeError('CUDA unavailable; refusing CPU fallback')
model = OmniVoice.from_pretrained(args.model, device_map=args.device, dtype=torch.float16)
actual_device = str(model.device)
if args.device.startswith('cuda') and not actual_device.startswith('cuda'):
    raise RuntimeError(f'CUDA requested but model is on {actual_device}; refusing CPU fallback')
prompt = model.create_voice_clone_prompt(ref_audio=args.voice_reference, ref_text=args.ref_text)
try:
    package_version = version('omnivoice')
except PackageNotFoundError:
    package_version = 'unknown'
send({'type': 'ready', 'device': actual_device, 'version': package_version})
for line in sys.stdin:
    request = json.loads(line)
    try:
        with contextlib.redirect_stdout(sys.stderr):
            audio = model.generate(text=request['text'], language=request.get('language'), voice_clone_prompt=prompt)[0]
            sf.write(request['output'], audio, model.sampling_rate, format='WAV')
        send({'type': 'result', 'id': request['id'], 'ok': True, 'durationSec': len(audio) / model.sampling_rate})
    except Exception as error:
        send({'type': 'result', 'id': request.get('id'), 'ok': False, 'error': str(error)})
        break
