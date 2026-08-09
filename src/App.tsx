/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserProfile } from './types';
import { Header } from './components/common/Header';
import { UnifiedLogin } from './components/auth/UnifiedLogin';
import { SuperAdminDashboard } from './components/dashboard/SuperAdminDashboard';
import { SchoolOperatorDashboard } from './components/dashboard/SchoolOperatorDashboard';
import { TeacherDashboard } from './components/dashboard/TeacherDashboard';
import { StudentDashboard } from './components/dashboard/StudentDashboard';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('kelasarena_logged_user'); // || localStorage.getItem('sekolahku_logged_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('kelasarena_logged_user', JSON.stringify(user));
    } catch (e) {
      console.warn('Failed to save session to localStorage:', e);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('kelasarena_logged_user');
      // localStorage.removeItem('sekolahku_logged_user');
    } catch (e) {
      console.warn('Failed to clear session:', e);
    }
  };

  if (!currentUser) {
    return <UnifiedLogin onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Standard Header */}
      <Header
        user={currentUser}
        onLogout={handleLogout}
      />

      <main className="pb-12">
        {(currentUser.role === 'admin' || currentUser.role === 'super_admin') && <SuperAdminDashboard user={currentUser} />}
        {currentUser.role === 'school_operator' && <SchoolOperatorDashboard user={currentUser} />}
        {currentUser.role === 'teacher' && <TeacherDashboard user={currentUser} />}
        {currentUser.role === 'student' && <StudentDashboard user={currentUser} />}
      </main>
    </div>
  );
}
