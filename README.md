# Vue 3 Application with Firebase Authentication

This application is built using:

- Vue 3 with Composition API
- TypeScript
- Vite (bundler)
- Firebase (backend)
- Vuetify (UI components)

## Core Features

- User authentication via Firebase Auth
- Firestore Database integration
- Routing via Vue Router
- Centralized state management with Pinia

## Project Structure

- `src/` - main application code
  - `components/` - UI components
  - `views/` - application pages
  - `router/` - routing configuration
  - `stores/` - state management
  - `plugins/` - plugins (Vuetify)

## Environment Setup

Firebase configuration is stored in `.env` file:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## How to Run

1. Install dependencies: `npm install`
2. Start development server: `npm run dev`
3. Build for production: `npm run build`
