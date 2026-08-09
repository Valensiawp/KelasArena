import React, { useState, useEffect } from 'react';
import { UserProfile, ClassRoom, MaterialItem, QuizRoom, QuizQuestion, QuizSummary, RPPData } from '../../types';
import { db, generateSyntheticEmail, generateUniqueRoomCode, generateSmartStudentUsername } from '../../lib/firebase';
import { 
  collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, onSnapshot, setDoc 
} from 'firebase/firestore';
import { 
  Users, BookOpen, Plus, Search, Trash2, Copy, Check, FileText, Upload, Wand2, 
  HelpCircle, Play, Settings, Lock, Unlock, UserX, Download, Eye, Award, Clock, AlertTriangle, Shield
} from 'lucide-react';
import { PasswordInput } from '../common/PasswordInput';
import { jsPDF } from 'jspdf';

interface TeacherDashboardProps {
  user: UserProfile;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user }) => {
  const isWaliKelas = user.teacherRole?.includes('Wali Kelas') || user.teacherRole === 'Wali Kelas & Guru Mapel';
  
  const [activeTab, setActiveTab] = useState<'wali_kelas' | 'classes' | 'quizzes' | 'rpp'>(
    isWaliKelas ? 'wali_kelas' : 'classes'
  );

  // -------------------------------------------------------------
  // TAB 1: WALI KELAS - MANAJEMEN SISWA FULL CRUD
  // -------------------------------------------------------------
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [rawStudentNamesInput, setRawStudentNamesInput] = useState('');
  const [defaultStudentPassword, setDefaultStudentPassword] = useState('123456');
  const [isSubmittingStudents, setIsSubmittingStudents] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    const schoolId = user.school_id || 'SCH-01';

    // 1. Real-time Students Listener
    const qStudents = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('school_id', '==', schoolId)
    );
    const unsubStudents = onSnapshot(qStudents, (snap) => {
      const list: UserProfile[] = [];
      const seen = new Set<string>();
      snap.forEach((d) => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          list.push({ uid: d.id, ...d.data() } as UserProfile);
        }
      });
      setStudents(list);
    }, (err) => console.error('Error listening students:', err));

    // 2. Real-time Classes Listener (By teacher_id)
    const qClasses = query(
      collection(db, 'classes'),
      where('teacher_id', '==', user.uid)
    );
    const unsubClasses = onSnapshot(qClasses, (snap) => {
      const list: ClassRoom[] = [];
      const seen = new Set<string>();
      snap.forEach((d) => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          list.push({ id: d.id, ...d.data() } as ClassRoom);
        }
      });
      setClasses(list);
      setSelectedClass((prev) => {
        if (!prev && list.length > 0) return list[0];
        if (prev) {
          const match = list.find((c) => c.id === prev.id);
          return match || (list.length > 0 ? list[0] : null);
        }
        return null;
      });
    }, (err) => console.error('Error listening classes:', err));

    // 3. Real-time Quizzes Listener (By teacher_id)
    const qQuizzes = query(
      collection(db, 'quizzes'),
      where('teacher_id', '==', user.uid)
    );
    const unsubQuizzes = onSnapshot(qQuizzes, (snap) => {
      const list: QuizRoom[] = [];
      const seen = new Set<string>();
      snap.forEach((d) => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          list.push({ id: d.id, ...d.data() } as QuizRoom);
        }
      });
      setQuizzes(list);
      setSelectedQuiz((prev) => {
        if (prev) {
          const match = list.find((q) => q.id === prev.id);
          return match || null;
        }
        return prev;
      });
    }, (err) => console.error('Error listening quizzes:', err));

    return () => {
      unsubStudents();
      unsubClasses();
      unsubQuizzes();
    };
  }, [user?.uid, user?.school_id]);

  // Bulk / Single Student Auto-Generator
  const handleGenerateStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawStudentNamesInput.trim()) return;

    setIsSubmittingStudents(true);
    try {
      const namesList = rawStudentNamesInput
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean);

      const schoolId = user.school_id || 'SCH-01';

      // Collect existing student usernames to prevent duplication
      const existingUsernamesSet = new Set<string>(
        students.map((s) => (s.username || '').toLowerCase())
      );

      for (const name of namesList) {
        const username = generateSmartStudentUsername(name, existingUsernamesSet);
        const syntheticEmail = generateSyntheticEmail(username, schoolId);

        const newStudentDoc = {
          name,
          username,
          password: '123456',
          email: syntheticEmail,
          role: 'student',
          school_id: schoolId,
          school_name: user.school_name || 'Sekolah',
          created_at: new Date().toISOString(),
        };

        await addDoc(collection(db, 'users'), newStudentDoc);
      }

      setRawStudentNamesInput('');
      setIsStudentModalOpen(false);
    } catch (err) {
      console.error('Error adding students:', err);
    } finally {
      setIsSubmittingStudents(false);
    }
  };

  // HAPUS AKUN SISWA (Khusus Lulusan / Pindah / Keluar)
  const handleDeleteStudent = async (studentUid: string, studentName: string) => {
    if (
      window.confirm(
        `Apakah Anda yakin ingin menghapus akun siswa "${studentName}"? Tindakan ini khusus untuk siswa yang sudah LULUS, PINDAH, atau KELUAR dari sekolah agar data tidak menumpuk.`
      )
    ) {
      try {
        await deleteDoc(doc(db, 'users', studentUid));
      } catch (err) {
        console.error('Error deleting student account:', err);
      }
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.username.toLowerCase().includes(studentSearch.toLowerCase())
  );

  // -------------------------------------------------------------
  // TAB 2: PERMANENT CLASS ROOMS & MATERIALS MANAGEMENT
  // -------------------------------------------------------------
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // New / Edit Class Form
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  const [classNameInput, setClassNameInput] = useState('');
  const [classSubjectInput, setClassSubjectInput] = useState('');
  const [classGradeInput, setClassGradeInput] = useState('X (SMA)');
  const [isCreatingClass, setIsCreatingClass] = useState(false);

  // Wali Kelas Student Edit State
  const [editingStudent, setEditingStudent] = useState<UserProfile | null>(null);
  const [studentNameEdit, setStudentNameEdit] = useState('');
  const [studentPasswordEdit, setStudentPasswordEdit] = useState('');

  // New Material Form with Real File Upload
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialDesc, setMaterialDesc] = useState('');
  const [materialUrl, setMaterialUrl] = useState('');
  const [materialType, setMaterialType] = useState('PDF');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);

  // Real-time Materials Listener for Selected Class
  useEffect(() => {
    if (!selectedClass?.id) {
      setMaterials([]);
      return;
    }

    const q = query(collection(db, 'materials'), where('class_id', '==', selectedClass.id));
    const unsub = onSnapshot(q, (snap) => {
      const list: MaterialItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as MaterialItem));
      setMaterials(list);
    }, (err) => console.error('Error listening materials:', err));

    return () => unsub();
  }, [selectedClass?.id]);

  const handleDeleteMaterial = async (materialId: string, title: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus materi "${title}"?`)) return;
    try {
      await deleteDoc(doc(db, 'materials', materialId));
    } catch (err: any) {
      console.error('Error deleting material:', err);
      alert('Gagal menghapus materi: ' + (err?.message || err));
    }
  };

  const openAddClassModal = () => {
    setEditingClass(null);
    setClassNameInput('');
    setClassSubjectInput('');
    setClassGradeInput('X (SMA)');
    setIsClassModalOpen(true);
  };

  const openEditClassModal = (cls: ClassRoom) => {
    setEditingClass(cls);
    setClassNameInput(cls.name);
    setClassSubjectInput(cls.subject);
    setClassGradeInput(cls.grade_level);
    setIsClassModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classNameInput.trim() || !classSubjectInput.trim()) return;

    setIsCreatingClass(true);
    try {
      if (editingClass) {
        const classRef = doc(db, 'classes', editingClass.id);
        const updatePayload = {
          name: classNameInput.trim(),
          subject: classSubjectInput.trim(),
          grade_level: classGradeInput,
        };
        await updateDoc(classRef, updatePayload);

        const updated = { ...editingClass, ...updatePayload };
        setClasses(classes.map((c) => (c.id === editingClass.id ? updated : c)));
        if (selectedClass?.id === editingClass.id) {
          setSelectedClass(updated);
        }
      } else {
        const uniqueCode = await generateUniqueRoomCode('C', 'classes');
        const newClassDoc = {
          code: uniqueCode,
          name: classNameInput.trim(),
          subject: classSubjectInput.trim(),
          grade_level: classGradeInput,
          teacher_id: user.uid,
          teacher_name: user.name,
          school_id: user.school_id || 'SCH-01',
          student_ids: [],
          created_at: new Date().toISOString(),
        };

        const docRef = await addDoc(collection(db, 'classes'), newClassDoc);
        const createdClass = { id: docRef.id, ...newClassDoc } as ClassRoom;

        setClasses((prev) => (prev.some((c) => c.id === createdClass.id) ? prev : [...prev, createdClass]));
        setSelectedClass(createdClass);
      }

      setClassNameInput('');
      setClassSubjectInput('');
      setEditingClass(null);
      setIsClassModalOpen(false);
    } catch (err) {
      console.error('Error saving class:', err);
    } finally {
      setIsCreatingClass(false);
    }
  };

  const handleDeleteClass = async (classId: string, className: string) => {
    if (
      window.confirm(
        `Apakah Anda yakin ingin menghapus kelas "${className}"? Seluruh materi di kelas ini juga akan ikut terhapus.`
      )
    ) {
      try {
        await deleteDoc(doc(db, 'classes', classId));

        // Delete materials matching class_id
        const mQ = query(collection(db, 'materials'), where('class_id', '==', classId));
        const mSnap = await getDocs(mQ);
        for (const mDoc of mSnap.docs) {
          await deleteDoc(doc(db, 'materials', mDoc.id));
        }

        const updated = classes.filter((c) => c.id !== classId);
        setClasses(updated);
        if (selectedClass?.id === classId) {
          setSelectedClass(updated.length > 0 ? updated[0] : null);
        }
      } catch (err) {
        console.error('Error deleting class:', err);
      }
    }
  };

  const handleCopyClassCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // EDIT NAMA / PASSWORD SISWA OLEH WALI KELAS
  const handleOpenEditStudent = (st: UserProfile) => {
    setEditingStudent(st);
    setStudentNameEdit(st.name);
    setStudentPasswordEdit(st.password || '123456');
  };

  const handleSaveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !studentNameEdit.trim()) return;

    try {
      const studentRef = doc(db, 'users', editingStudent.uid);
      await updateDoc(studentRef, {
        name: studentNameEdit.trim(),
        password: studentPasswordEdit.trim() || '123456',
      });

      setStudents(
        students.map((s) =>
          s.uid === editingStudent.uid
            ? { ...s, name: studentNameEdit.trim(), password: studentPasswordEdit.trim() }
            : s
        )
      );
      setEditingStudent(null);
    } catch (err) {
      console.error('Error editing student:', err);
    }
  };

  // KICK / HAPUS SISWA DARI KELAS PERMANEN
  const handleKickStudentFromClass = async (studentUid: string, studentName: string) => {
    if (!selectedClass) return;
    if (
      window.confirm(
        `Keluarkannya siswa "${studentName}" dari Kelas ${selectedClass.name}? Pilihan ini digunakan jika siswa salah memasukkan ID Kelas atau tidak ada di daftar kelas ini.`
      )
    ) {
      try {
        const updatedStudentIds = selectedClass.student_ids.filter((id) => id !== studentUid);
        await updateDoc(doc(db, 'classes', selectedClass.id), {
          student_ids: updatedStudentIds,
        });

        setSelectedClass({ ...selectedClass, student_ids: updatedStudentIds });
        setClasses(
          classes.map((c) => (c.id === selectedClass.id ? { ...c, student_ids: updatedStudentIds } : c))
        );
      } catch (err) {
        console.error('Error kicking student from class:', err);
      }
    }
  };

  // REAL FILE SELECTION & READER FOR MATERIALS
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!materialTitle) {
        setMaterialTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
      setMaterialType(ext);
    }
  };

  const handleUploadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || !materialTitle.trim()) return;

    setIsUploadingMaterial(true);
    try {
      let fileUrl = materialUrl.trim() || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
      let fileName = `${materialTitle.trim()}.${materialType.toLowerCase()}`;

      if (selectedFile) {
        // Firestore has a 1MB max document limit (approx 750KB before base64 overhead)
        if (selectedFile.size > 750 * 1024) {
          alert('Ukuran file terlalu besar! Firestore membatasi dokumen maksimal 1 MB (~750 KB untuk upload langsung).\n\nSolusi: Silakan pilih file dengan ukuran lebih kecil (< 750 KB) atau masukkan link URL dokumen (misal Google Drive / Cloud storage) pada kolom URL.');
          setIsUploadingMaterial(false);
          return;
        }
        fileName = selectedFile.name;
        fileUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(selectedFile);
        });
      }

      const newMaterialDoc = {
        title: materialTitle.trim(),
        description: materialDesc.trim(),
        file_url: fileUrl,
        file_name: fileName,
        file_type: materialType,
        class_id: selectedClass.id,
        school_id: user.school_id || 'SCH-01',
        teacher_id: user.uid,
        teacher_name: user.name,
        created_at: new Date().toISOString(),
      };

      await addDoc(collection(db, 'materials'), newMaterialDoc);
      setMaterialTitle('');
      setMaterialDesc('');
      setMaterialUrl('');
      setSelectedFile(null);
      setIsMaterialModalOpen(false);
    } catch (err: any) {
      console.error('Error uploading material:', err);
      alert('Gagal mengunggah materi: ' + (err?.message || err));
    } finally {
      setIsUploadingMaterial(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 3: STUDIO LIVE KUIS AI & TEMPORARY ROOM ENGINE
  // -------------------------------------------------------------
  const [quizzes, setQuizzes] = useState<QuizRoom[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<QuizRoom | null>(null);

  // AI Quiz Generator Form
  const [isQuizGeneratorModalOpen, setIsQuizGeneratorModalOpen] = useState(false);
  const [quizTitleInput, setQuizTitleInput] = useState('');
  const [quizGradeLevel, setQuizGradeLevel] = useState('SMP Kelas 8');
  const [quizQuestionType, setQuizQuestionType] = useState<'PG' | 'Uraian'>('PG');
  const [quizQuestionCount, setQuizQuestionCount] = useState(5);
  const [quizTopicPrompt, setQuizTopicPrompt] = useState('');
  const [quizTimerPerQuestion, setQuizTimerPerQuestion] = useState(30);
  const [quizMaxParticipants, setQuizMaxParticipants] = useState(40);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

  // Real-Time Leaderboard and Lobby Participants Listener
  const [liveParticipants, setLiveParticipants] = useState<any[]>([]);

  useEffect(() => {
    if (selectedQuiz) {
      const q = query(collection(db, 'quiz_participants'), where('quiz_id', '==', selectedQuiz.id));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        // Sort by score descending
        list.sort((a, b) => b.score - a.score);
        setLiveParticipants(list);
      });
      return () => unsubscribe();
    }
  }, [selectedQuiz]);

  const fetchQuizzes = async () => {
    if (!user?.uid) return;
    try {
      const teacherUid = user.uid;
      const schoolId = user.school_id || 'SCH-01';
      const q = query(
        collection(db, 'quizzes'),
        where('teacher_id', '==', teacherUid),
        where('school_id', '==', schoolId)
      );
      const snap = await getDocs(q);
      const list: QuizRoom[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as QuizRoom));
      setQuizzes(list);
    } catch (err) {
      console.error('Error fetching quizzes:', err);
    }
  };

  // Generate Quiz via Backend Cloud Proxy (Gemini API)
  const handleGenerateAIQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizTitleInput.trim() || !quizTopicPrompt.trim()) return;

    setIsGeneratingQuiz(true);
    try {
      let questionsList: QuizQuestion[] = [];

      try {
        // Call secure Express backend Gemini Proxy route
        const response = await fetch('/api/gemini/generate-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicText: quizTopicPrompt.trim(),
            gradeLevel: quizGradeLevel,
            questionType: quizQuestionType,
            questionCount: quizQuestionCount,
          }),
        });

        const data = await response.json();
        if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
          questionsList = data.questions;
        }
      } catch (fErr) {
        console.warn('Backend proxy Quiz call warning, generating questions locally:', fErr);
      }

      // Fallback generator if empty or error
      if (!questionsList || questionsList.length === 0) {
        let rawTopic = quizTopicPrompt.trim() || 'Materi Pembelajaran';
        
        // Extract a clean short topic title from raw text/PDF prompt
        let cleanTopic = rawTopic.trim();
        cleanTopic = cleanTopic.replace(/^(materi|bab|modul|topik|sub-materi)\s+[0-9ivxlcdm]+\s*[:\-]?\s*/gi, '').trim();
        const lines = cleanTopic.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) cleanTopic = lines[0];
        const parts = cleanTopic.split(/(?:\b[I|V|X]+\.|\b[A-Z]\.|\bIndikator:|\bTujuan:|\bCP:|\bTP:)/i);
        if (parts.length > 0 && parts[0].trim().length > 3) cleanTopic = parts[0].trim();
        cleanTopic = cleanTopic.replace(/[:;\-,]+$/, '').trim();
        if (cleanTopic.length > 70) cleanTopic = cleanTopic.substring(0, 70).replace(/\s+\S*$/, '').trim();
        if (!cleanTopic) cleanTopic = 'Materi Pembelajaran';

        const isPG = quizQuestionType === 'PG';
        
        const pgVarieties = [
          { q: `Apa definisi utama dan konsep fundamental yang mendasari pembahasan mengenai ${cleanTopic}?`, a: `A. Prinsip dasar, variabel, dan teori pokok dalam ${cleanTopic}` },
          { q: `Manakah contoh penerapan atau studi kasus materi ${cleanTopic} yang paling tepat untuk jenjang ${quizGradeLevel || 'sekolah'}?`, a: `A. Pemecahan masalah terstruktur berbasis prinsip dan rumus ${cleanTopic}` },
          { q: `Mengapa analisis dan pemahaman mendalam tentang ${cleanTopic} sangat penting dalam pembelajaran siswa?`, a: `A. Membentuk pola pikir kritis dan keterampilan bernalar logis` },
          { q: `Ciri utama yang membedakan karakteristik konsep ${cleanTopic} dibanding topik pembelajaran lainnya adalah...`, a: `A. Adanya pola terstruktur, hukum logika, dan keterkaitan antar variabel` },
          { q: `Langkah pertama yang paling krusial ketika menghadapi soal atau permasalahan terkait ${cleanTopic} adalah...`, a: `A. Mengidentifikasi informasi kunci, variabel, dan komponen utama ${cleanTopic}` },
          { q: `Dalam melakukan evaluasi penyelesaian soal ${cleanTopic}, aspek apa yang harus diperhatikan agar hasil analisis valid?`, a: `A. Kesesuaian metode penyelesaian dengan aturan ilmiah ${cleanTopic}` },
          { q: `Bagaimana hubungan antara pemahaman teori ${cleanTopic} dengan kemampuan pemecahan masalah konteks nyata?`, a: `A. Teori ${cleanTopic} menjadi landasan dasar untuk merumuskan solusi tepat` },
          { q: `Strategi efektif untuk menghindari kekeliruan atau miskonsepsi saat mempelajari ${cleanTopic} adalah...`, a: `A. Berlatih secara berulang, memahami konsep dasar, dan diskusi terarah` },
        ];

        const uraianVarieties = [
          `Jelaskan secara mendalam pengertian, konsep dasar, serta komponen utama yang membangun materi ${cleanTopic}!`,
          `Uraikan minimal 3 prinsip pokok atau hukum yang berlaku pada topik ${cleanTopic} beserta contoh kasusnya!`,
          `Berikan analisis langkah-langkah sistematis dalam memecahkan permasalahan atau soal kompleks terkait ${cleanTopic}!`,
          `Analisislah miskonsepsi atau kesalahan umum yang sering terjadi saat mempelajari ${cleanTopic}, dan berikan solusi mengatasinya!`,
          `Buatlah rangkuman komprehensif atau peta konsep yang menghubungkan sub-materi dalam ${cleanTopic} secara terstruktur!`,
          `Bagaimana relevansi penerapan materi ${cleanTopic} dalam kehidupan sehari-hari atau dunia industri/ilmu pengetahuan saat ini?`
        ];

        for (let i = 1; i <= quizQuestionCount; i++) {
          if (isPG) {
            const tmpl = pgVarieties[(i - 1) % pgVarieties.length];
            questionsList.push({
              id: `q${i}`,
              question: tmpl.q,
              type: 'PG',
              options: [
                tmpl.a,
                `B. Pendekatan acak tanpa dasar teoretis yang terukur`,
                `C. Aturan konvensional yang tidak memiliki kaitan langsung`,
                `D. Hanya berupa asumsi tanpa pembuktian konsep`
              ],
              correctAnswer: tmpl.a,
              explanation: `Penjelasan konsep ${cleanTopic} oleh AI KelasArena.`,
            });
          } else {
            const qText = uraianVarieties[(i - 1) % uraianVarieties.length];
            questionsList.push({
              id: `q${i}`,
              question: qText,
              type: 'Uraian',
              options: [],
              correctAnswer: `Kunci Jawaban Resmi: Jawaban memuat analisis mendalam mengenai ${cleanTopic} secara runtut dan jelas.`,
              explanation: `Penjelasan dan pedoman penilaian uraian ${cleanTopic} oleh AI KelasArena.`,
            });
          }
        }
      }

      // Sanitize questions array so no element contains `undefined` values (which causes Firestore addDoc error)
      const sanitizedQuestions = questionsList.map((q, idx) => ({
        id: q.id || `q${idx + 1}`,
        question: q.question || `Soal ${idx + 1}`,
        type: q.type || quizQuestionType,
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correctAnswer || (q.type === 'PG' ? 'A. Pilihan A' : 'Kunci Jawaban Uraian'),
        explanation: q.explanation || 'Penjelasan materi oleh AI KelasArena.'
      }));

      // Generate room code Q-XXXXXX
      let uniqueQuizCode = '';
      try {
        uniqueQuizCode = await generateUniqueRoomCode('Q', 'quizzes');
      } catch (cErr) {
        uniqueQuizCode = `Q-${Math.floor(100000 + Math.random() * 900000)}`;
      }

      const newQuizDoc = {
        code: uniqueQuizCode,
        title: quizTitleInput.trim(),
        grade_level: quizGradeLevel,
        question_type: quizQuestionType,
        school_id: user.school_id || 'SCH-01',
        teacher_id: user.uid,
        teacher_name: user.name,
        status: 'lobby',
        questions: sanitizedQuestions,
        timer_per_question: quizTimerPerQuestion,
        max_participants: quizMaxParticipants,
        lock_room: false,
        created_at: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'quizzes'), newQuizDoc);
      const createdQuiz = { id: docRef.id, ...newQuizDoc } as QuizRoom;

      setQuizzes((prev) => (prev.some((q) => q.id === createdQuiz.id) ? prev : [...prev, createdQuiz]));
      setSelectedQuiz(createdQuiz);
      setActiveTab('quizzes');
      setIsQuizGeneratorModalOpen(false);
      setQuizTitleInput('');
      setQuizTopicPrompt('');
    } catch (err: any) {
      console.error('Error generating AI quiz:', err);
      alert('Gagal membuat room kuis: ' + (err.message || 'Error server'));
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Change Quiz Room Status (Lobby -> Active / Finished)
  const handleUpdateQuizStatus = async (status: 'lobby' | 'active' | 'finished') => {
    if (!selectedQuiz) return;
    try {
      await updateDoc(doc(db, 'quizzes', selectedQuiz.id), { status });
      const updated = { ...selectedQuiz, status };
      setSelectedQuiz(updated);
      setQuizzes(quizzes.map((q) => (q.id === selectedQuiz.id ? updated : q)));
    } catch (err) {
      console.error('Error updating quiz status:', err);
    }
  };

  // Toggle Lock Room in Realtime
  const handleToggleLockRoom = async () => {
    if (!selectedQuiz) return;
    try {
      const newLockState = !selectedQuiz.lock_room;
      await updateDoc(doc(db, 'quizzes', selectedQuiz.id), { lock_room: newLockState });
      const updated = { ...selectedQuiz, lock_room: newLockState };
      setSelectedQuiz(updated);
      setQuizzes(quizzes.map((q) => (q.id === selectedQuiz.id ? updated : q)));
    } catch (err) {
      console.error('Error locking room:', err);
    }
  };

  // CASCADE AUTO-CLEAN DATABASE & EXPORT PDF
  const handleCascadeDeleteQuizRoom = async () => {
    if (!selectedQuiz) return;
    if (
      window.confirm(
        'Selesaikan dan HAPUS ROOM KUIS ini secara permanen? Seluruh poin dan log sementara di Firestore akan DIDELETE BERSIH dari database.'
      )
    ) {
      try {
        // Save 1 clean summary record in quiz_summaries collection
        const summaryData: QuizSummary = {
          id: `summary_${selectedQuiz.id}`,
          quiz_id: selectedQuiz.id,
          quiz_title: selectedQuiz.title,
          quiz_code: selectedQuiz.code,
          school_id: user.school_id || 'SCH-01',
          teacher_id: user.uid,
          finished_at: new Date().toISOString(),
          participants: liveParticipants.map((p) => ({
            student_id: p.student_id,
            student_name: p.student_name,
            score: p.score || 0,
            tab_switches: p.tab_switches || 0,
            completed: p.completed || false,
          })),
        };

        await setDoc(doc(db, 'quiz_summaries', summaryData.id), summaryData);

        // Cascade delete all temporary participant logs in Firestore
        for (const p of liveParticipants) {
          await deleteDoc(doc(db, 'quiz_participants', p.id));
        }

        // Delete main Quiz document
        await deleteDoc(doc(db, 'quizzes', selectedQuiz.id));

        // Generate PDF Rekap Nilai
        exportQuizPDFSummary(selectedQuiz.title, selectedQuiz.code, liveParticipants);

        setQuizzes(quizzes.filter((q) => q.id !== selectedQuiz.id));
        setSelectedQuiz(null);
      } catch (err) {
        console.error('Error cascade deleting quiz room:', err);
      }
    }
  };

  // Export Rekap Nilai to PDF via jsPDF
  const exportQuizPDFSummary = (quizTitle: string, quizCode: string, participants: any[]) => {
    const docPdf = new jsPDF();
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(16);
    docPdf.text('REKAP NILAI LIVE KUIS AI - KELASARENA', 14, 20);

    docPdf.setFontSize(11);
    docPdf.setFont('helvetica', 'normal');
    docPdf.text(`Judul Kuis: ${quizTitle}`, 14, 28);
    docPdf.text(`ID Room Code: ${quizCode}`, 14, 34);
    docPdf.text(`Tanggal Selesai: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`, 14, 40);

    docPdf.setFont('helvetica', 'bold');
    docPdf.text('Peringkat', 14, 52);
    docPdf.text('Nama Siswa', 40, 52);
    docPdf.text('Skor Akhir', 120, 52);
    docPdf.text('Peringatan Tab', 160, 52);

    docPdf.line(14, 55, 196, 55);

    let y = 62;
    participants.forEach((p, index) => {
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(`${index + 1}`, 14, y);
      docPdf.text(`${p.student_name}`, 40, y);
      docPdf.text(`${p.score || 0}`, 120, y);
      docPdf.text(`${p.tab_switches || 0} x`, 160, y);
      y += 8;
    });

    docPdf.save(`Rekap_Nilai_${quizCode}.pdf`);
  };

  // -------------------------------------------------------------
  // TAB 4: STUDIO AI RPP & LKPD (WITH FIRESTORE PERSISTENCE)
  // -------------------------------------------------------------
  const [rppCurriculum, setRppCurriculum] = useState('Kurikulum Merdeka');
  const [customCurriculum, setCustomCurriculum] = useState('');
  const [rppSubject, setRppSubject] = useState('Matematika');
  const [rppGrade, setRppGrade] = useState('SMP Kelas 8');
  const [rppTopic, setRppTopic] = useState('Teorema Pythagoras dan Aplikasinya');
  const [rppDuration, setRppDuration] = useState('2 x 45 Menit');
  const [generatedRpp, setGeneratedRpp] = useState<{ rpp: string; lkpd: string } | null>(null);
  const [isGeneratingRpp, setIsGeneratingRpp] = useState(false);
  const [savedRppList, setSavedRppList] = useState<RPPData[]>([]);
  const [viewingRppModal, setViewingRppModal] = useState<RPPData | null>(null);

  // Real-time listener for teacher's saved RPP/LKPD documents in Firestore
  useEffect(() => {
    if (!user?.uid) return;

    const qRpp = query(
      collection(db, 'rpp_lkpd'),
      where('teacher_id', '==', user.uid)
    );

    const unsubRpp = onSnapshot(qRpp, (snapshot) => {
      const list: RPPData[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          curriculum: data.curriculum || 'Kurikulum Merdeka',
          subject: data.subject || '',
          grade: data.grade || '',
          topic: data.topic || '',
          duration: data.duration || '',
          rppContent: data.rppContent || data.rpp_content || '',
          lkpdContent: data.lkpdContent || data.lkpd_content || '',
          created_at: data.created_at || new Date().toISOString(),
        } as RPPData);
      });
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSavedRppList(list);
    }, (err) => {
      console.error('Error listening to saved RPPs:', err);
    });

    return () => unsubRpp();
  }, [user?.uid]);

  const formatIndonesianDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch (e) {
      return isoString;
    }
  };

  const getEffectiveCurriculum = () => {
    return rppCurriculum === 'Lainnya' ? (customCurriculum.trim() || 'Kurikulum Custom') : rppCurriculum;
  };

  // PDF Downloader for RPP Modul Ajar
  const downloadRppPdf = () => {
    if (!generatedRpp) return;
    downloadSavedRppPdf({
      id: 'current',
      curriculum: getEffectiveCurriculum(),
      subject: rppSubject,
      grade: rppGrade,
      topic: rppTopic,
      duration: rppDuration,
      rppContent: generatedRpp.rpp,
      lkpdContent: generatedRpp.lkpd,
      created_at: new Date().toISOString(),
    });
  };

  // PDF Downloader for LKPD 100 Soal Uraian
  const downloadLkpdPdf = () => {
    if (!generatedRpp) return;
    downloadSavedLkpdPdf({
      id: 'current',
      curriculum: getEffectiveCurriculum(),
      subject: rppSubject,
      grade: rppGrade,
      topic: rppTopic,
      duration: rppDuration,
      rppContent: generatedRpp.rpp,
      lkpdContent: generatedRpp.lkpd,
      created_at: new Date().toISOString(),
    });
  };

  const downloadSavedRppPdf = (item: RPPData) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const maxLineWidth = pageWidth - (margin * 2);

      const currStr = (item.curriculum || 'Kurikulum Merdeka').toUpperCase();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(`MODUL AJAR / RPP (${currStr})`, margin, 18);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Acuan: ${item.curriculum || 'Kurikulum Merdeka'} | Mapel: ${item.subject} | Jenjang: ${item.grade}`, margin, 25);
      doc.text(`Topik: ${item.topic} | Alokasi: ${item.duration}`, margin, 30);

      doc.setLineWidth(0.5);
      doc.line(margin, 33, pageWidth - margin, 33);

      const lines = doc.splitTextToSize(item.rppContent, maxLineWidth);
      let y = 40;

      for (let i = 0; i < lines.length; i++) {
        if (y > pageHeight - 15) {
          doc.addPage();
          y = 15;
        }
        doc.text(lines[i], margin, y);
        y += 5;
      }

      const cleanFileName = `Modul_Ajar_RPP_${item.subject.replace(/[^a-zA-Z0-9]/g, '_')}_${item.topic.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      doc.save(cleanFileName);
    } catch (pdfErr) {
      console.error('Error generating RPP PDF:', pdfErr);
      alert('Gagal mendownload PDF RPP: ' + pdfErr);
    }
  };

  const downloadSavedLkpdPdf = (item: RPPData) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const maxLineWidth = pageWidth - (margin * 2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('LEMBAR KERJA PESERTA DIDIK (LKPD) - 100 SOAL URAIAN', margin, 18);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Kurikulum: ${item.curriculum || 'Kurikulum Merdeka'} | Mapel: ${item.subject} | Jenjang: ${item.grade} | Topik: ${item.topic}`, margin, 24);

      doc.rect(margin, 27, maxLineWidth, 14);
      doc.text('Nama Siswa / Kelompok : __________________________________________', margin + 4, 32);
      doc.text('Kelas / Presensi              : __________________________________________', margin + 4, 38);

      doc.setLineWidth(0.5);
      doc.line(margin, 44, pageWidth - margin, 44);

      const lines = doc.splitTextToSize(item.lkpdContent, maxLineWidth);
      let y = 50;

      for (let i = 0; i < lines.length; i++) {
        if (y > pageHeight - 15) {
          doc.addPage();
          y = 15;
        }
        doc.text(lines[i], margin, y);
        y += 5;
      }

      const cleanFileName = `LKPD_100_Soal_Uraian_${item.subject.replace(/[^a-zA-Z0-9]/g, '_')}_${item.topic.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      doc.save(cleanFileName);
    } catch (pdfErr) {
      console.error('Error generating LKPD PDF:', pdfErr);
      alert('Gagal mendownload PDF LKPD: ' + pdfErr);
    }
  };

  const handleDeleteSavedRpp = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus RPP & LKPD tersimpan ini?')) return;
    try {
      await deleteDoc(doc(db, 'rpp_lkpd', id));
      if (viewingRppModal?.id === id) {
        setViewingRppModal(null);
      }
    } catch (err) {
      console.error('Error deleting RPP:', err);
      alert('Gagal menghapus RPP: ' + err);
    }
  };

  const handleGenerateRpp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingRpp(true);

    const finalCurr = getEffectiveCurriculum();

    try {
      let finalRpp = '';
      let finalLkpd = '';

      const response = await fetch('/api/gemini/generate-rpp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curriculum: finalCurr,
          subject: rppSubject,
          grade: rppGrade,
          topic: rppTopic,
          duration: rppDuration,
        }),
      });

      const data = await response.json();
      if (data.success) {
        finalRpp = data.rppContent;
        finalLkpd = data.lkpdContent;
      } else {
        finalRpp = `MODUL AJAR RPP (${finalCurr.toUpperCase()})\nAcuan Kurikulum: ${finalCurr}\nMata Pelajaran: ${rppSubject}\nJenjang/Kelas: ${rppGrade}\nTopik: ${rppTopic}\nAlokasi Waktu: ${rppDuration}\n\n1. CAPAIAN / TUJUAN PEMBELAJARAN (${finalCurr}):\nPeserta didik mampu memahami dan mengaplikasikan konsep ${rppTopic}.\n\n2. INDIKATOR PENCAPAIAN:\n- Menjelaskan prinsip dasar ${rppTopic}.\n- Menyelesaikan latihan soal terstruktur.\n\n3. PROFIL / KARAKTER UTAMA:\nBernalar Kritis dan Mandiri.\n\n4. KEGIATAN PEMBELAJARAN:\n- Pendahuluan (10m), Kegiatan Inti (70m), Penutup Refleksi (10m).`;
        finalLkpd = `LEMBAR KERJA PESERTA DIDIK (LKPD)\nAcuan Kurikulum: ${finalCurr}\nMata Pelajaran: ${rppSubject}\nTopik: ${rppTopic}\n\nLATIHAN SOAL DISKUSI:\n1. Tuliskan ringkasan materi ${rppTopic} menurut pendapat Anda!\n2. Selesaikan soal latihan penerapan pada kasus sehari-hari.`;
      }

      setGeneratedRpp({
        rpp: finalRpp,
        lkpd: finalLkpd,
      });

      // Automatically save to Firestore collection `rpp_lkpd`
      const nowIso = new Date().toISOString();
      await addDoc(collection(db, 'rpp_lkpd'), {
        teacher_id: user.uid,
        teacher_name: user.name,
        school_id: user.school_id || 'SCH-01',
        curriculum: finalCurr,
        subject: rppSubject,
        grade: rppGrade,
        topic: rppTopic,
        duration: rppDuration,
        rppContent: finalRpp,
        lkpdContent: finalLkpd,
        created_at: nowIso,
      });

    } catch (err) {
      console.error('Error generating RPP:', err);
      const fallbackRpp = `MODUL AJAR RPP (${finalCurr.toUpperCase()})\nKurikulum: ${finalCurr}\nMata Pelajaran: ${rppSubject}\nJenjang/Kelas: ${rppGrade}\nTopik: ${rppTopic}\n\n1. TUJUAN PEMBELAJARAN:\nSiswa dapat menguasai materi ${rppTopic} dengan baik.`;
      const fallbackLkpd = `LEMBAR KERJA PESERTA DIDIK (LKPD)\nKurikulum: ${finalCurr}\nMata Pelajaran: ${rppSubject}\nTopik: ${rppTopic}\n\nLatihan Soal & Penugasan Terstruktur.`;
      setGeneratedRpp({
        rpp: fallbackRpp,
        lkpd: fallbackLkpd,
      });
      try {
        await addDoc(collection(db, 'rpp_lkpd'), {
          teacher_id: user.uid,
          teacher_name: user.name,
          school_id: user.school_id || 'SCH-01',
          curriculum: finalCurr,
          subject: rppSubject,
          grade: rppGrade,
          topic: rppTopic,
          duration: rppDuration,
          rppContent: fallbackRpp,
          lkpdContent: fallbackLkpd,
          created_at: new Date().toISOString(),
        });
      } catch (saveErr) {
        console.error('Error saving fallback RPP:', saveErr);
      }
    } finally {
      setIsGeneratingRpp(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-semibold mb-3">
            <Award className="w-3.5 h-3.5 mr-1.5" /> Portal Guru KelasArena
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Dasbor {user.teacherRole || 'Guru Pendidik'}
          </h1>
          <p className="text-blue-100 text-sm mt-1 max-w-2xl">
            Kelola data siswa kelas, buat ruang kelas, adakan live kuis AI interaktif, serta buat RPP/LKPD otomatis.
          </p>
        </div>

        {/* Tab Selector Pill Buttons */}
        <div className="flex flex-wrap gap-2 bg-blue-900/40 p-1.5 rounded-2xl border border-blue-400/30">
          {isWaliKelas && (
            <button
              onClick={() => setActiveTab('wali_kelas')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'wali_kelas'
                  ? 'bg-white text-blue-800 shadow-md'
                  : 'text-blue-100 hover:bg-white/10'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Wali Kelas (Kelola Siswa)</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('classes')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'classes'
                ? 'bg-white text-blue-800 shadow-md'
                : 'text-blue-100 hover:bg-white/10'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Kelas & Materi</span>
          </button>

          <button
            onClick={() => setActiveTab('quizzes')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'quizzes'
                ? 'bg-white text-blue-800 shadow-md'
                : 'text-blue-100 hover:bg-white/10'
            }`}
          >
            <Wand2 className="w-4 h-4 text-blue-200" />
            <span>Studio Live Kuis AI</span>
          </button>

          <button
            onClick={() => setActiveTab('rpp')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'rpp'
                ? 'bg-white text-blue-800 shadow-md'
                : 'text-blue-100 hover:bg-white/10'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>AI RPP & LKPD</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: WALI KELAS - MANAJEMEN SISWA FULL CRUD                             */}
      {/* ========================================================================= */}
      {activeTab === 'wali_kelas' && isWaliKelas && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
              <div>
                <h2 className="font-bold text-slate-800 text-base flex items-center space-x-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span>Daftar Siswa Kelas Binaan ({filteredStudents.length})</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Input daftar nama siswa 1x untuk auto-generate akun resmi siswa.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Cari siswa, username..."
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>

                <button
                  onClick={() => setIsStudentModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center space-x-1.5 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Input Nama Siswa</span>
                </button>
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Users className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-600">Belum Ada Siswa Terdaftar</p>
                <p className="text-xs text-slate-400">
                  Klik "Input Nama Siswa" untuk menambahkan daftar nama siswa di awal tahun ajaran.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3.5">Nama Lengkap Siswa</th>
                      <th className="px-5 py-3.5">Username Official</th>
                      <th className="px-5 py-3.5">Email Synthetic</th>
                      <th className="px-5 py-3.5">Password Default</th>
                      <th className="px-5 py-3.5 text-right">Aksi Wali Kelas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredStudents.map((s, idx) => (
                      <tr key={`${s.uid || s.id || 'st'}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-4 font-bold text-slate-900">{s.name}</td>
                        <td className="px-5 py-4 font-mono font-semibold text-blue-700">{s.username}</td>
                        <td className="px-5 py-4 text-slate-500">{s.email}</td>
                        <td className="px-5 py-4 font-mono text-slate-400">123456</td>
                        <td className="px-5 py-4 text-right flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenEditStudent(s)}
                            className="px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold rounded-lg text-xs transition-colors flex items-center space-x-1"
                            title="Edit Data & Reset Password Siswa"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            <span>Edit / Password</span>
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(s.uid, s.name)}
                            className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold rounded-lg text-xs transition-colors flex items-center space-x-1"
                            title="Hapus Akun Siswa Lulus/Keluar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus Akun (Lulus)</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PERMANENT CLASS ROOMS & MATERIALS                                   */}
      {/* ========================================================================= */}
      {activeTab === 'classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: List of Permanent Classes */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800 text-base">Ruang Kelas Permanen</h2>
              <button
                onClick={openAddClassModal}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Kelas</span>
              </button>
            </div>

            {classes.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
                <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">Belum Ada Kelas</p>
                <p className="text-[11px] text-slate-400">Buat kelas permanen pertama Anda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {classes.map((c, idx) => (
                  <div
                    key={`${c.id || 'cls'}-${idx}`}
                    onClick={() => setSelectedClass(c)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      selectedClass?.id === c.id
                        ? 'bg-blue-50/80 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                          {c.grade_level}
                        </span>
                        <h3 className="font-bold text-slate-900 text-base mt-1">{c.name}</h3>
                        <p className="text-xs text-slate-500 font-medium">{c.subject}</p>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyClassCode(c.code);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg text-xs font-mono font-bold flex items-center space-x-1"
                          title="Salin ID Kelas"
                        >
                          {copiedCode === c.code ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-600">Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <span>{c.code}</span>
                              <Copy className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Selected Class Room Details & Members & Materials */}
          <div className="lg:col-span-2 space-y-6">
            {selectedClass ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
                  <div>
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                      {selectedClass.grade_level} • {selectedClass.subject}
                    </span>
                    <h2 className="text-2xl font-extrabold text-slate-900">{selectedClass.name}</h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openEditClassModal(selectedClass)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 font-bold text-xs rounded-xl transition-all flex items-center space-x-1"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Edit Kelas</span>
                    </button>
                    <button
                      onClick={() => handleDeleteClass(selectedClass.id, selectedClass.name)}
                      className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold text-xs rounded-xl transition-all flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Kelas</span>
                    </button>
                    <button
                      onClick={() => handleCopyClassCode(selectedClass.code)}
                      className="px-3 py-1.5 bg-blue-600 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow"
                    >
                      <span>{selectedClass.code}</span>
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* MANAJEMEN ANGGOTA KELAS (KICK/HAPUS SISWA DARI KELAS) */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>Anggota Siswa Terdaftar di Kelas Ini ({selectedClass.student_ids.length})</span>
                  </h3>

                  {selectedClass.student_ids.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      Belum ada siswa yang bergabung. Bagikan ID Kelas <span className="font-bold text-blue-600">{selectedClass.code}</span> ke siswa Anda.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedClass.student_ids.map((stId, idx) => {
                        const stObj = students.find((s) => s.uid === stId);
                        const stName = stObj ? stObj.name : `Siswa ID (${stId.substring(0, 6)})`;
                        return (
                          <div
                            key={`${stId}-${idx}`}
                            className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                          >
                            <span className="font-semibold text-slate-800 truncate">{stName}</span>
                            <button
                              onClick={() => handleKickStudentFromClass(stId, stName)}
                              className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold rounded-lg text-[11px] transition-colors shrink-0 flex items-center space-x-1"
                              title="Keluarkannya dari Kelas Ini"
                            >
                              <UserX className="w-3 h-3" />
                              <span>Kick</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Teaching Materials Upload Section */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>Materi Pelajaran Terisolasi ({materials.length})</span>
                    </h3>

                    <button
                      onClick={() => setIsMaterialModalOpen(true)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 font-bold text-xs rounded-xl transition-all flex items-center space-x-1"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Unggah Materi Baru</span>
                    </button>
                  </div>

                  {materials.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 space-y-1">
                      <p className="text-xs text-slate-500 font-medium">Belum Ada Materi Diunggah</p>
                      <p className="text-[11px] text-slate-400">File materi hanya akan tampil di dasbor siswa kelas ini.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {materials.map((m, idx) => (
                        <div key={`${m.id || 'mat'}-${idx}`} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              {m.file_type}
                            </span>
                            <h4 className="font-bold text-slate-800 text-xs mt-1">{m.title}</h4>
                            <p className="text-[11px] text-slate-500 line-clamp-1">{m.description}</p>
                          </div>
                          <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                            <a
                              href={m.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 bg-white text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition-colors"
                              title="Buka / Unduh File"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => handleDeleteMaterial(m.id, m.title)}
                              className="p-2 bg-white text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 transition-colors"
                              title="Hapus Materi Ini"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
                Pilih atau buat ruang kelas di sebelah kiri untuk melihat detail.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: STUDIO LIVE KUIS AI & TEMPORARY ROOM ENGINE                         */}
      {/* ========================================================================= */}
      {activeTab === 'quizzes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Quiz Rooms List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800 text-base flex items-center space-x-2">
                <Wand2 className="w-5 h-5 text-blue-600" />
                <span>Studio Live Kuis AI</span>
              </h2>
              <button
                onClick={() => setIsQuizGeneratorModalOpen(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center space-x-1.5 transition-all"
              >
                <Wand2 className="w-4 h-4" />
                <span>Buat Kuis AI</span>
              </button>
            </div>

            {quizzes.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2 shadow-sm">
                <Wand2 className="w-10 h-10 text-blue-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">Belum Ada Kuis Aktif</p>
                <p className="text-[11px] text-slate-400">Generate kuis otomatis dengan Gemini AI.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {quizzes
                  .filter((q, index, self) => index === self.findIndex((t) => (t.id && t.id === q.id) || (t.code && t.code === q.code)))
                  .map((q, idx) => (
                  <div
                    key={`${q.id || 'qz'}-${idx}`}
                    onClick={() => setSelectedQuiz(q)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      selectedQuiz?.id === q.id
                        ? 'bg-blue-50/80 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            q.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : q.status === 'finished'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {q.status === 'active' ? '🔴 Sesi Kuis Live' : q.status === 'finished' ? 'Selesai' : 'Lobby Menunggu'}
                        </span>
                        <h3 className="font-bold text-slate-900 text-base mt-1">{q.title}</h3>
                        <p className="text-xs text-slate-500 font-medium">
                          {q.grade_level} • {q.questions.length} Soal ({q.question_type})
                        </p>
                      </div>

                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg text-xs border border-blue-200">
                        {q.code}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Quiz Arena & Realtime Control & Settings */}
          <div className="lg:col-span-2 space-y-6">
            {selectedQuiz ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
                {/* Header Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
                  <div>
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                      {selectedQuiz.grade_level} • Timer {selectedQuiz.timer_per_question}d/Soal
                    </span>
                    <h2 className="text-2xl font-extrabold text-slate-900">{selectedQuiz.title}</h2>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-500">ID Room Kuis:</span>
                    <span className="px-3.5 py-1.5 bg-blue-600 text-white font-mono font-extrabold text-sm rounded-xl shadow">
                      {selectedQuiz.code}
                    </span>
                  </div>
                </div>

                {/* Status & Control Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center space-x-2">
                    {selectedQuiz.status === 'lobby' && (
                      <button
                        onClick={() => handleUpdateQuizStatus('active')}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1.5"
                      >
                        <Play className="w-4 h-4" />
                        <span>Mulai Kuis Live Sekarang</span>
                      </button>
                    )}

                    {selectedQuiz.status === 'active' && (
                      <button
                        onClick={() => handleUpdateQuizStatus('finished')}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow transition-all"
                      >
                        Hentikan Kuis & Tampilkan Hasil
                      </button>
                    )}

                    <button
                      onClick={handleToggleLockRoom}
                      className={`px-3 py-2 font-bold text-xs rounded-xl border transition-all flex items-center space-x-1 ${
                        selectedQuiz.lock_room
                          ? 'bg-rose-100 text-rose-700 border-rose-300'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      {selectedQuiz.lock_room ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      <span>{selectedQuiz.lock_room ? 'Room Dikunci' : 'Kunci Room'}</span>
                    </button>
                  </div>

                  {/* Cascade Delete Button */}
                  <button
                    onClick={handleCascadeDeleteQuizRoom}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-colors flex items-center space-x-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Hapus Room & Unduh Rekap PDF</span>
                  </button>
                </div>

                {/* Realtime Leaderboard & Active Participants */}
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                    <Award className="w-4 h-4 text-blue-600" />
                    <span>Papan Peringkat Real-Time ({liveParticipants.length} Peserta)</span>
                  </h3>

                  {liveParticipants.length === 0 ? (
                    <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded-xl text-center">
                      Belum ada siswa di lobby. Minta siswa memasukkan ID <span className="font-bold text-blue-600">{selectedQuiz.code}</span> di header dasbor siswa.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-2.5">Peringkat</th>
                            <th className="px-4 py-2.5">Nama Siswa</th>
                            <th className="px-4 py-2.5">Skor Poin</th>
                            <th className="px-4 py-2.5">Deteksi Tab-Switch</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {liveParticipants.map((p, idx) => (
                            <tr key={`${p.id || 'pt'}-${idx}`} className="hover:bg-amber-50/40">
                              <td className="px-4 py-3 font-bold text-slate-900">#{idx + 1}</td>
                              <td className="px-4 py-3 font-bold text-slate-800">{p.student_name}</td>
                              <td className="px-4 py-3 font-extrabold text-amber-600">{p.score || 0} Pts</td>
                              <td className="px-4 py-3">
                                {p.tab_switches > 0 ? (
                                  <span className="text-rose-600 font-bold flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5" /> {p.tab_switches}x Peringatan
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 font-semibold">Terkendali (0x)</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Generated Soal Preview */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Daftar Soal AI ({selectedQuiz.questions.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {selectedQuiz.questions.map((q, idx) => (
                      <div key={`${q.id || 'q'}-${idx}`} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <p className="font-bold text-slate-800">
                          {idx + 1}. {q.question}
                        </p>
                        {q.options && (
                          <div className="grid grid-cols-2 gap-1.5 mt-2">
                            {q.options.map((opt, oIdx) => (
                              <span
                                key={`${idx}-opt-${oIdx}`}
                                className={`px-2 py-1 rounded border text-[11px] ${
                                  opt === q.correctAnswer
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}
                              >
                                {opt}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
                Pilih atau buat kuis di sebelah kiri.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: STUDIO AI RPP & LKPD                                               */}
      {/* ========================================================================= */}
      {activeTab === 'rpp' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <Wand2 className="w-5 h-5 text-blue-600" />
              <span>Generator AI RPP & Lembar Kerja Peserta Didik (LKPD)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Buat dokumen Modul Ajar RPP dan LKPD praktis secara otomatis disesuaikan dengan kurikulum pilihan Anda.
            </p>
          </div>

          <form onSubmit={handleGenerateRpp} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Acuan Kurikulum</label>
                <select
                  value={rppCurriculum}
                  onChange={(e) => setRppCurriculum(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Kurikulum Merdeka">Kurikulum Merdeka (KSP)</option>
                  <option value="Kurikulum Deep Learning">Kurikulum Deep Learning / Baru</option>
                  <option value="Kurikulum 2013 (K13 Revisi)">Kurikulum 2013 (K13)</option>
                  <option value="Kurikulum KTSP 2006">Kurikulum KTSP 2006</option>
                  <option value="Kurikulum Internasional">Kurikulum Internasional</option>
                  <option value="Lainnya">Lainnya (Ketik Manual)...</option>
                </select>
                {rppCurriculum === 'Lainnya' && (
                  <input
                    type="text"
                    placeholder="Contoh: Kurikulum Khusus Sekolah"
                    value={customCurriculum}
                    onChange={(e) => setCustomCurriculum(e.target.value)}
                    required
                    className="w-full mt-1.5 px-3 py-1.5 bg-white border border-blue-300 rounded-xl text-xs text-blue-900"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Mata Pelajaran</label>
                <input
                  type="text"
                  value={rppSubject}
                  onChange={(e) => setRppSubject(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Jenjang / Kelas</label>
                <input
                  type="text"
                  value={rppGrade}
                  onChange={(e) => setRppGrade(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Topik / Materi</label>
                <input
                  type="text"
                  value={rppTopic}
                  onChange={(e) => setRppTopic(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isGeneratingRpp}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>{isGeneratingRpp ? 'Sedang Menyusun...' : 'Generate RPP & LKPD AI'}</span>
                </button>
              </div>
            </div>
          </form>

          {generatedRpp && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm text-blue-700 flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Modul Ajar / RPP Kurikulum Merdeka</span>
                  </h3>

                  <button
                    onClick={downloadRppPdf}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow flex items-center space-x-1.5 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh PDF (.pdf)</span>
                  </button>
                </div>

                <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed max-h-96 overflow-y-auto p-3 bg-white rounded-xl border border-slate-200 font-sans">
                  {generatedRpp.rpp}
                </div>
              </div>

              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm text-emerald-700 flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span>Lembar Kerja Peserta Didik (100 Soal Uraian)</span>
                  </h3>

                  <button
                    onClick={downloadLkpdPdf}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow flex items-center space-x-1.5 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh PDF 100 Soal (.pdf)</span>
                  </button>
                </div>

                <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed max-h-96 overflow-y-auto p-3 bg-white rounded-xl border border-slate-200 font-sans">
                  {generatedRpp.lkpd}
                </div>
              </div>
            </div>
          )}

          {/* Saved RPP & LKPD Section */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span>Riwayat RPP & LKPD Tersimpan</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Daftar RPP & LKPD yang telah digenerate dan tersimpan otomatis di akun Anda.
                </p>
              </div>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 font-bold text-xs rounded-full border border-blue-200">
                {savedRppList.length} Tersimpan
              </span>
            </div>

            {savedRppList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs">
                Belum ada RPP & LKPD tersimpan. Silakan isi form di atas dan klik <strong>Generate RPP & LKPD AI</strong>.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedRppList.map((item, idx) => (
                  <div key={`${item.id || 'rpp'}-${idx}`} className="p-4 bg-slate-50 hover:bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 gap-1">
                        <div className="flex items-center space-x-1 overflow-hidden">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md truncate max-w-[120px]">{item.curriculum || 'Kurikulum Merdeka'}</span>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md truncate max-w-[90px]">{item.subject}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{formatIndonesianDate(item.created_at)}</span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 line-clamp-2">{item.topic}</h4>
                      <p className="text-xs text-slate-600 font-medium">Jenjang: {item.grade} • Alokasi: {item.duration}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-1">
                      <button
                        onClick={() => setViewingRppModal(item)}
                        className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl flex items-center space-x-1 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Lihat</span>
                      </button>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => downloadSavedRppPdf(item)}
                          title="Download PDF RPP"
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center space-x-1 shadow-xs transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>RPP</span>
                        </button>
                        <button
                          onClick={() => downloadSavedLkpdPdf(item)}
                          title="Download PDF LKPD"
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center space-x-1 shadow-xs transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>LKPD</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSavedRpp(item.id)}
                          title="Hapus RPP"
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Input Bulk / Single Student Names */}
      {isStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
            <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Input Daftar Nama Siswa</h3>
              <button onClick={() => setIsStudentModalOpen(false)} className="text-white/80 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleGenerateStudents} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Masukkan Nama Siswa (1 Nama Per Baris)
                </label>
                <textarea
                  rows={5}
                  value={rawStudentNamesInput}
                  onChange={(e) => setRawStudentNamesInput(e.target.value)}
                  placeholder={`Ahmad Rizky Pratama\nSiti Rahmawati\nBudi Santoso`}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStudentModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStudents}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  {isSubmittingStudents ? 'Memproses Auto-Generate...' : 'Auto-Generate Akun Resmi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Student Data / Password (Wali Kelas) */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
            <div className="p-6 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Edit Data & Reset Password Siswa</h3>
              <button onClick={() => setEditingStudent(null)} className="text-white/80 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveStudentEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Lengkap Siswa *
                </label>
                <input
                  type="text"
                  value={studentNameEdit}
                  onChange={(e) => setStudentNameEdit(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Username Official (Read-Only)
                </label>
                <input
                  type="text"
                  value={editingStudent.username}
                  disabled
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-mono text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reset Password Siswa *
                </label>
                <PasswordInput
                  value={studentPasswordEdit}
                  onChange={(e) => setStudentPasswordEdit(e.target.value)}
                  placeholder="Masukkan password siswa baru"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit Class Room */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
            <div className="p-6 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">
                {editingClass ? 'Edit Ruang Kelas Permanen' : 'Buat Ruang Kelas Permanen'}
              </h3>
              <button onClick={() => setIsClassModalOpen(false)} className="text-white/80 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nama Kelas *</label>
                <input
                  type="text"
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  placeholder="Contoh: Kelas X IPA 1"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Mata Pelajaran *</label>
                <input
                  type="text"
                  value={classSubjectInput}
                  onChange={(e) => setClassSubjectInput(e.target.value)}
                  placeholder="Contoh: Matematika / Fisika"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Jenjang Tingkat</label>
                <select
                  value={classGradeInput}
                  onChange={(e) => setClassGradeInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold"
                >
                  <option value="SD Kelas 1-6">SD / MI</option>
                  <option value="SMP Kelas 7-9">SMP / MTs</option>
                  <option value="SMA Kelas 10-12">SMA / MA / SMK</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCreatingClass}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  {isCreatingClass ? 'Menyimpan...' : editingClass ? 'Simpan Perubahan Kelas' : 'Buat & Generate ID Unik (C-XXXXXX)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Upload Material */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Unggah Materi Pelajaran</h3>
              <button onClick={() => setIsMaterialModalOpen(false)} className="text-white/80 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleUploadMaterial} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Pilih File Dokumen / Materi *
                </label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg"
                  className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
                {selectedFile && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">
                    ✓ Terpilih: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Judul Materi *</label>
                <input
                  type="text"
                  value={materialTitle}
                  onChange={(e) => setMaterialTitle(e.target.value)}
                  placeholder="Contoh: Modul Bab 1 Teorema Pythagoras"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Deskripsi Ringkas</label>
                <input
                  type="text"
                  value={materialDesc}
                  onChange={(e) => setMaterialDesc(e.target.value)}
                  placeholder="Instruksi bacaan untuk siswa..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Tipe File</label>
                <select
                  value={materialType}
                  onChange={(e) => setMaterialType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold"
                >
                  <option value="PDF">Dokumen PDF</option>
                  <option value="PPT">Presentasi PPT/PPTX</option>
                  <option value="DOC">Word / Modul Teks</option>
                  <option value="IMAGE">Gambar / Infografis</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsMaterialModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploadingMaterial}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  {isUploadingMaterial ? 'Mengunggah...' : 'Unggah Materi Ke Kelas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AI Quiz Generator */}
      {isQuizGeneratorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100">
            <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center space-x-2">
                <Wand2 className="w-5 h-5" />
                <span>Generator Kuis AI Gemini</span>
              </h3>
              <button onClick={() => setIsQuizGeneratorModalOpen(false)} className="text-white/80 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleGenerateAIQuiz} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Judul Kuis *</label>
                <input
                  type="text"
                  value={quizTitleInput}
                  onChange={(e) => setQuizTitleInput(e.target.value)}
                  placeholder="Contoh: Kuis Matematika Bab 2 Aljabar"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Jenjang Kelas</label>
                  <input
                    type="text"
                    value={quizGradeLevel}
                    onChange={(e) => setQuizGradeLevel(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Tipe Soal</label>
                  <select
                    value={quizQuestionType}
                    onChange={(e) => setQuizQuestionType(e.target.value as 'PG' | 'Uraian')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    <option value="PG">Pilihan Ganda (PG)</option>
                    <option value="Uraian">Uraian / Esai</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Materi / Topik Pembahasan (Atau Teks PDF)
                </label>
                <textarea
                  rows={3}
                  value={quizTopicPrompt}
                  onChange={(e) => setQuizTopicPrompt(e.target.value)}
                  placeholder="Ketik topik atau tempel ringkasan dokumen PDF di sini..."
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Jumlah Soal</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={quizQuestionCount}
                    onChange={(e) => setQuizQuestionCount(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Timer/Soal (Detik)</label>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={quizTimerPerQuestion}
                    onChange={(e) => setQuizTimerPerQuestion(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsQuizGeneratorModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingQuiz}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50 hover:opacity-95"
                >
                  {isGeneratingQuiz ? 'Gemini Sedang Membuat Soal...' : 'Generate & Buka Room Kuis (Q-XXXXXX)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: View Saved RPP & LKPD Detail */}
      {viewingRppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden border border-slate-100">
            <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div>
                <span className="text-xs text-blue-200 font-bold uppercase tracking-wider">Detail Dokumen Tersimpan</span>
                <h3 className="font-bold text-lg">{viewingRppModal.topic}</h3>
                <p className="text-xs text-blue-100">{viewingRppModal.curriculum || 'Kurikulum Merdeka'} • {viewingRppModal.subject} • {viewingRppModal.grade} • {formatIndonesianDate(viewingRppModal.created_at)}</p>
              </div>
              <button onClick={() => setViewingRppModal(null)} className="text-white/80 hover:text-white text-2xl font-bold">
                &times;
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm text-blue-700 flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>Modul Ajar / RPP</span>
                    </h4>
                    <button
                      onClick={() => downloadSavedRppPdf(viewingRppModal)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh PDF</span>
                    </button>
                  </div>
                  <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed p-3 bg-white rounded-xl border border-slate-200 max-h-80 overflow-y-auto font-sans">
                    {viewingRppModal.rppContent}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm text-emerald-700 flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>Lembar Kerja Peserta Didik (LKPD)</span>
                    </h4>
                    <button
                      onClick={() => downloadSavedLkpdPdf(viewingRppModal)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh PDF</span>
                    </button>
                  </div>
                  <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed p-3 bg-white rounded-xl border border-slate-200 max-h-80 overflow-y-auto font-sans">
                    {viewingRppModal.lkpdContent}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => handleDeleteSavedRpp(viewingRppModal.id)}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus RPP & LKPD Ini</span>
              </button>
              <button
                onClick={() => setViewingRppModal(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
