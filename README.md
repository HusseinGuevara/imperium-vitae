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

For Firebase auth to work on the live site, set these repository secrets in GitHub:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

Important: the secret values must be your real Firebase values (for example `AIza...`, `your-project.firebaseapp.com`), not the variable names.

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

## Social Login Checklist

If Google/Apple login fails on phone, verify:

1. GitHub repo secrets above are set.
2. Firebase Authentication providers are enabled (`Google`, `Apple` if used).
3. Firebase Auth authorized domains include `husseinguevara.github.io`.

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
