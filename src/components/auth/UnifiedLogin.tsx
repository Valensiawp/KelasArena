import React, { useState } from 'react';
import { PasswordInput } from '../common/PasswordInput';
import { ForgotPasswordModal } from '../common/ForgotPasswordModal';
import { UserProfile } from '../../types';
import { auth, db, ensureSuperAdminSeed, generateSyntheticEmail } from '../../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { GraduationCap, User, Lock, ArrowRight, ShieldCheck, Trophy } from 'lucide-react';

interface UnifiedLoginProps {
  onLoginSuccess: (user: UserProfile) => void;
}

function getTimeAgoText(dateString?: string): string {
  if (!dateString) return 'beberapa waktu';
  try {
    const updated = new Date(dateString).getTime();
    const now = new Date().getTime();
    const diffMs = Math.max(0, now - updated);

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)} detik`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} menit`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} hari`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} bulan`;

    const years = Math.floor(months / 12);
    return `${years} tahun`;
  } catch (e) {
    return 'beberapa waktu';
  }
}

export const UnifiedLogin: React.FC<UnifiedLoginProps> = ({ onLoginSuccess }) => {
  const [identityInput, setIdentityInput] = useState(''); // Email or Username
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  // Helper to query user in Firestore by email or username
  const findUserInFirestore = async (input: string): Promise<UserProfile | null> => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const lower = trimmed.toLowerCase();
    const underscored = lower.replace(/\s+/g, '_');
    const stripped = lower.replace(/[^a-z0-9]/g, '');
    const usersRef = collection(db, 'users');

    // Query candidates by username or email
    try {
      const qUsername = query(usersRef, where('username', '==', trimmed));
      const snapUsername = await getDocs(qUsername);
      if (!snapUsername.empty) {
        const d = snapUsername.docs[0];
        return { uid: d.id, ...d.data() } as UserProfile;
      }

      const qUsernameLower = query(usersRef, where('username', '==', lower));
      const snapUsernameLower = await getDocs(qUsernameLower);
      if (!snapUsernameLower.empty) {
        const d = snapUsernameLower.docs[0];
        return { uid: d.id, ...d.data() } as UserProfile;
      }

      const qUsernameUnderscored = query(usersRef, where('username', '==', underscored));
      const snapUsernameUnderscored = await getDocs(qUsernameUnderscored);
      if (!snapUsernameUnderscored.empty) {
        const d = snapUsernameUnderscored.docs[0];
        return { uid: d.id, ...d.data() } as UserProfile;
      }
    } catch (e) {
      console.warn('Query by username warning:', e);
    }

    // Fallback scan across users
    try {
      const allSnap = await getDocs(usersRef);
      for (const d of allSnap.docs) {
        const uData = d.data() as UserProfile;
        const uName = uData.username || '';
        const uEmail = uData.email || '';

        if (
          uName === trimmed ||
          uName.toLowerCase() === lower ||
          uEmail === trimmed ||
          uEmail.toLowerCase() === lower
        ) {
          return { uid: d.id, ...uData };
        }
      }
    } catch (e) {
      console.warn('Fallback scan warning:', e);
    }

    return null;
  };

  // Auto-detect role & authenticate user
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = identityInput.trim();
    if (!rawInput || !password) return;

    setLoading(true);
    setErrorMsg('');

    try {
      await ensureSuperAdminSeed();

      // Look up user in Firestore
      let matchedUserDoc = await findUserInFirestore(rawInput);

      // STRICT VALIDATION: If account is not in database, REJECT IMMEDIATELY!
      if (!matchedUserDoc) {
        throw new Error(`⚠️ AKUN TIDAK TERDAFTAR!\nUsername "${rawInput}" tidak terdaftar dalam sistem. Silakan periksa kembali username Anda atau hubungi Administrator.`);
      }

      // STRICT CASE SENSITIVITY CHECK:
      // Username/email MUST match exact character case!
      const isExactMatch =
        matchedUserDoc.username === rawInput ||
        matchedUserDoc.email === rawInput;

      if (!isExactMatch) {
        throw new Error(`⚠️ USERNAME TIDAK COCOK!\nUsername yang Anda masukkan berbeda dalam penggunaan huruf besar/kecil. (Misal: "${matchedUserDoc.username}" berbeda dengan "${rawInput}"). Silakan masukkan username dengan huruf besar/kecil yang tepat.`);
      }

      // Authenticate via Firestore Password Validation & Firebase Auth
      const targetEmail = matchedUserDoc.email || generateSyntheticEmail(matchedUserDoc.username, matchedUserDoc.school_id || 'HQ');
      let authUser: any = null;

      const inputPassword = password.trim();
      const storedPassword = matchedUserDoc.password ? matchedUserDoc.password.trim() : null;

      // STRICT VALIDATION against Firestore stored password
      if (storedPassword) {
        if (inputPassword !== storedPassword) {
          if (matchedUserDoc.updated_at) {
            const timeAgo = getTimeAgoText(matchedUserDoc.updated_at);
            throw new Error(`⚠️ PASSWORD SALAH ATAU TELAH DIUBAH!\nPassword yang Anda masukkan tidak cocok. Jika password baru saja diperbarui ${timeAgo} yang lalu, gunakan password baru tersebut.`);
          } else {
            throw new Error('Password yang Anda masukkan salah. Silakan periksa kembali password Anda.');
          }
        }
      } else {
        // Fallback default password if no stored password
        const defaultPassword = (matchedUserDoc.role === 'admin' || matchedUserDoc.role === 'super_admin') ? '12345678' : '123456';
        if (inputPassword !== defaultPassword) {
          throw new Error('Password yang Anda masukkan salah. Silakan periksa kembali password Anda.');
        }
      }

      // Perform Firebase Auth sign-in / sync
      try {
        const userCredential = await signInWithEmailAndPassword(auth, targetEmail, inputPassword);
        authUser = userCredential.user;
      } catch (authError: any) {
        try {
          const newCred = await createUserWithEmailAndPassword(auth, targetEmail, inputPassword);
          authUser = newCred.user;
        } catch (createErr: any) {
          authUser = { uid: matchedUserDoc.uid, email: targetEmail };
        }
      }

      const finalUserProfile: UserProfile = {
        ...matchedUserDoc,
        uid: matchedUserDoc.uid,
        password: inputPassword,
      };

      onLoginSuccess(finalUserProfile);
    } catch (err: any) {
      console.error('Login error:', err);
      let msg = err.message || 'Gagal masuk. Periksa kembali Username dan Password Anda.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Password yang Anda masukkan salah.';
      } else if (err.code === 'auth/user-not-found') {
        msg = 'Akun tidak terdaftar. Hubungi Wali Kelas atau Admin Sekolah Anda.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Banner Branding */}
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <GraduationCap className="w-6 h-6 text-white" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-slate-950 shadow-sm border border-slate-900">
              <Trophy className="w-3 h-3 font-bold" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-amber-300">KelasArena</h1>
            <p className="text-xs text-blue-300 font-medium">SaaS Pendidikan</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center space-x-2 bg-slate-800/60 backdrop-blur border border-slate-700/50 px-3.5 py-1.5 rounded-full text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Keamanan Terjamin & Cloud Proxy AI</span>
        </div>
      </div>

      {/* Main Single Login Card */}
      <div className="max-w-md w-full mx-auto my-auto py-8">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl shadow-blue-900/40 border border-white/20 text-slate-800">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Selamat Datang</h2>
            <p className="text-xs text-slate-500 mt-1">
              Masuk dengan akun resmi Anda.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Unified Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identityInput}
                  onChange={(e) => setIdentityInput(e.target.value)}
                  placeholder="Username"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <div className="mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                showLockIcon={true}
                className="bg-slate-50 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <span>Memproses Authentifikasi...</span>
              ) : (
                <>
                  <span>Masuk ke Dasbor</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-slate-400 py-2">
        &copy; {new Date().getFullYear()} KelasArena Platform SaaS Pendidikan & Live Kuis AI. Hak Cipta Dilindungi.
      </div>
    </div>
  );
};
