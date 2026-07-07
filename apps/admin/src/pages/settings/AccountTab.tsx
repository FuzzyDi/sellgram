import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { TabProps } from './types';

const PERM_LABELS: Record<string, { ru: string; uz: string }> = {
  manageCatalog:   { ru: 'Каталог',   uz: 'Katalog' },
  manageOrders:    { ru: 'Заказы',    uz: 'Buyurtmalar' },
  manageCustomers: { ru: 'Клиенты',   uz: 'Mijozlar' },
  manageMarketing: { ru: 'Рассылки',  uz: 'Xabarlar' },
  manageSettings:  { ru: 'Настройки', uz: 'Sozlamalar' },
  manageBilling:   { ru: 'Биллинг',   uz: 'Billing' },
  manageUsers:     { ru: 'Команда',   uz: 'Jamoa' },
  viewReports:     { ru: 'Отчёты',    uz: 'Hisobotlar' },
};

export default function AccountTab({ onNotice }: TabProps) {
  const { tr } = useAdminI18n();
  const [me, setMe] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingUser, setTogglingUser] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pendingResetUser, setPendingResetUser] = useState<string | null>(null);
  const [pendingResetPassword, setPendingResetPassword] = useState('');

  const [teamForm, setTeamForm] = useState({
    email: '',
    name: '',
    password: '',
    role: 'OPERATOR' as 'MANAGER' | 'OPERATOR' | 'MARKETER',
    permissions: {
      manageCatalog: true,
      manageOrders: true,
      manageCustomers: true,
      manageMarketing: false,
      manageSettings: false,
      manageBilling: false,
      manageUsers: false,
      viewReports: true,
    },
  });

  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const canManageUsers = me?.role === 'OWNER' || me?.role === 'MANAGER' || Boolean(me?.effectivePermissions?.manageUsers);
  const isOwner = me?.role === 'OWNER';

  async function load() {
    setLoading(true);
    try {
      const [meData, teamData] = await Promise.all([
        adminApi.me(),
        adminApi.getTeamUsers().catch(() => []),
      ]);
      setMe(meData || null);
      setProfileForm({ name: meData?.name || '', email: meData?.email || '' });
      setTeam(Array.isArray(teamData) ? teamData : []);
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка при загрузке настроек', 'Sozlamalarni yuklashda xato'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function deleteMyAccount() {
    if (deletingAccount || !deleteAccountPassword) return;
    setDeletingAccount(true);
    try {
      await adminApi.deleteAccount(deleteAccountPassword);
      // Log out and reload — server has deactivated all users
      localStorage.clear();
      window.location.href = '/login';
    } catch (err: any) {
      onNotice('error', err?.message === 'Invalid credentials' ? tr('Неверный пароль', "Parol noto'g'ri") : tr('Ошибка удаления', 'Xatolik'));
      setDeletingAccount(false);
    }
  }

  async function saveMyProfile() {
    if (saving) return;
    setSaving(true);
    try {
      await adminApi.updateMe(profileForm);
      onNotice('success', tr('Профиль сохранён', 'Profil saqlandi'));
      await load();
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function changeMyPassword() {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      onNotice('error', tr('Введите текущий и новый пароль', 'Joriy va yangi parolni kiriting'));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      onNotice('error', tr('Подтверждение пароля не совпадает', "Parol tasdig'i mos emas"));
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await adminApi.changeMyPassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      onNotice('success', tr('Пароль обновлён', 'Parol yangilandi'));
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function createTeamUser() {
    if (!canManageUsers || saving) return;
    setSaving(true);
    try {
      const payload: any = {
        email: teamForm.email,
        name: teamForm.name,
        password: teamForm.password,
        role: teamForm.role,
      };
      if (teamForm.role === 'OPERATOR' || teamForm.role === 'MARKETER') payload.permissions = teamForm.permissions;
      await adminApi.createTeamUser(payload);
      setTeamForm((s) => ({ ...s, email: '', name: '', password: '' }));
      onNotice('success', tr('Пользователь добавлен', "Foydalanuvchi qo'shildi"));
      await load();
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleTeamUserActive(user: any) {
    if (togglingUser) return;
    setTogglingUser(user.id);
    try {
      await adminApi.updateTeamUser(user.id, { isActive: !user.isActive });
      await load();
      onNotice('success', tr('Статус обновлён', 'Status yangilandi'));
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setTogglingUser(null);
    }
  }

  async function resetTeamUserPassword(userId: string) {
    if (!pendingResetPassword.trim() || saving) return;
    setSaving(true);
    try {
      await adminApi.resetTeamUserPassword(userId, pendingResetPassword);
      setPendingResetUser(null);
      setPendingResetPassword('');
      onNotice('success', tr('Пароль сброшен', 'Parol tiklandi'));
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div className="sg-card soft" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div className="sg-skeleton" style={{ height: 18, width: '40%' }} />
            <div className="sg-skeleton" style={{ height: 12, width: '60%', marginTop: 6 }} />
          </div>
          <div className="sg-skeleton" style={{ height: 36, width: 140, borderRadius: 10 }} />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="sg-grid" style={{ gap: 12 }}>
        <article className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Мой аккаунт', 'Mening akkauntim')}</h3>
          <div className="sg-grid cols-2" style={{ marginTop: 10 }}>
            <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Имя', 'Ism')} />
            <input value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder="Email" />
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void saveMyProfile()}>{saving ? '...' : tr('Сохранить профиль', 'Profilni saqlash')}</button>
          </div>
        </article>

        <article className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Смена пароля', 'Parolni almashtirish')}</h3>
          <div className="sg-grid cols-3" style={{ marginTop: 10 }}>
            <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Текущий пароль', 'Joriy parol')} />
            <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Новый пароль', 'Yangi parol')} />
            <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Подтвердите пароль', 'Parolni tasdiqlang')} />
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void changeMyPassword()}>{saving ? '...' : tr('Обновить пароль', 'Parolni yangilash')}</button>
          </div>
        </article>

        {canManageUsers && (
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Пользователи и роли', 'Foydalanuvchilar va rollar')}</h3>
            <p className="sg-subtitle">{tr('Добавляйте операторов и управляйте их правами.', "Operator qo'shing va ruxsatlarini boshqaring.")}</p>

            <div className="sg-card soft" style={{ marginTop: 10 }}>
              <div className="sg-grid cols-4" style={{ gap: 8 }}>
                <input value={teamForm.email} onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder="Email" />
                <input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Имя', 'Ism')} />
                <input type="password" value={teamForm.password} onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Пароль', 'Parol')} />
                <select value={teamForm.role} onChange={(e) => setTeamForm({ ...teamForm, role: e.target.value as 'MANAGER' | 'OPERATOR' | 'MARKETER' })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}>
                  <option value="OPERATOR">Operator</option>
                  <option value="MARKETER">Marketer</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </div>

              {(teamForm.role === 'OPERATOR' || teamForm.role === 'MARKETER') && (
                <div className="sg-grid cols-4" style={{ marginTop: 10, gap: 8 }}>
                  {Object.keys(teamForm.permissions).map((key) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <input type="checkbox" checked={(teamForm.permissions as any)[key]} onChange={(e) => setTeamForm({ ...teamForm, permissions: { ...teamForm.permissions, [key]: e.target.checked } })} />
                      {tr(PERM_LABELS[key]?.ru ?? key, PERM_LABELS[key]?.uz ?? key)}
                    </label>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <button className="sg-btn primary" type="button" disabled={saving || !teamForm.email || !teamForm.name || !teamForm.password} onClick={() => void createTeamUser()}>{saving ? '...' : tr('Добавить пользователя', "Foydalanuvchi qo'shish")}</button>
              </div>
            </div>

            <div className="sg-grid" style={{ gap: 8, marginTop: 10 }}>
              {team.map((user) => (
                <div key={user.id} className="sg-card soft" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{user.name} ({user.email})</div>
                      <div style={{ fontSize: 12, color: '#6b7a71' }}>{user.role} • {user.isActive ? tr('активен', 'faol') : tr('отключен', "o'chirilgan")}</div>
                    </div>
                    {user.role !== 'OWNER' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="sg-btn ghost" type="button" disabled={togglingUser === user.id} onClick={() => void toggleTeamUserActive(user)}>{togglingUser === user.id ? '...' : user.isActive ? tr('Отключить', "O'chirish") : tr('Включить', 'Yoqish')}</button>
                        <button className="sg-btn ghost" type="button" onClick={() => { setPendingResetUser(user.id); setPendingResetPassword(''); }}>
                          {tr('Сброс пароля', 'Parolni tiklash')}
                        </button>
                      </div>
                    )}
                  </div>
                  {pendingResetUser === user.id && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="password"
                        autoFocus
                        value={pendingResetPassword}
                        onChange={(e) => setPendingResetPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void resetTeamUserPassword(user.id)}
                        placeholder={tr('Новый пароль', 'Yangi parol')}
                        style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '7px 10px', fontSize: 13, flex: 1, minWidth: 160 }}
                      />
                      <button className="sg-btn primary" type="button" style={{ padding: '7px 14px', fontSize: 13 }} disabled={!pendingResetPassword.trim() || saving} onClick={() => void resetTeamUserPassword(user.id)}>
                        {saving ? '...' : tr('Сохранить', 'Saqlash')}
                      </button>
                      <button className="sg-btn ghost" type="button" style={{ padding: '7px 12px', fontSize: 13 }} onClick={() => { setPendingResetUser(null); setPendingResetPassword(''); }}>
                        {tr('Отмена', 'Bekor')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </article>
        )}

        {isOwner && (
          <article className="sg-card" style={{ border: '1px solid #fecaca' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{tr('Опасная зона', 'Xavfli zona')}</h3>
            <p className="sg-subtitle" style={{ marginTop: 6 }}>
              {tr('Удаление аккаунта отключит все магазины и боты. Данные будут окончательно удалены через 30 дней.',
                  "Akkauntni o'chirish barcha do'kon va botlarni o'chiradi. Ma'lumotlar 30 kundan so'ng butunlay o'chiriladi.")}
            </p>
            <button
              className="sg-btn"
              type="button"
              style={{ marginTop: 10, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 700 }}
              onClick={() => { setShowDeleteAccountModal(true); setDeleteAccountPassword(''); }}
            >
              {tr('Удалить аккаунт', "Akkauntni o'chirish")}
            </button>
          </article>
        )}
      </section>

      {showDeleteAccountModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', color: '#dc2626', fontWeight: 800 }}>{tr('Подтвердите удаление', "O'chirishni tasdiqlang")}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#374151' }}>
              {tr('Это действие нельзя отменить. Все магазины, товары и заказы будут удалены. Введите пароль для подтверждения.',
                  "Bu amalni bekor qilib bo'lmaydi. Barcha do'kon, mahsulot va buyurtmalar o'chiriladi. Tasdiqlash uchun parolni kiriting.")}
            </p>
            <input
              type="password"
              autoFocus
              value={deleteAccountPassword}
              onChange={(e) => setDeleteAccountPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void deleteMyAccount()}
              placeholder={tr('Ваш пароль', 'Parolingiz')}
              style={{ width: '100%', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 14, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="sg-btn"
                type="button"
                style={{ flex: 1, background: '#dc2626', color: '#fff', fontWeight: 700 }}
                disabled={!deleteAccountPassword || deletingAccount}
                onClick={() => void deleteMyAccount()}
              >
                {deletingAccount ? '...' : tr('Удалить навсегда', "Butunlay o'chirish")}
              </button>
              <button
                className="sg-btn ghost"
                type="button"
                onClick={() => setShowDeleteAccountModal(false)}
                disabled={deletingAccount}
              >
                {tr('Отмена', 'Bekor')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
