export type UserRole = 'admin' | 'super_admin' | 'school_operator' | 'teacher' | 'student';

export type TeacherRoleType = 'Wali Kelas' | 'Guru Mapel';

export interface UserProfile {
  uid: string;
  name: string;
  username: string;
  email?: string;
  password?: string;
  role: UserRole;
  teacherRole?: TeacherRoleType;
  school_id?: string;
  school_name?: string;
  class_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface School {
  id: string;
  name: string;
  code: string;
  operator_username: string;
  operator_email: string;
  created_at: string;
}

export interface ClassRoom {
  id: string;
  code: string; // 6-digit Alphanumeric, e.g., C-8K9F2A
  name: string;
  subject: string;
  grade_level: string;
  teacher_id: string;
  teacher_name: string;
  school_id: string;
  student_ids: string[];
  created_at: string;
}

export interface MaterialItem {
  id: string;
  title: string;
  description: string;
  file_url: string;
  file_name: string;
  file_type: string;
  class_id: string;
  school_id: string;
  teacher_id: string;
  teacher_name: string;
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'PG' | 'Uraian';
  options?: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface QuizRoom {
  id: string;
  code: string; // 6-digit Alphanumeric/Numeric, e.g., Q-928104
  title: string;
  grade_level: string;
  question_type: 'PG' | 'Uraian' | 'Campuran';
  school_id: string;
  class_id?: string;
  teacher_id: string;
  teacher_name: string;
  status: 'lobby' | 'active' | 'finished';
  questions: QuizQuestion[];
  timer_per_question: number; // in seconds
  max_participants: number;
  lock_room: boolean;
  created_at: string;
}

export interface QuizParticipant {
  id: string;
  quiz_id: string;
  student_id: string;
  student_name: string;
  score: number;
  current_question_index: number;
  tab_switches: number;
  completed: boolean;
  answers: Record<string, { studentAnswer: string; isCorrect?: boolean; score?: number; feedback?: string }>;
  updated_at: string;
}

export interface QuizSummary {
  id: string;
  quiz_id: string;
  quiz_title: string;
  quiz_code: string;
  school_id: string;
  teacher_id: string;
  finished_at: string;
  participants: {
    student_id: string;
    student_name: string;
    score: number;
    tab_switches: number;
    completed: boolean;
  }[];
}

export interface RPPData {
  id: string;
  curriculum?: string;
  subject: string;
  grade: string;
  topic: string;
  duration: string;
  rppContent: string;
  lkpdContent: string;
  created_at: string;
}
