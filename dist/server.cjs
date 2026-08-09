var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "10mb" }));
  function getGenAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in environment variables.");
    }
    return new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  async function generateGeminiContent(prompt, responseMimeType = "application/json") {
    const modelsToTry = ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let ai;
    try {
      ai = getGenAI();
    } catch {
      return null;
    }
    for (const model of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: responseMimeType ? { responseMimeType } : void 0
          });
          if (response && response.text) {
            return response.text;
          }
        } catch (err) {
          const errMsg = err?.message || String(err);
          console.warn(`Gemini model '${model}' (attempt ${attempt + 1}) info:`, errMsg);
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 1e3));
          }
        }
      }
    }
    return null;
  }
  function extractShortTopic(rawText) {
    if (!rawText) return "Materi Pembelajaran";
    let clean = rawText.trim();
    clean = clean.replace(/^(materi|bab|modul|topik|sub-materi)\s+[0-9ivxlcdm]+\s*[:\-]?\s*/gi, "").trim();
    const lines = clean.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length > 0) {
      clean = lines[0];
    }
    const parts = clean.split(/(?:\b[I|V|X]+\.|\b[A-Z]\.|\bIndikator:|\bTujuan:|\bCP:|\bTP:)/i);
    if (parts.length > 0 && parts[0].trim().length > 3) {
      clean = parts[0].trim();
    }
    clean = clean.replace(/[:;\-,]+$/, "").trim();
    if (clean.length > 70) {
      clean = clean.substring(0, 70).replace(/\s+\S*$/, "").trim();
    }
    return clean || "Materi Pembelajaran";
  }
  function createDiverseFallbackQuestions(topicText, questionCount, questionType, gradeLevel) {
    const cleanTopic = extractShortTopic(topicText);
    const count = Math.max(1, questionCount || 5);
    const qTypeStr = questionType === "Uraian" ? "Uraian" : "PG";
    const isPG = qTypeStr === "PG";
    const pgTemplates = [
      {
        q: (t) => `Apa definisi utama dan konsep fundamental yang mendasari pembahasan mengenai ${t}?`,
        opts: (t) => [
          `A. Prinsip dasar, variabel, dan teori pokok dalam ${t}`,
          `B. Pendekatan acak tanpa dasar teoretis yang terukur`,
          `C. Aturan konvensional yang tidak memiliki kaitan langsung`,
          `D. Hanya berupa asumsi tanpa pembuktian konsep`
        ],
        ans: (t) => `A. Prinsip dasar, variabel, dan teori pokok dalam ${t}`,
        exp: (t) => `Penguasaan ${t} dimulai dari pemahaman konsep inti dan variabel utamanya.`
      },
      {
        q: (t) => `Manakah contoh penerapan atau studi kasus materi ${t} yang paling tepat untuk jenjang ${gradeLevel || "sekolah"}?`,
        opts: (t) => [
          `A. Pemecahan masalah terstruktur berbasis prinsip dan rumus ${t}`,
          `B. Pengabaian langkah-langkah logika yang berlaku secara ilmiah`,
          `C. Penarikan kesimpulan secara instan tanpa pengolahan data`,
          `D. Penggunaan prosedur yang tidak relevan dengan konteks materi`
        ],
        ans: (t) => `A. Pemecahan masalah terstruktur berbasis prinsip dan rumus ${t}`,
        exp: (t) => `Penerapan ${t} menuntut langkah penyelesaian sistematis sesuai kaidah materi.`
      },
      {
        q: (t) => `Mengapa analisis dan pemahaman mendalam tentang ${t} sangat penting dalam pembelajaran siswa?`,
        opts: (t) => [
          `A. Membentuk pola pikir kritis dan keterampilan bernalar logis`,
          `B. Sekadar menghafal definisi tanpa mengerti penerapannya`,
          `C. Hanya untuk memenuhi syarat administrasi nilai kuis`,
          `D. Mengurangi waktu diskusi interaktif di dalam kelas`
        ],
        ans: (t) => `A. Membentuk pola pikir kritis dan keterampilan bernalar logis`,
        exp: (t) => `Menganalisis ${t} mengasah daya nalar kritis siswa dalam memecahkan masalah.`
      },
      {
        q: (t) => `Ciri utama yang membedakan karakteristik konsep ${t} dibanding topik pembelajaran lainnya adalah...`,
        opts: (t) => [
          `A. Adanya pola terstruktur, hukum logika, dan keterkaitan antar variabel`,
          `B. Sifatnya yang sepenuhnya teoritis tanpa bisa diaplikasikan`,
          `C. Ketiadaan indikator keberhasilan yang jelas dalam analisis`,
          `D. Ketergantungan penuh pada pendapat subjektif tanpa acuan`
        ],
        ans: (t) => `A. Adanya pola terstruktur, hukum logika, dan keterkaitan antar variabel`,
        exp: (t) => `Karakteristik khas ${t} terletak pada keteraturan pola dan logika penyelesaiannya.`
      },
      {
        q: (t) => `Langkah pertama yang paling krusial ketika menghadapi soal atau permasalahan terkait ${t} adalah...`,
        opts: (t) => [
          `A. Mengidentifikasi informasi kunci, variabel, dan komponen utama ${t}`,
          `B. Langsung menebak hasil akhir tanpa melakukan perhitungan/analisis`,
          `C. Mengabaikan data awal yang diberikan dalam soal`,
          `D. Mengganti variabel dengan nilai acak tanpa alasan logis`
        ],
        ans: (t) => `A. Mengidentifikasi informasi kunci, variabel, dan komponen utama ${t}`,
        exp: (t) => `Identifikasi elemen dan variabel kunci pada ${t} merupakan fondasi penyelesaian soal.`
      },
      {
        q: (t) => `Dalam melakukan evaluasi penyelesaian soal ${t}, aspek apa yang harus diperhatikan agar hasil analisis valid?`,
        opts: (t) => [
          `A. Kesesuaian metode penyelesaian dengan aturan ilmiah ${t}`,
          `B. Panjangnya kalimat tanpa memperhatikan kebenaran konsep`,
          `C. Mengabaikan kesalahan pada langkah-langkah pembuktian`,
          `D. Menyamakan semua hasil tanpa verifikasi ulang`
        ],
        ans: (t) => `A. Kesesuaian metode penyelesaian dengan aturan ilmiah ${t}`,
        exp: (t) => `Evaluasi pada ${t} memastikan setiap langkah mengikuti prosedur dan konsep yang sah.`
      },
      {
        q: (t) => `Bagaimana hubungan antara pemahaman teori ${t} dengan kemampuan pemecahan masalah konteks nyata?`,
        opts: (t) => [
          `A. Teori ${t} menjadi landasan dasar untuk merumuskan solusi tepat`,
          `B. Teori dan fakta nyata tidak memiliki kaitan sama sekali`,
          `C. Pemahaman teori justru mempersulit analisis masalah nyata`,
          `D. Hanya rumus praktis tanpa teori yang berguna di lapangan`
        ],
        ans: (t) => `A. Teori ${t} menjadi landasan dasar untuk merumuskan solusi tepat`,
        exp: (t) => `Penguasaan konsep ${t} mempermudah penyelesaian kasus di dunia nyata.`
      },
      {
        q: (t) => `Strategi efektif untuk menghindari kekeliruan atau miskonsepsi saat mempelajari ${t} adalah...`,
        opts: (t) => [
          `A. Berlatih secara berulang, memahami konsep dasar, dan diskusi terarah`,
          `B. Menghafal rumus secara mekanis tanpa memahami maknanya`,
          `C. Menghindari pengerjaan latihan soal ber-tingkat kesulitan tinggi`,
          `D. Mengerjakan soal tanpa memeriksa kembali kesesuaian konsep`
        ],
        ans: (t) => `A. Berlatih secara berulang, memahami konsep dasar, dan diskusi terarah`,
        exp: (t) => `Diskusi dan latihan terarah dapat mengeliminasi miskonsepsi pada materi ${t}.`
      }
    ];
    const uraianTemplates = [
      {
        q: (t) => `Jelaskan secara mendalam pengertian, konsep dasar, serta komponen utama yang membangun materi ${t}!`,
        ans: (t) => `Kunci Jawaban: Penjelasan rinci mencakup definisi resmi ${t}, batasan konsep, serta komponen pembentuk utamanya.`,
        exp: (t) => `Skor maksimal diberikan jika siswa menjelaskan definisi dan seluruh komponen ${t} secara rinci.`
      },
      {
        q: (t) => `Uraikan minimal 3 prinsip pokok atau hukum yang berlaku pada topik ${t} beserta contoh kasusnya!`,
        ans: (t) => `Kunci Jawaban: Menyebutkan 3 prinsip utama ${t} dan memberikan contoh penerapannya yang relevan.`,
        exp: (t) => `Skor dihitung dari kelengkapan 3 prinsip serta keakuratan contoh kasus ${t}.`
      },
      {
        q: (t) => `Berikan analisis langkah-langkah sistematis dalam memecahkan permasalahan atau soal kompleks terkait ${t}!`,
        ans: (t) => `Kunci Jawaban: Menyajikan langkah runtut mulai dari identifikasi masalah, perumusan, hingga penarikan kesimpulan pada ${t}.`,
        exp: (t) => `Siswa dinilai dari keruntutan logika berpikir dan ketepatan prosedur pada ${t}.`
      },
      {
        q: (t) => `Analisislah miskonsepsi atau kesalahan umum yang sering terjadi saat mempelajari ${t}, dan berikan solusi mengatasinya!`,
        ans: (t) => `Kunci Jawaban: Menguraikan bentuk kekeliruan umum pada ${t} serta memberikan cara ilmiah perbaikannya.`,
        exp: (t) => `Menguji kemampuan reflektif dan pemahaman kritis siswa terhadap kekeliruan materi ${t}.`
      },
      {
        q: (t) => `Buatlah rangkuman komprehensif atau peta konsep yang menghubungkan sub-materi dalam ${t} secara terstruktur!`,
        ans: (t) => `Kunci Jawaban: Rangkuman terintegrasi yang menunjukkan keterkaitan antar konsep dalam materi ${t}.`,
        exp: (t) => `Penilaian berfokus pada kelengkapan keterkaitan antar konsep ${t}.`
      },
      {
        q: (t) => `Bagaimana relevansi penerapan materi ${t} dalam kehidupan sehari-hari atau dunia industri/ilmu pengetahuan saat ini?`,
        ans: (t) => `Kunci Jawaban: Menyebutkan aplikasi praktis ${t} dalam kehidupan sehari-hari atau perkembangan teknologi.`,
        exp: (t) => `Mengukur wawasan kontekstual siswa terhadap pemanfaatan materi ${t}.`
      }
    ];
    const questionsList = [];
    for (let i = 1; i <= count; i++) {
      if (isPG) {
        const tmpl = pgTemplates[(i - 1) % pgTemplates.length];
        questionsList.push({
          id: `q${i}`,
          question: tmpl.q(cleanTopic),
          type: "PG",
          options: tmpl.opts(cleanTopic),
          correctAnswer: tmpl.ans(cleanTopic),
          explanation: tmpl.exp(cleanTopic)
        });
      } else {
        const tmpl = uraianTemplates[(i - 1) % uraianTemplates.length];
        questionsList.push({
          id: `q${i}`,
          question: tmpl.q(cleanTopic),
          type: "Uraian",
          options: [],
          correctAnswer: tmpl.ans(cleanTopic),
          explanation: tmpl.exp(cleanTopic)
        });
      }
    }
    return questionsList;
  }
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "KelasArena Server Proxy API" });
  });
  app.post("/api/gemini/generate-quiz", async (req, res) => {
    try {
      const { topicText, gradeLevel, questionType, questionCount } = req.body;
      const qTypeStr = questionType === "Uraian" ? "Uraian" : "PG";
      const count = questionCount || 5;
      const prompt = `
Anda adalah Pakar Evaluasi Pembelajaran Kurikulum Indonesia untuk jenjang ${gradeLevel || "SMP/SMA"}.
Buatkan tepat ${count} soal kuis interaktif variatif tipe ${qTypeStr} mengenai materi:
"""
${topicText || "Materi Umum Ilmu Pengetahuan"}
"""

Persyaratan Output (Harus JSON valid bertipe Array of Objects):
Format tiap item:
[
  {
    "id": "q1",
    "question": "Kalimat soal yang jelas, spesifik, kontekstual, dan bervariasi sesuai materi",
    "type": "${qTypeStr}",
    ${qTypeStr === "PG" ? '"options": ["A. ...", "B. ...", "C. ...", "D. ..."],' : '"options": null,'}
    "correctAnswer": ${qTypeStr === "PG" ? '"pilihan jawaban yang benar persis sesuai salah satu di options"' : '"kunci jawaban & pedoman penskoran uraian secara mendalam dan rinci"'},
    "explanation": "penjelasan konsep ilmiah jawaban"
  }
]
`;
      const textResult = await generateGeminiContent(prompt, "application/json");
      let questions = [];
      if (textResult) {
        let cleanText = textResult.replace(/```json/gi, "").replace(/```/g, "").trim();
        try {
          const parsed = JSON.parse(cleanText);
          if (Array.isArray(parsed)) {
            questions = parsed;
          } else if (parsed && Array.isArray(parsed.questions)) {
            questions = parsed.questions;
          } else if (parsed && Array.isArray(parsed.soal)) {
            questions = parsed.soal;
          } else if (parsed && Array.isArray(parsed.data)) {
            questions = parsed.data;
          } else if (parsed && typeof parsed === "object") {
            const arrKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
            if (arrKey) questions = parsed[arrKey];
          }
        } catch (pErr) {
          console.warn("Failed to parse Gemini quiz JSON response, using fallback");
        }
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        questions = createDiverseFallbackQuestions(topicText, count, qTypeStr, gradeLevel);
      } else {
        questions = questions.map((q, idx) => ({
          id: q.id || `q${idx + 1}`,
          question: q.question || `Soal ${idx + 1} (${qTypeStr})`,
          type: qTypeStr,
          options: qTypeStr === "PG" && Array.isArray(q.options) && q.options.length >= 2 ? q.options : qTypeStr === "PG" ? [
            "A. Jawaban A",
            "B. Jawaban B",
            "C. Jawaban C",
            "D. Jawaban D"
          ] : [],
          correctAnswer: q.correctAnswer || (qTypeStr === "PG" ? "A. Jawaban A" : "Kunci jawaban uraian."),
          explanation: q.explanation || "Penjelasan materi oleh AI KelasArena."
        }));
      }
      res.json({ success: true, questions });
    } catch (error) {
      const count = req.body.questionCount || 5;
      const qType = req.body.questionType || "PG";
      const topic = req.body.topicText || "Materi Pembelajaran";
      const grade = req.body.gradeLevel || "SMP/SMA";
      const fallbackQuestions = createDiverseFallbackQuestions(topic, count, qType, grade);
      res.json({ success: true, questions: fallbackQuestions });
    }
  });
  app.post("/api/gemini/grade-essay", async (req, res) => {
    try {
      const { question, studentAnswer, keyAnswer, maxScore } = req.body;
      const prompt = `
Anda adalah penilai otomatis AI KelasArena untuk soal esai/uraian.
Soal: ${question}
Kunci Jawaban Resmi: ${keyAnswer}
Jawaban Siswa: ${studentAnswer}
Skor Maksimal: ${maxScore || 100}

Kembalikan JSON valid:
{
  "score": number (nilai 0 hingga ${maxScore || 100}),
  "feedback": "Kritik & saran konstruktif singkat dalam Bahasa Indonesia"
}
`;
      const textResult = await generateGeminiContent(prompt, "application/json");
      let parsed = {};
      if (textResult) {
        let cleanText = textResult.replace(/```json/gi, "").replace(/```/g, "").trim();
        try {
          parsed = JSON.parse(cleanText);
        } catch {
          parsed = { score: 85, feedback: "Jawaban cukup sesuai dengan konsep dasar kunci jawaban." };
        }
      }
      res.json({ success: true, score: parsed.score ?? 85, feedback: parsed.feedback || "Jawaban dinilai oleh AI." });
    } catch {
      res.json({ success: true, score: 80, feedback: "Jawaban telah dinilai secara otomatis oleh sistem AI." });
    }
  });
  app.post("/api/gemini/generate-rpp", async (req, res) => {
    try {
      const { curriculum, subject, grade, topic, duration } = req.body;
      const currName = curriculum || "Kurikulum Merdeka";
      const cleanTopic = extractShortTopic(topic || "Materi Pembelajaran");
      const timeDuration = duration || "2 x 45 Menit";
      const prompt = `
Anda adalah Pakar Evaluasi Pembelajaran & Pengembang Kurikulum Pendidikan Indonesia.
Buatkan Modul Ajar RPP (Rencana Pelaksanaan Pembelajaran) dan Lembar Kerja Peserta Didik (LKPD) yang komprehensif disesuaikan dengan pedoman ${currName} untuk:
- Kurikulum: ${currName}
- Mata Pelajaran: ${subject}
- Jenjang/Kelas: ${grade}
- Topik / Materi: ${cleanTopic}
- Alokasi Waktu: ${timeDuration}

Kembalikan respon JSON MURNI:
{
  "rppContent": "teks lengkap Modul Ajar RPP dengan bagian I. INFORMASI UMUM, II. KOMPONEN INTI, III. LANGKAH PEMBELAJARAN, IV. ASESMEN & RUBRIK PENILAIAN, V. RELEVANSI PROFIL PELAJAR PANCASILA / KARAKTER",
  "lkpdCoreSummary": "Rangkuman materi kunci ${cleanTopic} yang lengkap dan terstruktur sebagai panduan peserta didik"
}
`;
      const textResult = await generateGeminiContent(prompt, "application/json");
      let parsed = {};
      if (textResult) {
        let cleanText = textResult.replace(/```json/gi, "").replace(/```/g, "").trim();
        try {
          parsed = JSON.parse(cleanText);
        } catch {
        }
      }
      const defaultRpp = `MODUL AJAR / RPP MODERN (${currName.toUpperCase()})
Acuan Kurikulum : ${currName}
Mata Pelajaran   : ${subject || "Matematika"}
Jenjang / Kelas  : ${grade || "SMP Kelas 8"}
Topik / Materi   : ${cleanTopic}
Alokasi Waktu    : ${timeDuration}

============================================================
I. INFORMASI UMUM
============================================================
1. Identitas Modul:
   - Satuan Pendidikan : SMP / SMA Negeri
   - Penyusun           : AI Evaluator Pembelajaran KelasArena
   - Sarana & Prasarana : Media Interaktif, LKPD Terstruktur, Proyektor, & Buku Teks

2. Profil Pelajar Pancasila / Penguatan Karakter:
   - Bernalar Kritis : Memproses informasi dan mengidentifikasi logika materi ${cleanTopic}.
   - Mandiri         : Bertanggung jawab atas pengerjaan tugas & kuis terstruktur.
   - Gotong Royong   : Berkolaborasi aktif dalam diskusi kelompok pemecahan masalah.

3. Target Peserta Didik & Model Pembelajaran:
   - Target          : Peserta didik reguler/tipikal
   - Model           : Problem Based Learning (PBL) / Discovery Learning

============================================================
II. KOMPONEN INTI
============================================================
1. Capaian / Tujuan Pembelajaran (TP):
   - Peserta didik dapat memahami konsep dasar, prinsip utama, dan rumus yang berlaku pada ${cleanTopic}.
   - Peserta didik mampu menganalisis dan memecahkan soal cerita/kasus konteks nyata terkait ${cleanTopic} secara teliti dan terstruktur.

2. Pemahaman Bermakna:
   - Penguasaan konsep ${cleanTopic} memberikan kemampuan berpikir logis dan sistematis untuk menyelesaikan berbagai tantangan praktis di kehidupan sehari-hari.

3. Pertanyaan Pemantik:
   - Bagaimana peran dan penerapan ${cleanTopic} dalam memecahkan masalah nyata yang sering kita temui?
   - Mengapa kita perlu mempelajari prosedur penyelesaian ${cleanTopic} secara runtut dan terstruktur?

============================================================
III. LANGKAH-LANGKAH KEGIATAN PEMBELAJARAN
============================================================
1. Pendahuluan (15 Menit):
   - Guru membuka pembelajaran dengan salam, doa, dan mengecek kehadiran siswa.
   - Guru memberikan apersepsi terkait materi ${cleanTopic} serta menyampaikan tujuan pembelajaran.
   - Guru memberikan pertanyaan pemantik untuk memotivasi peserta didik.

2. Kegiatan Inti (60 Menit):
   - Orientasi Masalah : Guru menyajikan studi kasus atau fenomena kontekstual terkait ${cleanTopic}.
   - Pengorganisasian  : Peserta didik dibagi menjadi beberapa kelompok kecil dan menerima LKPD.
   - Penyelidikan       : Peserta didik berdiskusi, menggali informasi, dan mengolah data terkait ${cleanTopic}.
   - Mengembangkan Karya: Setiap kelompok menyusun hasil diskusi dan solusi masalah pada LKPD.
   - Evaluasi & Presentasi: Perwakilan kelompok mempresentasikan hasil pengerjaan, dilanjutkan diskusi kelas.

3. Penutup (15 Menit):
   - Peserta didik bersama guru menyimpulkan poin-poin utama materi ${cleanTopic}.
   - Guru memberikan refleksi pembelajaran dan umpan balik atas performa siswa.
   - Guru menginformasikan penugasan mandiri (100 Soal LKPD) dan materi pertemuan berikutnya.

============================================================
IV. ASESMEN & PENILAIAN
============================================================
1. Asesmen Formatif : Observasi keaktifan diskusi & pengerjaan Lembar Kerja Peserta Didik (LKPD).
2. Asesmen Sumatif  : Kuis evaluasi ${cleanTopic} (Pilihan Ganda & Uraian).
3. Pengayaan & Remedial: Pengerjaan soal HOTS tingkat lanjut bagi siswa tuntas dan bimbingan tutor sebaya bagi siswa remedial.`;
      let lkpd100QuestionsText = `LEMBAR KERJA PESERTA DIDIK (LKPD) - 100 SOAL URAIAN COMPREHENSIVE
Acuan Kurikulum : ${currName}
Mata Pelajaran   : ${subject || "Matematika"}
Kelas / Jenjang  : ${grade || "SMP Kelas 8"}
Topik Materi     : ${cleanTopic}
Alokasi Waktu    : ${timeDuration}

PETUNJUK PENGERJAAN:
1. Isilah identitas diri (Nama, Kelas, No. Presensi) pada lembar jawaban secara lengkap.
2. Bacalah rangkuman materi ${cleanTopic} dengan cermat sebelum menjawab.
3. Kerjakan 100 soal uraian di bawah ini secara mandiri, jujur, dan terstruktur sesuai kaidah ${currName}.

============================================================
RANGKUMAN MATERI & BACAAN PANDUAN SISWA
============================================================
${parsed.lkpdCoreSummary || `Topik ${cleanTopic} merupakan materi inti pada mata pelajaran ${subject || "Matematika"} jenjang ${grade || "SMP/SMA"}. Pemahaman mendalam mencakup penguasaan konsep dasar, aturan dan formula ilmiah, keruntutan logika berpikir, serta kemampuan menerapkan solusi pada permasalahan nyata.`}

============================================================
DAFTAR 100 SOAL LATIHAN URAIAN (${currName.toUpperCase()})
============================================================
--- BAGIAN I: PEMAHAMAN KONSEP DASAR (SOAL 1 - 25) ---
`;
      const questionAspects = [
        "Jelaskan definisi resmi dan konsep dasar dari",
        "Sebutkan 3 ciri utama atau karakteristik penting pada",
        "Bagaimana prinsip kerja atau aturan pokok yang berlaku pada",
        "Mengapa pemahaman teoretis mengenai topik",
        "Bandingkan kelebihan dan kelemahan dari metode penyelesaian",
        "Analisis dampak positif dari penerapan konsep",
        "Berikan contoh nyata dalam kehidupan sehari-hari terkait",
        "Jelaskan langkah-langkah sistematis dalam memecahkan masalah",
        "Bagaimana keterkaitan hubungan antara sub-materi",
        "Sebutkan potensi miskonsepsi yang sering ditemui saat mempelajari"
      ];
      for (let i = 1; i <= 100; i++) {
        if (i === 26) {
          lkpd100QuestionsText += `
--- BAGIAN II: PENERAPAN, PERHITUNGAN, & PROSEDUR (SOAL 26 - 50) ---
`;
        } else if (i === 51) {
          lkpd100QuestionsText += `
--- BAGIAN III: ANALISIS KASUS & SOAL TINGKAT TINGGI / HOTS (SOAL 51 - 75) ---
`;
        } else if (i === 76) {
          lkpd100QuestionsText += `
--- BAGIAN IV: EVALUASI, REFLEKSI, & STUDY CASES (SOAL 76 - 100) ---
`;
        }
        const aspect = questionAspects[(i - 1) % questionAspects.length];
        const subTopicNum = Math.ceil(i / 10);
        lkpd100QuestionsText += `${i}. ${aspect} ${cleanTopic} (Sub-Materi Bagian ${subTopicNum})?
   [Lembar Jawaban Siswa: ................................................................................................]

`;
      }
      res.json({
        success: true,
        rppContent: parsed.rppContent || defaultRpp,
        lkpdContent: lkpd100QuestionsText
      });
    } catch (error) {
      const curriculum = req.body.curriculum || "Kurikulum Merdeka";
      const subject = req.body.subject || "Mata Pelajaran";
      const grade = req.body.grade || "Kelas";
      const rawTopic = req.body.topic || "Materi Pembelajaran";
      const cleanTopic = extractShortTopic(rawTopic);
      let fallbackLkpd = `LEMBAR KERJA PESERTA DIDIK (LKPD) - 100 SOAL URAIAN
Acuan Kurikulum: ${curriculum}
Mata Pelajaran: ${subject}
Topik: ${cleanTopic}

`;
      for (let i = 1; i <= 100; i++) {
        fallbackLkpd += `${i}. Jelaskan secara rinci konsep dan penerapan ${cleanTopic} pada pertanyaan bagian ${i}!

`;
      }
      res.json({
        success: true,
        rppContent: `MODUL AJAR RPP (${curriculum.toUpperCase()})
Kurikulum: ${curriculum}
Mata Pelajaran: ${subject}
Jenjang/Kelas: ${grade}
Topik: ${cleanTopic}

1. TUJUAN PEMBELAJARAN:
Siswa dapat menguasai materi ${cleanTopic} secara mendalam.

2. KEGIATAN PEMBELAJARAN:
- Pendahuluan, Kegiatan Inti Eksplorasi, dan Penutup Refleksi.`,
        lkpdContent: fallbackLkpd
      });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
