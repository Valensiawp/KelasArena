import React, { useState } from 'react';
import { PasswordInput } from './PasswordInput';
import { auth, db } from '../../lib/firebase';
import { updatePassword } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { KeyRound, CheckCircle2, ShieldCheck, X } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUid: string;
  targetName: string;
  isSelf?: boolean;
  onSuccess?: (newPassword: string) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  targetUid,
  targetName,
  isSelf = true,
  onSuccess,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!newPassword.trim()) {
      setMessage({ type: 'error', text: 'Password baru tidak boleh kosong.' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password minimal 6 karakter.' });
      return;
    }

    if (isSelf && newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Konfirmasi password tidak cocok.' });
      return;
    }

    setLoading(true);

    try {
      const cleanUid = targetUid || '';
      let updatedCount = 0;

      // Search all documents in 'users' collection where document ID matches or fields match
      const usersRef = collection(db, 'users');

      // 1. Try direct update if document exists at users/{cleanUid}
      if (cleanUid) {
        try {
          const directRef = doc(db, 'users', cleanUid);
          const directSnap = await getDoc(directRef);
          if (directSnap.exists()) {
            await updateDoc(directRef, {
              password: newPassword.trim(),
              updated_at: new Date().toISOString(),
            });
            updatedCount++;
          }
        } catch (dErr) {
          console.warn('Direct update user warning:', dErr);
        }
      }

      // 2. Search for existing documents where 'uid' field equals cleanUid
      if (cleanUid) {
        try {
          const qUid = query(usersRef, where('uid', '==', cleanUid));
          const snapUid = await getDocs(qUid);
          for (const userDoc of snapUid.docs) {
            await updateDoc(doc(db, 'users', userDoc.id), {
              password: newPassword.trim(),
              updated_at: new Date().toISOString(),
            });
            updatedCount++;
          }
        } catch (qErr) {
          console.warn('Query update user by uid warning:', qErr);
        }
      }

      // 3. Fallback: Search by username if targetName or targetUid contains username
      if (updatedCount === 0 && targetName) {
        try {
          const qName = query(usersRef, where('name', '==', targetName));
          const snapName = await getDocs(qName);
          for (const userDoc of snapName.docs) {
            await updateDoc(doc(db, 'users', userDoc.id), {
              password: newPassword.trim(),
              updated_at: new Date().toISOString(),
            });
            updatedCount++;
          }
        } catch (nErr) {
          console.warn('Query update user by name warning:', nErr);
        }
      }

      // 4. If user is changing their own password, update Firebase Auth session user as well
      if (isSelf && auth.currentUser) {
        try {
          await updatePassword(auth.currentUser, newPassword.trim());
        } catch (authErr) {
          console.warn('Firebase Auth updatePassword warning:', authErr);
        }
      }

      setMessage({
        type: 'success',
        text: isSelf
          ? 'Password Anda berhasil diperbarui!'
          : `Password untuk akun "${targetName}" berhasil diubah!`,
      });

      if (onSuccess) {
        onSuccess(newPassword.trim());
      }

      setTimeout(() => {
        setNewPassword('');
        setConfirmPassword('');
        setMessage(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error updating password:', err);
      setMessage({
        type: 'error',
        text: err.message || 'Gagal mengubah password. Silakan coba lagi.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <KeyRound className="w-5 h-5" />
            <h3 className="font-bold text-lg">
              {isSelf ? 'Ganti Password Saya' : `Ubah Password (${targetName})`}
            </h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-500">
            {isSelf
              ? 'Masukkan password baru Anda langsung tanpa perlu verifikasi password lama.'
              : `Atur password baru untuk akun ${targetName}. Pengguna dapat langsung masuk menggunakan password ini.`}
          </p>

          {message && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center space-x-2 ${
                message.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {message.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Password Baru *
            </label>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Masukkan password baru (min. 6 karakter)"
              required
            />
          </div>

          {isSelf && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Konfirmasi Password Baru *
              </label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                required
              />
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50 flex items-center space-x-2"
            >
              {loading ? (
                <span>Menyimpan Password...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Simpan Password Baru</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
