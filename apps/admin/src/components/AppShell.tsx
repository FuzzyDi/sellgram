import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

// Layout wrapper (docs/ADMIN_REDESIGN.md §7 Phase 2) — fixed-width Sidebar
// left, persistent TopBar top, routed page content in the remaining
// space. Plain flexbox, no external layout library. Existing page
// internals (Products.tsx, Settings.tsx, etc.) render unchanged inside
// <main> — "new chrome, old content" is the deliberate, temporary Phase 2
// state; Phase 3 migrates page internals incrementally.
interface AppShellProps {
  tenantName?: string;
  userName?: string;
  userEmail?: string;
  permissions: Record<string, boolean>;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function AppShell({
  tenantName, userName, userEmail, permissions, onLogout, children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Same behavior the old inline Sidebar had: close the mobile drawer on
  // every route change instead of leaving it open over the new page.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-neutral-50">
      {mobileOpen && (
        <div className="sg-sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <Sidebar
        tenantName={tenantName}
        permissions={permissions}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          userName={userName}
          userEmail={userEmail}
          onLogout={onLogout}
          onOpenMobileSidebar={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
