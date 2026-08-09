import React, { useState } from 'react';
import { UserProfile } from '../../types';
import { LogOut, GraduationCap, School, KeyRound, Swords, Trophy, Sparkles } from 'lucide-react';
import { ChangePasswordModal } from './ChangePasswordModal';

interface HeaderProps {
  user: UserProfile;
  onLogout: () => void;
  onQuickJoinRoom?: (roomCode: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  const [isChangePwOpen, setIsChangePwOpen] = useState(false);

  const getRoleBadge = () => {
    switch (user.role) {
      case 'admin':
      case 'super_admin':
        return { label: 'Admin', bg: 'bg-rose-100 text-rose-700 border-rose-200' };
      case 'school_operator':
        return { label: 'Operator Sekolah', bg: 'bg-amber-100 text-amber-700 border-amber-200' };
      case 'teacher':
        return { label: `Guru (${user.teacherRole || 'Mapel'})`, bg: 'bg-blue-100 text-blue-700 border-blue-200' };
      case 'student':
        return { label: 'Siswa', bg: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
      default:
        return { label: user.role, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const badge = getRoleBadge();

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand & Logo */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
              <GraduationCap className="w-5 h-5 text-white" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-slate-950 shadow-sm border border-white">
                <Trophy className="w-3 h-3 font-bold" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-black text-slate-900 text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-700">KelasArena</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100/80">SaaS</span>
              </div>
              {user.school_name && (
                <p className="text-xs text-slate-500 font-medium truncate max-w-[180px] sm:max-w-xs flex items-center gap-1">
                  <School className="w-3 h-3 text-slate-400" /> {user.school_name}
                </p>
              )}
            </div>
          </div>

          {/* User Profile, Ganti Password & Logout */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <div className="hidden md:flex flex-col items-end text-right mr-1">
              <span className="text-sm font-bold text-slate-800 leading-tight">{user.name}</span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${badge.bg}`}>
                {badge.label}
              </span>
            </div>

            <button
              onClick={() => setIsChangePwOpen(true)}
              className="flex items-center space-x-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl border border-blue-200 transition-all"
              title="Ganti Password Akun Saya"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ganti Password</span>
            </button>

            <button
              onClick={onLogout}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-semibold rounded-xl border border-slate-200 hover:border-rose-200 transition-all"
              title="Keluar dari Akun"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Self Password Change Modal */}
      <ChangePasswordModal
        isOpen={isChangePwOpen}
        onClose={() => setIsChangePwOpen(false)}
        targetUid={user.uid}
        targetName={user.name}
        isSelf={true}
      />
    </>
  );
};

