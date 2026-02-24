# Progress XP (React + Vite)

This app is now built with React and deployed to GitHub Pages via GitHub Actions.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Deployment

Pushing to `main` triggers the GitHub Action in `.github/workflows/deploy-pages.yml`, which builds and publishes `dist/` to GitHub Pages.

Live URL:

`https://husseinguevara.github.io/HobbyTimer/`

## iPhone Install

1. Open the live URL in Safari.
2. Tap Share.
3. Tap `Add to Home Screen`.

## Backup

Use the app's `Export Backup` and `Import Backup` buttons to move data between devices.

## Cloud Sync (Firebase)

The app supports optional cross-device cloud sync using Firebase Firestore.

1. Create a Firebase project.
2. Enable `Authentication` -> `Anonymous`.
3. Enable `Firestore Database`.
4. Copy web app config values (`apiKey`, `authDomain`, `projectId`, `appId`) into the app's Cloud Sync section.
5. Set the same `Sync ID` on each device.
6. Use `Sync Up` and `Sync Down`.

Recommended Firestore rules (owner-locked sync docs):

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /hobby_timer_sync/{syncId} {
      allow create: if request.auth != null
        && request.resource.data.ownerUid == request.auth.uid;
      allow read, update, delete: if request.auth != null
        && resource.data.ownerUid == request.auth.uid;
    }
  }
}
```
