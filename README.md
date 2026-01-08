# Filler Word Counter

A Chrome extension that captures tab audio and counts filler words (err, erm, uh) using local Whisper AI, displayed on a rolling chart.

## Features

- Captures audio from any browser tab
- Uses Whisper AI (runs locally in browser via WebGPU/WASM)
- Real-time rolling chart like Windows Performance Monitor
- Counts: err, erm/um/hmm, uh/ah
- No data sent to external servers

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation
1. Clone this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Navigate to a tab with audio (YouTube, podcast, etc.)
2. Click the extension icon
3. Click "Start" (first run downloads ~40MB model)
4. Filler words will be counted and displayed on the chart

## Publishing (CI/CD)

This extension uses GitHub Actions for automated publishing to the Chrome Web Store.

### Required Secrets

Set these in your repository settings (Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| `CHROME_EXTENSION_ID` | Your extension ID from Chrome Web Store |
| `CHROME_CLIENT_ID` | OAuth 2.0 Client ID |
| `CHROME_CLIENT_SECRET` | OAuth 2.0 Client Secret |
| `CHROME_REFRESH_TOKEN` | OAuth 2.0 Refresh Token |

### Getting Chrome Web Store API Credentials

1. **Create a developer account** at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

2. **Upload your extension manually first** to get an Extension ID

3. **Create OAuth credentials**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project (or use existing)
   - Enable the "Chrome Web Store API"
   - Go to Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: Desktop app
   - Note the Client ID and Client Secret

4. **Get a Refresh Token**:
   ```bash
   # Replace with your client ID
   CLIENT_ID="your-client-id"

   # Open this URL in browser and authorize:
   echo "https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=${CLIENT_ID}&redirect_uri=urn:ietf:wg:oauth:2.0:oob"

   # After authorizing, you'll get a code. Exchange it for tokens:
   CODE="paste-code-here"
   CLIENT_SECRET="your-client-secret"

   curl "https://oauth2.googleapis.com/token" \
     -d "client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${CODE}&grant_type=authorization_code&redirect_uri=urn:ietf:wg:oauth:2.0:oob"
   ```

   Save the `refresh_token` from the response.

### Triggering a Release

- **Automatic**: Push a tag like `v1.0.0`
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```

- **Manual**: Go to Actions → "Build and Publish" → Run workflow

## Development

```bash
# Make changes to the extension
# Update version in manifest.json
# Commit and tag
git add .
git commit -m "Release v1.0.1"
git tag v1.0.1
git push && git push --tags
```

## License

MIT
