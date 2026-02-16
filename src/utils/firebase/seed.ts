import { db, isFirebaseConfigured } from './client';
import { collection, doc, setDoc } from 'firebase/firestore';

export type SeedFriend = {
  id: string;
  name: string;
  major?: string;
  university?: string;
  year?: string;
  location?: { lat: number; lng: number; name?: string };
};

// Vellore Institute of Technology, Vellore campus center
const base = { lat: 12.969728, lng: 79.160694 };
// small jitter to spread markers around campus
const jitter = (n: number) => (Math.random() - 0.5) * n;

export async function seedFriends(): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured');

  const friends: SeedFriend[] = [
    { id: 'sharan', name: 'Sharan', major: 'CSE' },
    { id: 'keerthi', name: 'Keerthi', major: 'ECE' },
    { id: 'sonika', name: 'Sonika', major: 'IT' },
    { id: 'abhinav', name: 'Abhinav', major: 'MECH' },
    { id: 'pavan', name: 'Pavan', major: 'EEE' },
  ].map((f, i) => ({
    ...f,
    university: 'Demo University',
    year: `${(i % 4) + 1}rd Year`,
    location: {
      lat: base.lat + jitter(0.0025),
      lng: base.lng + jitter(0.0025),
      name: ['Library', 'Cafeteria', 'Lab', 'Hostel', 'Ground'][i % 5],
    },
  }));

  const usersCol = collection(db, 'users');
  const locCol = collection(db, 'friendLocations');

  const writes: Promise<any>[] = [];

  for (const f of friends) {
    writes.push(setDoc(doc(usersCol, f.id), {
      id: f.id,
      name: f.name,
      major: f.major,
      university: f.university,
      year: f.year,
      online: true,
    }, { merge: true }));

    if (f.location) {
      writes.push(setDoc(doc(locCol, f.id), {
        id: f.id,
        name: f.name,
        major: f.major,
        location: f.location,
        updatedAt: Date.now(),
      }, { merge: true }));
    }
  }

  await Promise.all(writes);
}
