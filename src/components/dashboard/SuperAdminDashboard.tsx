import React, { useState, useEffect } from 'react';
import { UserProfile, School } from '../../types';
import { db, sendResetPassword } from '../../lib/firebase';
import { collection, getDocs, addDoc, doc, deleteDoc, query, where, updateDoc } from 'firebase/firestore';
import { 
  Building2, Plus, Trash2, CheckCircle2, Shield, Search, School as SchoolIcon,
  Download, Users, GraduationCap, Mail, AlertCircle, Wand2, KeyRound
} from 'lucide-react';
import { PasswordInput } from '../common/PasswordInput';
import { ChangePasswordModal } from '../common/ChangePasswordModal';

interface SuperAdminDashboardProps {
  user: UserProfile;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ user }) => {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Operator Password Edit Modal State
  const [editingOperator, setEditingOperator] = useState<{
    uid: string;
    name: string;
    schoolName: string;
  } | null>(null);

  // Stats
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalQuizzes, setTotalQuizzes] = useState(0);

  // Add School Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [operatorUsername, setOperatorUsername] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('12345678');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch Schools
      const schoolSnap = await getDocs(collection(db, 'schools'));
      const schoolList: School[] = [];
      schoolSnap.forEach((d) => schoolList.push({ id: d.id, ...d.data() } as School));
      setSchools(schoolList);

      // Fetch Users Count
      const userSnap = await getDocs(collection(db, 'users'));
      setTotalUsers(userSnap.size);

      // Fetch Classes Count
      const classSnap = await getDocs(collection(db, 'classes'));
      setTotalClasses(classSnap.size);

      // Fetch Quizzes Count
      const quizSnap = await getDocs(collection(db, 'quizzes'));
      setTotalQuizzes(quizSnap.size);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;

    setIsSubmitting(true);
    try {
      const schoolCode = 'SCH-' + Math.floor(1000 + Math.random() * 9000);
      const rawOpUsername = operatorUsername.trim();
      const generatedOpUsername = rawOpUsername
        ? rawOpUsername.toLowerCase().replace(/\s+/g, '_')
        : `op_${schoolCode.toLowerCase()}`;

      const newSchool = {
        name: schoolName.trim(),
        code: schoolCode,
        operator_username: generatedOpUsername,
        operator_email: `${generatedOpUsername}@kelasarena.internal`,
        created_at: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'schools'), newSchool);

      // Create Operator User in Firestore
      const operatorDoc = {
        uid: `op_${docRef.id}`,
        name: `Operator ${schoolName.trim()}`,
        username: generatedOpUsername,
        password: operatorPassword.trim() || '12345678',
        email: `${generatedOpUsername}@kelasarena.internal`,
        role: 'school_operator',
        school_id: docRef.id,
        school_name: schoolName.trim(),
        created_at: new Date().toISOString(),
      };

      await addDoc(collection(db, 'users'), operatorDoc);

      setSchoolName('');
      setOperatorUsername('');
      setOperatorPassword('12345678');
      setIsModalOpen(false);
      fetchDashboardData();
    } catch (err) {
      console.error('Error adding school:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openResetOperatorPasswordModal = async (school: School) => {
    try {
      const q = query(
        collection(db, 'users'),
        where('school_id', '==', school.id),
        where('role', '==', 'school_operator')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const opUser = snap.docs[0];
        setEditingOperator({
          uid: opUser.id,
          name: opUser.data().name || `Operator ${school.name}`,
          schoolName: school.name,
        });
      } else {
        alert(`Akun operator untuk ${school.name} tidak ditemukan.`);
      }
    } catch (err) {
      console.error('Error finding operator user:', err);
    }
  };

  const handleDeleteSchoolCascade = async (schoolId: string, schoolName: string) => {
    if (
      window.confirm(
        `Apakah Anda yakin ingin menghapus "${schoolName}"?\n\nPERINGATAN SANGAT PENTING:\nSemua akun operator, guru, siswa, room kelas, room kuis, materi, dan data terkait sekolah ini akan TERHAPUS PERMANEN secara otomatis dari database!`
      )
    ) {
      try {
        setLoading(true);

        // 1. Delete school document
        await deleteDoc(doc(db, 'schools', schoolId));

        // 2. Delete all user accounts associated with this school (Operators, Teachers, Students)
        const usersQuery = query(collection(db, 'users'), where('school_id', '==', schoolId));
        const usersSnap = await getDocs(usersQuery);
        let deletedUsers = 0;
        for (const uDoc of usersSnap.docs) {
          await deleteDoc(doc(db, 'users', uDoc.id));
          deletedUsers++;
        }

        // 3. Delete all classes associated with this school
        const classesQuery = query(collection(db, 'classes'), where('school_id', '==', schoolId));
        const classesSnap = await getDocs(classesQuery);
        let deletedClasses = 0;
        for (const cDoc of classesSnap.docs) {
          await deleteDoc(doc(db, 'classes', cDoc.id));
          deletedClasses++;
        }

        // 4. Delete all quizzes associated with this school
        const quizzesQuery = query(collection(db, 'quizzes'), where('school_id', '==', schoolId));
        const quizzesSnap = await getDocs(quizzesQuery);
        let deletedQuizzes = 0;
        for (const qDoc of quizzesSnap.docs) {
          await deleteDoc(doc(db, 'quizzes', qDoc.id));
          deletedQuizzes++;
        }

        // 5. Delete all materials associated with this school
        const materialsQuery = query(collection(db, 'materials'), where('school_id', '==', schoolId));
        const materialsSnap = await getDocs(materialsQuery);
        for (const mDoc of materialsSnap.docs) {
          await deleteDoc(doc(db, 'materials', mDoc.id));
        }

        // Update UI state live automatically without refresh!
        setSchools((prev) => prev.filter((s) => s.id !== schoolId));
        setTotalUsers((prev) => Math.max(0, prev - deletedUsers));
        setTotalClasses((prev) => Math.max(0, prev - deletedClasses));
        setTotalQuizzes((prev) => Math.max(0, prev - deletedQuizzes));

        alert(
          `Sekolah "${schoolName}" berhasil dihapus beserta ${deletedUsers} akun (Operator, Guru, Siswa), ${deletedClasses} kelas, dan ${deletedQuizzes} kuis!`
        );
      } catch (err: any) {
        console.error('Error cascading delete school:', err);
        alert('Gagal menghapus sekolah: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Full Database JSON Export Function for Database Migration Backup
  const handleExportFullDatabaseBackup = async () => {
    setIsExporting(true);
    try {
      const collectionsToExport = ['schools', 'users', 'classes', 'quizzes', 'materials', 'quiz_participants'];
      const exportData: Record<string, any[]> = {};

      for (const colName of collectionsToExport) {
        const snap = await getDocs(collection(db, colName));
        const docsList: any[] = [];
        snap.forEach((d) => docsList.push({ _id: d.id, ...d.data() }));
        exportData[colName] = docsList;
      }

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kelasarena_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('Backup database berhasil diunduh dalam format JSON!');
    } catch (err) {
      console.error('Error exporting backup:', err);
      alert('Gagal mengekspor backup data.');
    } finally {
      setIsExporting(false);
    }
  };

  const filteredSchools = schools.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.operator_username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-semibold">
            <Shield className="w-3.5 h-3.5" />
            <span>Admin Portal SaaS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Pusat Kendali Executive KelasArena</h1>
          <p className="text-blue-100 text-xs sm:text-sm max-w-2xl leading-relaxed">
            Kelola seluruh sekolah terdaftar, atur akses Operator IT
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={handleExportFullDatabaseBackup}
            disabled={isExporting}
            className="px-4 py-2.5 bg-blue-900/60 hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow border border-blue-400/30 transition-all flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Mengekspor...' : 'Export Backup DB (JSON)'}</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 bg-white text-blue-700 hover:bg-blue-50 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Sekolah Baru</span>
          </button>
        </div>
      </div>

      {/* Sleek Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Sekolah</span>
            <p className="text-2xl font-black text-slate-900 mt-1">{schools.length}</p>
            <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">Terdaftar di SaaS</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pengguna Terdaftar</span>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalUsers}</p>
            <span className="text-[11px] text-blue-600 font-semibold mt-1 inline-block">Di Database Users</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Kelas</span>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalClasses}</p>
            <span className="text-[11px] text-indigo-600 font-semibold mt-1 inline-block">Ruang Kelas Aktif</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Kuis</span>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalQuizzes}</p>
            <span className="text-[11px] text-amber-600 font-semibold mt-1 inline-block">Kuis Terbuat</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Wand2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Schools Table Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <SchoolIcon className="w-5 h-5 text-rose-600" />
            <h2 className="font-bold text-slate-800 text-base">Daftar Sekolah Terdaftar ({filteredSchools.length})</h2>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari sekolah, ID, operator..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Memuat data sekolah...</div>
        ) : filteredSchools.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-slate-500 text-sm font-medium">Belum ada sekolah yang terdaftar.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl shadow hover:bg-rose-700 transition-all inline-flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Sekolah Pertama</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Kode Sekolah</th>
                  <th className="px-6 py-4">Nama Sekolah</th>
                  <th className="px-6 py-4">Username Operator IT</th>
                  <th className="px-6 py-4">Email Synthetic</th>
                  <th className="px-6 py-4">Tanggal Dibuat</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredSchools.map((sch, idx) => (
                  <tr key={`${sch.id || 'sch'}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-rose-600">{sch.code}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{sch.name}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{sch.operator_username}</td>
                    <td className="px-6 py-4 text-slate-500">{sch.operator_email}</td>
                    <td className="px-6 py-4 text-slate-400">
                      {new Date(sch.created_at).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openResetOperatorPasswordModal(sch)}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold text-[11px] transition-all flex items-center space-x-1"
                          title="Ubah Password Operator Sekolah Ini"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Password</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSchoolCascade(sch.id, sch.name)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Hapus Sekolah & Semua Akun/Data Terkait"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add School Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100">
            <div className="p-6 bg-gradient-to-r from-rose-600 to-pink-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Tambah Sekolah Baru</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white text-xl font-bold">
                &times;
              </button>
            </div>

            <form onSubmit={handleAddSchool} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nama Sekolah
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Contoh: SMA Negeri 1 Jakarta"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Username Operator IT
                </label>
                <input
                  type="text"
                  value={operatorUsername}
                  onChange={(e) => setOperatorUsername(e.target.value)}
                  placeholder="Kosongkan untuk auto-generate (contoh: op_sch1234)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password Operator Default
                </label>
                <PasswordInput
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  placeholder="Password default"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Sekolah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Change Operator Password Modal */}
      {editingOperator && (
        <ChangePasswordModal
          isOpen={!!editingOperator}
          onClose={() => setEditingOperator(null)}
          targetUid={editingOperator.uid}
          targetName={`${editingOperator.name} (${editingOperator.schoolName})`}
          isSelf={false}
        />
      )}
    </div>
  );
};
