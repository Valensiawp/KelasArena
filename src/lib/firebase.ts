import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  sendPasswordResetEmail, 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile } from '../types';

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

/**
 * Generate synthetic email for students and users without raw email addresses.
 * Format: username.schoolid@kelasarena.internal
 */
export function generateSyntheticEmail(username: string, schoolId: string = 'global'): string {
  const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanSchoolId = schoolId.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanUsername}.${cleanSchoolId}@kelasarena.internal`;
}

/**
 * Smart Username Generator for Students
 * Takes full name (e.g. "Rehan Bakpau Keju") and picks word combinations (e.g. "rehankeju", "rehanbakpau", "bakpaukeju")
 * Appends random digits only if username collides with existing usernames.
 */
export function generateSmartStudentUsername(fullName: string, existingUsernames: Set<string> = new Set()): string {
  const cleanWords = fullName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  if (cleanWords.length === 0) {
    let fallback = `siswa${Math.floor(100 + Math.random() * 900)}`;
    while (existingUsernames.has(fallback)) {
      fallback = `siswa${Math.floor(100 + Math.random() * 900)}`;
    }
    existingUsernames.add(fallback);
    return fallback;
  }

  const candidateBases: string[] = [];

  if (cleanWords.length === 1) {
    candidateBases.push(cleanWords[0]);
  } else if (cleanWords.length === 2) {
    candidateBases.push(`${cleanWords[0]}${cleanWords[1]}`);
    candidateBases.push(cleanWords[0]);
    candidateBases.push(cleanWords[1]);
  } else {
    // 3 or more words (e.g. ["rehan", "bakpau", "keju"])
    const first = cleanWords[0];
    const second = cleanWords[1];
    const last = cleanWords[cleanWords.length - 1];

    candidateBases.push(`${first}${last}`); // rehankeju
    candidateBases.push(`${first}${second}`); // rehanbakpau
    candidateBases.push(`${second}${last}`); // bakpaukeju
    candidateBases.push(first);
  }

  // Shuffle candidate bases slightly for natural variety
  const shuffledCandidates = [...candidateBases].sort(() => Math.random() - 0.5);

  // Try picking an unused candidate base without digits first
  for (const candidate of shuffledCandidates) {
    if (!existingUsernames.has(candidate)) {
      existingUsernames.add(candidate);
      return candidate;
    }
  }

  // If all candidate bases are taken, append random digits to the first candidate base
  const primaryBase = candidateBases[0];
  let attempt = 0;
  let finalUsername = primaryBase;
  while (existingUsernames.has(finalUsername) && attempt < 100) {
    const randomDigits = Math.floor(10 + Math.random() * 90);
    finalUsername = `${primaryBase}${randomDigits}`;
    attempt++;
  }

  existingUsernames.add(finalUsername);
  return finalUsername;
}

/**
 * Send Password Reset Email for registered user email.
 */
export async function sendResetPassword(email: string): Promise<{ success: boolean; message: string }> {
  try {
    await sendPasswordResetEmail(auth, email);
    return {
      success: true,
      message: `Link reset password telah dikirimkan ke email: ${email}`,
    };
  } catch (error: any) {
    console.error('Password reset error:', error);
    return {
      success: false,
      message: error.message || 'Gagal mengirim link reset password.',
    };
  }
}

/**
 * Ensure Default Admin Seeding in Firestore
 * Username: Admin
 * Default Password: 12345678
 */
export async function ensureSuperAdminSeed(): Promise<void> {
  try {
    // Check if any Admin account exists in 'users' collection
    const q = query(collection(db, 'users'), where('role', '==', 'admin'));
    const snap = await getDocs(q);

    if (snap.empty) {
      const superAdminData: UserProfile = {
        uid: 'admin_seed',
        name: 'Admin Utama',
        username: 'Admin',
        email: generateSyntheticEmail('admin', 'SYSTEM_HQ'),
        password: '12345678',
        role: 'admin',
        school_id: 'SYSTEM_HQ',
        school_name: 'Admin KelasArena',
        created_at: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', 'admin_seed'), superAdminData);
      console.log('Admin Seed document successfully created in Firestore.');
    }
  } catch (err) {
    console.warn('Admin seed check skipped:', err);
  }
}

/**
 * Generate Unique 6-character Alphanumeric Code for Class Rooms (C-8K9F2A) or Quizzes (Q-928104)
 * with Firestore Uniqueness Verification.
 */
export async function generateUniqueRoomCode(prefix: 'C' | 'Q', collectionName: 'classes' | 'quizzes'): Promise<string> {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let attempts = 0;

  while (attempts < 10) {
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const fullCode = `${prefix}-${randomPart}`;

    const q = query(collection(db, collectionName), where('code', '==', fullCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      return fullCode;
    }
    attempts++;
  }

  return `${prefix}-${Date.now().toString(36).substring(4, 10).toUpperCase()}`;
}
