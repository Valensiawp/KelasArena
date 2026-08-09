import React, { useState, useEffect } from 'react';
import { UserProfile, TeacherRoleType } from '../../types';
import { db, generateSyntheticEmail } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Users, UserPlus, Edit, Trash2, Shield, Search, School, BookOpen, CheckCircle, Award } from 'lucide-react';
import { PasswordInput } from '../common/PasswordInput';

interface SchoolOperatorDashboardProps {
  user: UserProfile;
}

export const SchoolOperatorDashboard: React.FC<SchoolOperatorDashboardProps> = ({ user }) => {
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State for Add/Edit Teacher
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<UserProfile | null>(null);

  // Form Fields
  const [teacherName, setTeacherName] = useState('');
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('guru1234');
  const [teacherRole, setTeacherRole] = useState<TeacherRoleType>('Wali Kelas & Guru Mapel');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchTeachers();
  }, [user.school_id]);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const schoolId = user.school_id || 'SCH-01';
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'teacher'),
        where('school_id', '==', schoolId)
      );
      const snap = await getDocs(q);
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        list.push({ uid: d.id, ...d.data() } as UserProfile);
      });
      setTeachers(list);
    } catch (err) {
      console.error('Error fetching teachers:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingTeacher(null);
    setTeacherName('');
    setTeacherUsername('');
    setTeacherPassword('guru1234');
    setTeacherRole('Wali Kelas');
    setIsModalOpen(true);
  };

  const openEditModal = (t: UserProfile) => {
    setEditingTeacher(t);
    setTeacherName(t.name);
    setTeacherUsername(t.username);
    setTeacherPassword(t.password || 'guru1234');
    setTeacherRole(t.teacherRole === 'Wali Kelas' ? 'Wali Kelas' : 'Guru Mapel');
    setIsModalOpen(true);
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName.trim() || !teacherUsername.trim()) return;

    setIsSubmitting(true);
    try {
      const cleanSchoolId = user.school_id || 'SCH-01';
      const cleanUsername = teacherUsername.trim().toLowerCase().replace(/\s+/g, '_');
      const syntheticEmail = generateSyntheticEmail(cleanUsername, cleanSchoolId);

      if (editingTeacher) {
        // Edit Teacher
        const teacherRef = doc(db, 'users', editingTeacher.uid);
        const updatePayload: any = {
          name: teacherName.trim(),
          username: cleanUsername,
          email: syntheticEmail,
          teacherRole: teacherRole,
        };
        if (teacherPassword.trim() && teacherPassword !== '****') {
          updatePayload.password = teacherPassword.trim();
        }
        await updateDoc(teacherRef, updatePayload);
      } else {
        // Add New Teacher
        const newTeacherData = {
          name: teacherName.trim(),
          username: cleanUsername,
          password: teacherPassword.trim() || 'guru1234',
          email: syntheticEmail,
          role: 'teacher',
          teacherRole: teacherRole,
          school_id: cleanSchoolId,
          school_name: user.school_name || 'Sekolah Baru',
          created_at: new Date().toISOString(),
        };

        await addDoc(collection(db, 'users'), newTeacherData);
      }

      setIsModalOpen(false);
      fetchTeachers();
    } catch (err) {
      console.error('Error saving teacher:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTeacher = async (teacherUid: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus akun guru ini? Guru tidak akan dapat masuk kembali ke sistem.')) {
      try {
        await deleteDoc(doc(db, 'users', teacherUid));
        setTeachers(teachers.filter((t) => t.uid !== teacherUid));
      } catch (err) {
        console.error('Error deleting teacher:', err);
      }
    }
  };

  const filteredTeachers = teachers.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.teacherRole && t.teacherRole.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Hero Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-semibold mb-3">
            <School className="w-3.5 h-3.5 mr-1.5" /> Dasbor IT & Operator Sekolah
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Kelola Akun Guru</h1>
          <p className="text-blue-100 text-sm mt-1 max-w-2xl">
            Atur wewenang guru.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-5 py-3 bg-white text-blue-800 hover:bg-blue-50 font-bold text-sm rounded-2xl shadow-lg transition-all flex items-center space-x-2 shrink-0"
        >
          <UserPlus className="w-5 h-5" />
          <span>Tambah Akun Guru</span>
        </button>
      </div>

      {/* Teachers CRUD Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-800 text-base">Daftar Tenaga Pendidik / Guru ({filteredTeachers.length})</h2>
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari guru, username, role..."
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Memuat data guru...</div>
        ) : filteredTeachers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-600">Belum Ada Akun Guru Ditambahkan</p>
            <p className="text-xs text-slate-400">Klik tombol "Tambah Akun Guru" untuk menambahkan tenaga pendidik pertama.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3.5">Nama Guru</th>
                  <th className="px-5 py-3.5">Username</th>
                  <th className="px-5 py-3.5">Role / Wewenang Guru</th>
                  <th className="px-5 py-3.5">Email Synthetic</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTeachers.map((t, idx) => (
                  <tr key={`${t.uid || t.id || 't'}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 font-bold text-slate-900">{t.name}</td>
                    <td className="px-5 py-4 font-mono font-semibold text-amber-700">{t.username}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full font-bold text-[11px] bg-amber-50 text-amber-800 border border-amber-200">
                        <Award className="w-3 h-3 mr-1 text-amber-600" />
                        {t.teacherRole || 'Guru Mapel'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{t.email}</td>
                    <td className="px-5 py-4 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(t)}
                        className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Edit Data & Role Guru"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(t.uid)}
                        className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Hapus Akun Guru"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Teacher Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
            <div className="p-6 bg-gradient-to-r from-amber-500 to-orange-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">
                {editingTeacher ? 'Edit Data & Role Guru' : 'Tambah Akun Guru Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveTeacher} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Lengkap Guru *
                </label>
                <input
                  type="text"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="Contoh: Bpk. Budi Santoso, M.Pd"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={teacherUsername}
                  onChange={(e) => setTeacherUsername(e.target.value)}
                  placeholder="budisambodo"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Password Guru
                </label>
                <PasswordInput
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  placeholder="Masukkan password guru baru"
                  required
                />
              </div>

              {/* PENETAPAN ROLE GURU FLEKSIBEL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Penetapan Role & Wewenang Guru *
                </label>
                <select
                  value={teacherRole}
                  onChange={(e) => setTeacherRole(e.target.value as TeacherRoleType)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="Wali Kelas">Wali Kelas (Kelola Siswa, Kelas, Materi & Kuis AI)</option>
                  <option value="Guru Mapel">Guru Mapel (Kelas, Materi, Live Kuis AI & RPP/LKPD)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Wali Kelas otomatis memiliki seluruh wewenang Guru Mapel ditambah akses Kelola Siswa.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Data Guru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
