/**
 * Firebase Cloud Functions Backend Proxy for Google AI Studio (Gemini API)
 *
 * This Cloud Function protects your Gemini API Key by running entirely
 * server-side. React sends requests to these HTTP endpoints, which securely
 * communicate with Gemini using process.env.GEMINI_API_KEY / Secret Manager.
 */

const functions = require("firebase-functions");
const { GoogleGenAI } = require("@google/genai");

// Lazy initialization of GoogleGenAI SDK
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY missing in server environment.");
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * HTTP Cloud Function: Generate Quiz Questions from Prompt/PDF Text
 */
exports.generateQuizProxy = functions.https.onRequest(async (req, res) => {
  // CORS setup
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const { gradeLevel, questionType, questionCount, topicText } = req.body;
    const ai = getGenAI();

    const prompt = `
Anda adalah pembuat kuis pendidikan Indonesia untuk jenjang ${gradeLevel || "SMP"}.
Buatkan ${questionCount || 5} soal tipe ${questionType || "PG"} berdasarkan topik/materi berikut:
"""
${topicText || "Materi Umum Pendidikan"}
"""

Format jawaban WAJIB berupa JSON Array murni tanpa markdown formatting seperti:
[
  {
    "id": "q1",
    "question": "Pertanyaan...",
    "type": "${questionType === "Uraian" ? "Essay" : "PG"}",
    "options": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
    "correctAnswer": "Pilihan A (atau kunci jawaban esai)",
    "explanation": "Penjelasan singkat..."
  }
]
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let text = response.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const questions = JSON.parse(text);

    return res.status(200).json({ success: true, questions });
  } catch (error) {
    console.error("Cloud Function generateQuizProxy error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * HTTP Cloud Function: Semantic Auto-Grader for Essay Questions
 */
exports.gradeEssayProxy = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const { question, studentAnswer, keyAnswer, maxScore } = req.body;
    const ai = getGenAI();

    const prompt = `
Anda adalah penilai esai otomatis AI SekolahKu.
Pertanyaan: ${question}
Kunci Jawaban Resmi: ${keyAnswer}
Jawaban Siswa: ${studentAnswer}
Skor Maksimal: ${maxScore || 100}

Evaluasi pemahaman konsep secara semantik.
Berikan JSON murni:
{
  "score": number (0 hingga ${maxScore || 100}),
  "feedback": "Kritik dan saran konstruktif ringkas..."
}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let text = response.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(text);

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Cloud Function gradeEssayProxy error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
