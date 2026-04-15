# UniNest

Welcome to UniNest! We built this platform to help university students connect, manage their schedules, and find study buddies seamlessly.

## Getting Started

To get the app running locally, follow these simple steps:

1. Install the necessary dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

## Admin Scripts

If you need to sync user profiles across our Firebase backend, we've included a handy script. This ensures that the display names in our `profiles` collection match the records in `users` and Firebase Auth.

### Syncing Display Names

1. Point to your Firebase admin credentials:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   ```

2. Run a dry run to see what will change (without actually writing to the database):
   ```bash
   npm run sync:displaynames -- --dry
   ```

3. When you're ready, execute the changes:
   ```bash
   npm run sync:displaynames
   ```

**Additional Options:**
- `--dry`: Preview intended updates without any writes.
- `--limit=N`: Process only the first N profile documents.

This script scans each `profiles/{uid}` document, grabs the best available name (checking `name`, `displayName`, and `fullName`), and updates `users/{uid}.displayName`. It also tries to update the Firebase Auth `displayName` for the same user on a best-effort basis.

Thanks for checking out UniNest!
