# SYNAPSE Dashboard

This folder is the Next.js dashboard website project.

## Run Locally

```bash
cd synapse-dashborad
npm install
npm run dev
```

## Install Firebase Later

Run Firebase install inside this folder only:

```bash
cd synapse-dashborad
npm install firebase
```

Then copy `.env.local.example` to `.env.local` and fill the Firebase values from your Firebase project settings.

## Netlify

The root `netlify.toml` already tells Netlify to deploy this folder:

```txt
Base directory: synapse-dashborad
Build command: npm run build
Publish directory: .next
```
