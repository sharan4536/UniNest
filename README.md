
  # UniNest Application

  This is a code bundle for UniNest Application. The original project is available at https://www.figma.com/design/aowiD55AdMBTFr5bO4Rgm0/UniNest-Application.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Sync display names (profiles → users/Auth)

  To update all Firebase `users.displayName` and Auth `displayName` to match the name stored in `profiles.name`, use the admin script:

  1) Set admin credentials: `export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
  2) Dry-run preview: `npm run sync:displaynames -- --dry`
  3) Execute changes: `npm run sync:displaynames`

  Options:
  - `--dry`: no writes, logs intended updates
  - `--limit=N`: process only the first N profile documents

  The script reads each `profiles/{uid}` document, using its `name` (or `displayName`/`fullName` fallback) and sets `users/{uid}.displayName` accordingly. It also attempts to update Firebase Auth `displayName` for the same UID (best-effort).
  
