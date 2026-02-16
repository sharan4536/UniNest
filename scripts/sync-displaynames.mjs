// Sync Firebase Auth and Firestore users.displayName from profiles.name
// Usage:
//   node scripts/sync-displaynames.mjs [--dry] [--limit=N]
// Requires admin credentials. Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Parse CLI args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

// Init Admin SDK
initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

// Collections
const profilesCol = db.collection('profiles');
const usersCol = db.collection('users');

function log(...parts) { console.log('[sync-displaynames]', ...parts); }
function err(...parts) { console.error('[sync-displaynames]', ...parts); }

async function main() {
  log(`Starting sync${isDryRun ? ' (dry-run)' : ''}${limit ? `, limit=${limit}` : ''}`);

  const snap = await profilesCol.get();
  const docs = snap.docs;
  const total = limit ? Math.min(limit, docs.length) : docs.length;
  let updatedFirestore = 0;
  let updatedAuth = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < total; i++) {
    const doc = docs[i];
    const uid = doc.id;
    const data = doc.data();
    const name = (data && (data.name || data.displayName || data.fullName)) || null;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      skipped++;
      log(`Skipping uid=${uid}: no valid profile name`);
      continue;
    }

    const normalizedName = name.trim();

    try {
      // Firestore: users.displayName
      if (!isDryRun) {
        await usersCol.doc(uid).set({ displayName: normalizedName }, { merge: true });
      }
      updatedFirestore++;
      log(`Firestore updated uid=${uid} displayName="${normalizedName}"`);

      // Auth: user.displayName (best-effort)
      try {
        if (!isDryRun) {
          await auth.updateUser(uid, { displayName: normalizedName });
        }
        updatedAuth++;
        log(`Auth updated uid=${uid} displayName="${normalizedName}"`);
      } catch (authError) {
        // If auth user missing or insufficient permissions, continue
        errors++;
        err(`Auth update failed uid=${uid}:`, authError?.message || authError);
      }
    } catch (e) {
      errors++;
      err(`Firestore update failed uid=${uid}:`, e?.message || e);
    }
  }

  log(`Done. processed=${total}, firestoreUpdates=${updatedFirestore}, authUpdates=${updatedAuth}, skipped=${skipped}, errors=${errors}`);
}

main().catch((e) => {
  err('Fatal error:', e?.message || e);
  process.exitCode = 1;
});

