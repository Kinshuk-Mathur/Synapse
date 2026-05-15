# SYNAPSE Dashboard

This folder is the Next.js dashboard website project.

## Run Locally

```bash
cd synapse-dashborad
npm install
npm run dev
```

## Install Firebase Later

Firebase is used from the modular v9+ SDK. Install it inside this folder only:

```bash
cd synapse-dashborad
npm install firebase
```

Then copy `.env.local.example` to `.env.local` and fill the Firebase values from your Firebase project settings.

Core Firebase files:

```txt
src/lib/firebase.js
src/context/AuthContext.jsx
src/components/ProtectedRoute.jsx
src/services/firestore.js
src/app/login/page.jsx
```

For Netlify, add the same `NEXT_PUBLIC_FIREBASE_*` values in Site settings > Environment variables.

If you deploy `synapse-todo` separately, add this to the dashboard site too:

```txt
NEXT_PUBLIC_TODO_APP_URL=https://your-synapse-todo-site.netlify.app
```

## Netlify

The root `netlify.toml` already tells Netlify to deploy this folder:

```txt
Base directory: synapse-dashborad
Build command: npm run build
Publish directory: .next
```
