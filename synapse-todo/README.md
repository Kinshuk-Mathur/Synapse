# SYNAPSE Todo

Standalone Next.js project for the SYNAPSE Todo Command Center.

## Run Locally

```bash
cd synapse-todo
npm install
npm run dev
```

The Todo app opens at `/` and redirects unauthenticated users to `/login`.

If the dashboard app is already running on port `3000`, run Todo on `3001`:

```bash
npm run dev -- -p 3001
```

## Firebase

This project uses the same Firebase project as the dashboard.

Copy `.env.local.example` to `.env.local`, then fill:

```txt
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

## Deploy

If deploying this as a separate Netlify site:

```txt
Base directory: synapse-todo
Build command: npm run build
Publish directory: .next
```

Add the same Firebase environment variables in Netlify.
