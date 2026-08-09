import React, { useState, useEffect } from 'react';
import { UserProfile, ClassRoom, MaterialItem, QuizRoom, QuizQuestion, QuizParticipant } from '../../types';
import { db } from '../../lib/firebase';
import { 
  collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc, onSnapshot 
} from 'firebase/firestore';
import { 
  KeyRound, BookOpen, FileText, AlertTriangle, Clock, Award, CheckCircle, 
  Download, ArrowRight, ShieldAlert, Check, HelpCircle
} from 'lucide-react';

interface StudentDashboardProps {
  user: UserProfile;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ user }) => {
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinedClasses, setJoinedClasses] = useState<ClassRoom[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [classMaterials, setClassMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Live Quiz State
  const [activeQuiz, setActiveQuiz] = useState<QuizRoom | null>(null);
  const [quizParticipantDocId, setQuizParticipantDocId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [essayAnswerInput, setEssayAnswerInput] = useState<string>('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [myScore, setMyScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<QuizParticipant[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  // Real-time listener for joined classes
  useEffect(() => {
    if (!user.uid) return;
    setLoading(true);

    const q = query(
      collection(db, 'classes'),
      where('student_ids', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: ClassRoom[] = [];
      const seen = new Set<string>();
      snapshot.forEach((d) => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          list.push({ id: d.id, ...d.data() } as ClassRoom);
        }
      });
      setJoinedClasses(list);
      setLoading(false);

      if (list.length > 0) {
        setSelectedClass((prev) => {
          if (!prev) return list[0];
          const exists = list.find((c) => c.id === prev.id);
          return exists || list[0];
        });
      } else {
        setSelectedClass(null);
      }
    }, (err) => {
      console.error('Error in classes listener:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  // Real-time listener for materials in selected class
  useEffect(() => {
    if (!selectedClass?.id) {
      setClassMaterials([]);
      return;
    }

    const q = query(collection(db, 'materials'), where('class_id', '==', selectedClass.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: MaterialItem[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as MaterialItem));
      setClassMaterials(list);
    }, (err) => {
      console.error('Error in materials listener:', err);
    });

    return () => unsubscribe();
  }, [selectedClass?.id]);

  // Focus Detector / Anti-Cheating Mode Tab-Switch Listener
  useEffect(() => {
    if (activeQuiz && !quizFinished) {
      const handleVisibilityChange = async () => {
        if (document.hidden) {
          const newCount = tabSwitchCount + 1;
          setTabSwitchCount(newCount);
          setNotification(`⚠️ PERINGATAN ANTI-NYONTEK! Anda terdeteksi meninggalkan layar/tab kuis (${newCount}x).`);

          if (quizParticipantDocId) {
            await updateDoc(doc(db, 'quiz_participants', quizParticipantDocId), {
              tab_switches: newCount,
            });
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }, [activeQuiz, quizFinished, tabSwitchCount, quizParticipantDocId]);

  // Real-time listener for active quiz document (status, timer, questions)
  useEffect(() => {
    if (!activeQuiz?.id) return;

    const quizDocRef = doc(db, 'quizzes', activeQuiz.id);
    const unsubscribe = onSnapshot(quizDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const updatedData = { id: docSnap.id, ...docSnap.data() } as QuizRoom;
        setActiveQuiz(updatedData);
        if (updatedData.status === 'finished') {
          setQuizFinished(true);
        }
      } else {
        alert('Room kuis telah ditutup atau dihapus oleh Guru.');
        setActiveQuiz(null);
      }
    }, (err) => {
      console.error('Error listening to active quiz doc:', err);
    });

    return () => unsubscribe();
  }, [activeQuiz?.id]);

  // Reset timer per question whenever activeQuiz becomes active or currentQuestionIndex changes
  useEffect(() => {
    if (activeQuiz && activeQuiz.status === 'active' && !quizFinished) {
      setTimeRemaining(activeQuiz.timer_per_question || 30);
    }
  }, [activeQuiz?.status, currentQuestionIndex, quizFinished]);

  // Timer Countdown per question
  useEffect(() => {
    if (activeQuiz && activeQuiz.status === 'active' && !quizFinished && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleAutoNextQuestion();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [activeQuiz?.status, currentQuestionIndex, quizFinished, timeRemaining]);

  // Real-time Leaderboard Listener
  useEffect(() => {
    if (activeQuiz) {
      const q = query(collection(db, 'quiz_participants'), where('quiz_id', '==', activeQuiz.id));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: QuizParticipant[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as QuizParticipant));
        list.sort((a, b) => b.score - a.score);
        setLeaderboard(list);
      });
      return () => unsubscribe();
    }
  }, [activeQuiz]);

  // Blob URL Material Viewer/Downloader to fix desktop browser blank page / refresh bug
  const handleViewOrDownloadMaterial = async (fileUrl: string, fileName: string, action: 'open' | 'download') => {
    if (!fileUrl) return;

    try {
      if (fileUrl.startsWith('data:')) {
        const res = await fetch(fileUrl);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        if (action === 'download') {
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName || 'Materi_KelasArena.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          // Open Blob URL in new tab directly without requiring page refresh
          const w = window.open(blobUrl, '_blank');
          if (!w) {
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName || 'Materi_KelasArena.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        }
      } else {
        if (action === 'download') {
          const a = document.createElement('a');
          a.href = fileUrl;
          a.download = fileName || 'Materi_KelasArena';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          window.open(fileUrl, '_blank');
        }
      }
    } catch (err) {
      console.error('Error handling material file:', err);
      window.open(fileUrl, '_blank');
    }
  };

  const handleJoinRoomByCode = async (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;

    if (cleanCode.startsWith('C-')) {
      // Permanent Class Room Join
      const q = query(collection(db, 'classes'), where('code', '==', cleanCode));
      const snap = await getDocs(q);
      if (snap.empty) {
        alert(`ID Kelas "${cleanCode}" tidak ditemukan.`);
        return;
      }
      const classDoc = snap.docs[0];
      const classData = classDoc.data() as ClassRoom;

      if (!classData.student_ids.includes(user.uid)) {
        const updatedIds = [...classData.student_ids, user.uid];
        await updateDoc(doc(db, 'classes', classDoc.id), { student_ids: updatedIds });
        alert(`Selamat! Anda telah bergabung ke Kelas ${classData.name}`);
      } else {
        alert(`Anda sudah terdaftar di Kelas ${classData.name}`);
      }
    } else if (cleanCode.startsWith('Q-')) {
      // Live Quiz Room Join
      const q = query(collection(db, 'quizzes'), where('code', '==', cleanCode));
      const snap = await getDocs(q);
      if (snap.empty) {
        alert(`ID Room Kuis "${cleanCode}" tidak ditemukan.`);
        return;
      }
      const quizDoc = snap.docs[0];
      const quizData = { id: quizDoc.id, ...quizDoc.data() } as QuizRoom;

      if (quizData.lock_room) {
        alert('Maaf, Room Kuis ini sedang dikunci oleh Guru.');
        return;
      }

      // Register Participant in Firestore
      const participantId = `p_${quizData.id}_${user.uid}`;
      const participantData: QuizParticipant = {
        id: participantId,
        quiz_id: quizData.id,
        student_id: user.uid,
        student_name: user.name,
        score: 0,
        current_question_index: 0,
        tab_switches: 0,
        completed: false,
        answers: {},
        updated_at: new Date().toISOString(),
      };

      await setDoc(doc(db, 'quiz_participants', participantId), participantData);

      setActiveQuiz(quizData);
      setQuizParticipantDocId(participantId);
      setCurrentQuestionIndex(0);
      setTimeRemaining(quizData.timer_per_question || 30);
      setQuizFinished(false);
      setMyScore(0);
    } else {
      alert('Format ID tidak valid. Gunakan C-XXXXXX untuk Kelas atau Q-XXXXXX untuk Kuis.');
    }
  };

  const handleAnswerSubmit = async () => {
    if (!activeQuiz || !quizParticipantDocId) return;

    setIsSubmittingAnswer(true);
    const currentQ = activeQuiz.questions[currentQuestionIndex];
    let isCorrect = false;
    let earnedPoints = 0;

    if (currentQ.type === 'PG') {
      isCorrect = selectedOption === currentQ.correctAnswer;
      if (isCorrect) {
        // Speed bonus logic: faster answer gives slightly higher points
        const speedBonus = Math.floor(timeRemaining * 0.5);
        earnedPoints = 100 + speedBonus;
      }
    } else {
      // Essay Auto-Grader via Gemini API Endpoint Proxy
      try {
        const response = await fetch('/api/gemini/grade-essay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: currentQ.question,
            studentAnswer: essayAnswerInput,
            keyAnswer: currentQ.correctAnswer,
            maxScore: 100,
          }),
        });
        const gradeData = await response.json();
        earnedPoints = gradeData.score || 75;
      } catch (err) {
        earnedPoints = 70;
      }
    }

    const newScore = myScore + earnedPoints;
    setMyScore(newScore);

    await updateDoc(doc(db, 'quiz_participants', quizParticipantDocId), {
      score: newScore,
      current_question_index: currentQuestionIndex + 1,
      updated_at: new Date().toISOString(),
    });

    setIsSubmittingAnswer(false);
    handleAdvanceQuestion();
  };

  const handleAutoNextQuestion = () => {
    handleAdvanceQuestion();
  };

  const handleAdvanceQuestion = () => {
    if (!activeQuiz) return;
    if (currentQuestionIndex + 1 < activeQuiz.questions.length) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedOption('');
      setEssayAnswerInput('');
      setTimeRemaining(activeQuiz.timer_per_question || 30);
    } else {
      setQuizFinished(true);
      if (quizParticipantDocId) {
        updateDoc(doc(db, 'quiz_participants', quizParticipantDocId), {
          completed: true,
        });
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Anti-Cheating Warning Alert Banner */}
      {notification && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-xs font-bold text-rose-800 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-rose-600 underline text-xs">
            Tutup
          </button>
        </div>
      )}

      {/* If in Active Live Quiz Arena */}
      {activeQuiz ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xl space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div>
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                Arena Live Kuis AI • ID Room {activeQuiz.code}
              </span>
              <h1 className="text-2xl font-black text-slate-900 mt-1">{activeQuiz.title}</h1>
            </div>

            <div className="flex items-center space-x-3">
              <div className="px-3.5 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4" />
                <span>Detector Tab: {tabSwitchCount}x Warning</span>
              </div>

              <button
                onClick={() => setActiveQuiz(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Keluar Arena
              </button>
            </div>
          </div>

          {activeQuiz.status === 'lobby' ? (
            <div className="p-8 sm:p-12 text-center space-y-6 max-w-lg mx-auto bg-amber-50/80 rounded-3xl border border-amber-200/80 shadow-sm">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-500/30">
                <Clock className="w-8 h-8 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-600"></span>
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">Menunggu Guru Memulai Kuis...</h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  Anda telah berhasil bergabung di <strong>{activeQuiz.title}</strong> (ID: <span className="font-mono font-bold text-amber-700">{activeQuiz.code}</span>). Soal dan timer pengerjaan akan otomatis muncul di layar ini begitu Guru menekan tombol <strong>Mulai Kuis Sekarang</strong>.
                </p>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-amber-200 text-left space-y-3 shadow-xs">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Peserta yang Siap di Lobby</span>
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[11px] font-bold">{leaderboard.length} Siswa</span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {leaderboard.map((lb, idx) => (
                    <div key={`${lb.id || 'lb'}-${idx}`} className="text-xs text-slate-700 flex items-center justify-between py-1.5 border-b border-slate-100 last:border-none">
                      <span className="font-semibold">{lb.student_name} {lb.student_id === user.uid ? '(Saya)' : ''}</span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Ready ✓</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : !quizFinished ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Question Box */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-600">
                    Soal No. {currentQuestionIndex + 1} dari {activeQuiz.questions.length}
                  </span>

                  <div className="flex items-center space-x-1.5 text-amber-600 font-mono font-extrabold text-sm bg-amber-50 px-3 py-1 rounded-xl border border-amber-200">
                    <Clock className="w-4 h-4" />
                    <span>{timeRemaining} Detik</span>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 leading-relaxed">
                    {activeQuiz.questions[currentQuestionIndex]?.question}
                  </h3>

                  {/* Multiple Choice Options */}
                  {activeQuiz.questions[currentQuestionIndex]?.type === 'PG' && (
                    <div className="space-y-2.5 pt-2">
                      {activeQuiz.questions[currentQuestionIndex]?.options?.map((opt, oIdx) => (
                        <button
                          key={oIdx}
                          onClick={() => setSelectedOption(opt)}
                          className={`w-full p-4 rounded-2xl text-left font-semibold text-sm transition-all border flex items-center justify-between ${
                            selectedOption === opt
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>{opt}</span>
                          {selectedOption === opt && <Check className="w-5 h-5 text-white" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Essay Answer Input */}
                  {activeQuiz.questions[currentQuestionIndex]?.type === 'Uraian' && (
                    <div className="pt-2">
                      <textarea
                        rows={4}
                        value={essayAnswerInput}
                        onChange={(e) => setEssayAnswerInput(e.target.value)}
                        placeholder="Tuliskan jawaban penjelasan Anda di sini..."
                        className="w-full p-4 bg-white border border-slate-300 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  )}

                  <div className="pt-4 flex justify-end">
                    <button
                      onClick={handleAnswerSubmit}
                      disabled={
                        isSubmittingAnswer ||
                        (activeQuiz.questions[currentQuestionIndex]?.type === 'PG' && !selectedOption) ||
                        (activeQuiz.questions[currentQuestionIndex]?.type === 'Uraian' && !essayAnswerInput)
                      }
                      className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-sm rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center space-x-2"
                    >
                      <span>
                        {isSubmittingAnswer
                          ? 'Menilai...'
                          : currentQuestionIndex < activeQuiz.questions.length - 1
                          ? 'Soal Selanjutnya'
                          : 'Selesaikan Kuis ✓'}
                      </span>
                      {currentQuestionIndex < activeQuiz.questions.length - 1 && (
                        <ArrowRight className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Leaderboard Sidebar */}
              <div className="space-y-4">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    <span>Papan Peringkat Live</span>
                  </h3>

                  <div className="space-y-2">
                    {leaderboard.map((lb, idx) => (
                      <div
                        key={`${lb.id || 'lb'}-${idx}`}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                          lb.student_id === user.uid
                            ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">
                            #{idx + 1}
                          </span>
                          <span className="truncate max-w-[120px]">{lb.student_name}</span>
                        </div>
                        <span className="font-mono font-extrabold text-amber-600">{lb.score || 0} Pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Quiz Completed Screen */
            <div className="p-8 text-center space-y-6 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-lg">
                <Award className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">Kuis Selesai!</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Skor Akhir Anda: <span className="font-bold text-amber-600 text-lg">{myScore} Poin</span>
                </p>
              </div>

              <button
                onClick={() => setActiveQuiz(null)}
                className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow text-sm"
              >
                Kembali ke Dasbor Siswa
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Regular Student Dashboard View */
        <div className="space-y-8">
          {/* Main Hero Header with Single Unified Room Code Input */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-semibold">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Portal Siswa KelasArena</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Selamat Belajar, {user.name}!</h1>
              <p className="text-blue-100 text-xs sm:text-sm leading-relaxed">
                Masukkan <strong>ID Kelas (C-...)</strong> untuk bergabung ke kelas, atau <strong>ID Room Kuis (Q-...)</strong> untuk langsung masuk ke Arena Live Kuis.
              </p>
              <div className="flex items-center space-x-2 pt-1 text-[11px] font-medium text-blue-100/90">
                <span className="px-2 py-0.5 rounded bg-blue-900/40 border border-blue-400/30 font-mono">C-XXXXXX = Room Kelas</span>
                <span className="px-2 py-0.5 rounded bg-indigo-900/40 border border-indigo-400/30 font-mono">Q-XXXXXX = Live Kuis AI</span>
              </div>
            </div>

            {/* Single Prominent Room Input Card */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleJoinRoomByCode(roomCodeInput);
              }}
              className="bg-white p-2.5 sm:p-3 rounded-2xl flex items-center space-x-2 w-full md:w-auto shadow-2xl shrink-0"
            >
              <KeyRound className="w-5 h-5 text-blue-600 shrink-0 ml-2" />
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                placeholder="Masukkan ID (C-... atau Q-...)"
                className="w-full sm:w-56 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-800 bg-transparent border-none focus:outline-none placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all shrink-0 flex items-center space-x-1"
              >
                <span>Masuk</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Joined Permanent Classes & Materials */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Joined Classes List */}
            <div className="space-y-4">
              <h2 className="font-bold text-slate-800 text-base">Kelas Permanen Saya</h2>

              {joinedClasses.length === 0 ? (
                <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-2 shadow-sm">
                  <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-600">Belum Bergabung Kelas</p>
                  <p className="text-[11px] text-slate-400">
                    Masukkan ID Kelas dari guru Anda (contoh: C-XXXXXX) di kolom ID Room di atas.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {joinedClasses.map((c, idx) => (
                    <div
                      key={`${c.id || 'cls'}-${idx}`}
                      onClick={() => {
                        setSelectedClass(c);
                      }}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                        selectedClass?.id === c.id
                          ? 'bg-blue-50/80 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {c.grade_level}
                      </span>
                      <h3 className="font-bold text-slate-900 text-base mt-1">{c.name}</h3>
                      <p className="text-xs text-slate-500 font-medium">Pengajar: {c.teacher_name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Class Materials List */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="font-bold text-slate-800 text-base">Materi Pelajaran</h2>

              {selectedClass ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-blue-600">{selectedClass.subject}</span>
                    <h3 className="text-xl font-black text-slate-900">{selectedClass.name}</h3>
                  </div>

                  {classMaterials.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                      Belum ada materi diunggah di kelas ini.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {classMaterials.map((m, idx) => (
                        <div key={`${m.id || 'mat'}-${idx}`} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                              {m.file_type}
                            </span>
                            <h4 className="font-bold text-slate-800 text-sm mt-1">{m.title}</h4>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{m.description}</p>
                          </div>

                          <div className="flex items-center space-x-2 pt-2 border-t border-slate-200/60">
                            <button
                              type="button"
                              onClick={() => handleViewOrDownloadMaterial(m.file_url, m.file_name || `${m.title}.pdf`, 'open')}
                              className="flex-1 inline-flex items-center justify-center space-x-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>Lihat File</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewOrDownloadMaterial(m.file_url, m.file_name || `${m.title}.pdf`, 'download')}
                              className="inline-flex items-center justify-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition-all"
                              title="Unduh Langsung ke Komputer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Unduh</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-400">
                  Pilih kelas di sebelah kiri untuk melihat materi.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
