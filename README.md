# Hobby Time Tracker (iPhone Ready)

This app is set up to auto-deploy to GitHub Pages.

## One-Time Setup

1. Create a new empty GitHub repository.
2. In this project folder, run:

```bash
git add .
git commit -m "Initial hobby tracker app"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

3. In GitHub, open your repo:
   - Go to `Settings` -> `Pages`
   - Under `Build and deployment`, set `Source` to `GitHub Actions`

## After Setup

Any push to `main` auto-deploys the app.

Your URL will be:

`https://<your-username>.github.io/<your-repo>/`

## Install on iPhone

1. Open that URL in Safari.
2. Tap Share.
3. Tap `Add to Home Screen`.
