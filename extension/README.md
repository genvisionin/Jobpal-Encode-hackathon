# Jobpal Magic Fill Extension

Independent Chromium Manifest V3 extension for filling job application forms from a Jobpal profile.

## Development

```bash
npm install
npm run build
```

Load `extension/dist` in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this package's `dist` folder.

The extension talks to `VITE_JOBPAL_APP_URL` at build time. It defaults to `http://localhost:3000`.

```bash
VITE_JOBPAL_APP_URL=https://your-jobpal-domain.com npm run build
```

For production, set `CHROME_EXTENSION_ORIGIN` in the Jobpal app to the published extension origin, for example `chrome-extension://abcdefghijklmnopabcdefghijklmnop`.
