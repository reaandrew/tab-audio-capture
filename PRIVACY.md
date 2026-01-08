# Privacy Policy - Filler Word Counter

**Last updated:** January 2025

## Data Collection

Filler Word Counter does **not** collect, store, or transmit any user data.

## How It Works

- Audio from browser tabs is captured and processed **entirely locally** on your device
- Speech-to-text processing uses Whisper AI running in your browser via WebAssembly
- No audio, transcripts, or usage data is ever sent to external servers
- No data is stored after you close the extension

## Third-Party Services

The extension loads the Transformers.js library from `cdn.jsdelivr.net` to run the AI model. This is code only - no user data is transmitted.

## Permissions

| Permission | Why It's Needed |
|------------|-----------------|
| `activeTab` | Identify which tab to capture audio from |
| `tabCapture` | Capture the audio stream from the tab |
| `offscreen` | Run Whisper AI processing in the background |

## Contact

For questions about this privacy policy, please open an issue at:
https://github.com/reaandrew/tab-audio-capture/issues

## Changes

Any changes to this privacy policy will be posted to this page.
