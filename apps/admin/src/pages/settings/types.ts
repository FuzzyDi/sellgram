export type NoticeTone = 'success' | 'error' | 'info';

// Shared by every tab — the toast notification stays owned by the
// Settings.tsx router (it can be triggered by any tab's async actions),
// so each tab receives it as a callback instead of managing its own copy.
export interface TabProps {
  onNotice: (tone: NoticeTone, message: string) => void;
}
