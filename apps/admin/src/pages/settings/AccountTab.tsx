import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge from '../../components/Badge';
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
      <Card className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="h-5 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse" />
          <div className="h-3 w-3/5 rounded-token-sm bg-neutral-100 animate-pulse mt-1.5" />
        </div>
        <div className="h-9 w-36 rounded-token-md bg-neutral-100 animate-pulse" />
      </Card>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        <Card>
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Мой аккаунт', 'Mening akkauntim')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder={tr('Имя', 'Ism')} />
            <Input value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="Email" />
          </div>
          <div className="mt-3">
            <Button variant="primary" size="md" type="button" disabled={saving} onClick={() => void saveMyProfile()}>{saving ? '...' : tr('Сохранить профиль', 'Profilni saqlash')}</Button>
          </div>
        </Card>

        <Card>
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Смена пароля', 'Parolni almashtirish')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <Input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} placeholder={tr('Текущий пароль', 'Joriy parol')} />
            <Input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder={tr('Новый пароль', 'Yangi parol')} />
            <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} placeholder={tr('Подтвердите пароль', 'Parolni tasdiqlang')} />
          </div>
          <div className="mt-3">
            <Button variant="primary" size="md" type="button" disabled={saving} onClick={() => void changeMyPassword()}>{saving ? '...' : tr('Обновить пароль', 'Parolni yangilash')}</Button>
          </div>
        </Card>

        {canManageUsers && (
          <Card>
            <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Пользователи и роли', 'Foydalanuvchilar va rollar')}</h3>
            <p className="text-token-sm text-neutral-500">{tr('Добавляйте операторов и управляйте их правами.', "Operator qo'shing va ruxsatlarini boshqaring.")}</p>

            <Card className="bg-neutral-50 mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                <Input value={teamForm.email} onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })} placeholder="Email" />
                <Input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} placeholder={tr('Имя', 'Ism')} />
                <Input type="password" value={teamForm.password} onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })} placeholder={tr('Пароль', 'Parol')} />
                <Select value={teamForm.role} onChange={(e) => setTeamForm({ ...teamForm, role: e.target.value as 'MANAGER' | 'OPERATOR' | 'MARKETER' })}>
                  <option value="OPERATOR">Operator</option>
                  <option value="MARKETER">Marketer</option>
                  <option value="MANAGER">Manager</option>
                </Select>
              </div>

              {(teamForm.role === 'OPERATOR' || teamForm.role === 'MARKETER') && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  {Object.keys(teamForm.permissions).map((key) => (
                    <label key={key} className="flex items-center gap-2 text-token-xs text-neutral-700">
                      <input type="checkbox" className="h-4 w-4 accent-accent-600" checked={(teamForm.permissions as any)[key]} onChange={(e) => setTeamForm({ ...teamForm, permissions: { ...teamForm.permissions, [key]: e.target.checked } })} />
                      {tr(PERM_LABELS[key]?.ru ?? key, PERM_LABELS[key]?.uz ?? key)}
                    </label>
                  ))}
                </div>
              )}

              <div className="mt-3">
                <Button variant="primary" size="md" type="button" disabled={saving || !teamForm.email || !teamForm.name || !teamForm.password} onClick={() => void createTeamUser()}>{saving ? '...' : tr('Добавить пользователя', "Foydalanuvchi qo'shish")}</Button>
              </div>
            </Card>

            <div className="flex flex-col gap-2 mt-3">
              {team.map((user) => (
                <Card key={user.id} className="bg-neutral-50" style={{ padding: 10 }}>
                  <div className="flex items-center justify-between gap-2.5 flex-wrap">
                    <div>
                      <div className="font-semibold text-neutral-800">{user.name} ({user.email})</div>
                      <div className="flex items-center gap-1.5 mt-1 text-token-xs text-neutral-500">
                        <span>{user.role}</span>
                        <Badge variant={user.isActive ? 'success' : 'neutral'}>
                          {user.isActive ? tr('активен', 'faol') : tr('отключен', "o'chirilgan")}
                        </Badge>
                      </div>
                    </div>
                    {user.role !== 'OWNER' && (
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" type="button" disabled={togglingUser === user.id} onClick={() => void toggleTeamUserActive(user)}>{togglingUser === user.id ? '...' : user.isActive ? tr('Отключить', "O'chirish") : tr('Включить', 'Yoqish')}</Button>
                        <Button variant="ghost" size="sm" type="button" onClick={() => { setPendingResetUser(user.id); setPendingResetPassword(''); }}>
                          {tr('Сброс пароля', 'Parolni tiklash')}
                        </Button>
                      </div>
                    )}
                  </div>
                  {pendingResetUser === user.id && (
                    <div className="flex gap-2 mt-3 items-center flex-wrap">
                      <input
                        type="password"
                        autoFocus
                        value={pendingResetPassword}
                        onChange={(e) => setPendingResetPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void resetTeamUserPassword(user.id)}
                        placeholder={tr('Новый пароль', 'Yangi parol')}
                        className="flex-1 min-w-[160px] rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
                      />
                      <Button variant="primary" size="sm" type="button" disabled={!pendingResetPassword.trim() || saving} onClick={() => void resetTeamUserPassword(user.id)}>
                        {saving ? '...' : tr('Сохранить', 'Saqlash')}
                      </Button>
                      <Button variant="ghost" size="sm" type="button" onClick={() => { setPendingResetUser(null); setPendingResetPassword(''); }}>
                        {tr('Отмена', 'Bekor')}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </Card>
        )}

        {isOwner && (
          <Card className="border-danger/30">
            <h3 className="m-0 text-token-lg font-semibold text-danger">{tr('Опасная зона', 'Xavfli zona')}</h3>
            <p className="mt-1.5 text-token-sm text-neutral-500">
              {tr('Удаление аккаунта отключит все магазины и боты. Данные будут окончательно удалены через 30 дней.',
                  "Akkauntni o'chirish barcha do'kon va botlarni o'chiradi. Ma'lumotlar 30 kundan so'ng butunlay o'chiriladi.")}
            </p>
            <div className="mt-3">
              <Button
                variant="danger"
                size="md"
                type="button"
                onClick={() => { setShowDeleteAccountModal(true); setDeleteAccountPassword(''); }}
              >
                {tr('Удалить аккаунт', "Akkauntni o'chirish")}
              </Button>
            </div>
          </Card>
        )}
      </section>

      {showDeleteAccountModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <Card className="max-w-[420px] w-full border-danger/30">
            <h3 className="m-0 mb-2 text-token-lg font-semibold text-danger">{tr('Подтвердите удаление', "O'chirishni tasdiqlang")}</h3>
            <p className="m-0 mb-4 text-token-sm text-neutral-600">
              {tr('Это действие нельзя отменить. Все магазины, товары и заказы будут удалены. Введите пароль для подтверждения.',
                  "Bu amalni bekor qilib bo'lmaydi. Barcha do'kon, mahsulot va buyurtmalar o'chiriladi. Tasdiqlash uchun parolni kiriting.")}
            </p>
            <Input
              type="password"
              autoFocus
              value={deleteAccountPassword}
              onChange={(e) => setDeleteAccountPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void deleteMyAccount()}
              placeholder={tr('Ваш пароль', 'Parolingiz')}
              className="mb-1"
            />
            <div className="flex gap-2.5 mt-3">
              <Button
                variant="danger"
                size="md"
                type="button"
                className="flex-1"
                disabled={!deleteAccountPassword || deletingAccount}
                onClick={() => void deleteMyAccount()}
              >
                {deletingAccount ? '...' : tr('Удалить навсегда', "Butunlay o'chirish")}
              </Button>
              <Button
                variant="ghost"
                size="md"
                type="button"
                onClick={() => setShowDeleteAccountModal(false)}
                disabled={deletingAccount}
              >
                {tr('Отмена', 'Bekor')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
