import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type NoticeTone = 'success' | 'error' | 'info';

export default function Settings() {
  const { tr, locale } = useAdminI18n();
  const [tab, setTab] = useState<'stores' | 'zones' | 'loyalty' | 'account' | 'api' | 'webhooks' | 'crm'>('stores');
  const [stores, setStores] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  const [pendingDeleteStore, setPendingDeleteStore] = useState<string | null>(null);
  const [pendingDeleteZone, setPendingDeleteZone] = useState<string | null>(null);
  const [pendingResetUser, setPendingResetUser] = useState<string | null>(null);
  const [pendingResetPassword, setPendingResetPassword] = useState('');

  const [telegramLinkData, setTelegramLinkData] = useState<any | null>(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [togglingUser, setTogglingUser] = useState<string | null>(null);

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

  const [showStoreForm, setShowStoreForm] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [storeForm, setStoreForm] = useState({ name: '', botToken: '', welcomeMessage: '' });

  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: '', price: '', freeFrom: '', storeId: '' });
  const [me, setMe] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [apiKeyForm, setApiKeyForm] = useState({ name: '', expiresAt: '' });
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);

  const ALL_EVENTS = ['order.created', 'order.status_changed', 'order.paid', 'customer.created'];
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhookForm, setWebhookForm] = useState({ url: '', events: ['order.created', 'order.status_changed', 'order.paid', 'customer.created'] as string[] });

  // Account deletion
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // CRM tab
  const [crmUrl, setCrmUrl] = useState('');
  const [crmSaving, setCrmSaving] = useState(false);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [pendingDeleteWebhook, setPendingDeleteWebhook] = useState<string | null>(null);

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

  async function load() {
    setLoading(true);
    try {
      const [storeList, zoneList, loyaltyConfig, meData, teamData, keyList, hookList] = await Promise.all([
        adminApi.getStores(),
        adminApi.getDeliveryZones(),
        adminApi.getLoyaltyConfig(),
        adminApi.me(),
        adminApi.getTeamUsers().catch(() => []),
        adminApi.getApiKeys().catch(() => []),
        adminApi.getWebhooks().catch(() => []),
      ]);
      setStores(Array.isArray(storeList) ? storeList : []);
      setZones(Array.isArray(zoneList) ? zoneList : []);
      setLoyalty(loyaltyConfig);
      setMe(meData || null);
      setProfileForm({
        name: meData?.name || '',
        email: meData?.email || '',
      });
      setTeam(Array.isArray(teamData) ? teamData : []);
      setApiKeys(Array.isArray(keyList) ? keyList : []);
      setWebhooks(Array.isArray(hookList) ? hookList : []);
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a', 'Sozlamalarni yuklashda xato'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }
  const canManageUsers = me?.role === 'OWNER' || me?.role === 'MANAGER' || Boolean(me?.effectivePermissions?.manageUsers);
  const isOwner = me?.role === 'OWNER';

  async function deleteMyAccount() {
    if (deletingAccount || !deleteAccountPassword) return;
    setDeletingAccount(true);
    try {
      await adminApi.deleteAccount(deleteAccountPassword);
      // Log out and reload — server has deactivated all users
      localStorage.clear();
      window.location.href = '/login';
    } catch (err: any) {
      showNotice('error', err?.message === 'Invalid credentials' ? tr('Неверный пароль', 'Parol noto\'g\'ri') : tr('Ошибка удаления', 'Xatolik'));
      setDeletingAccount(false);
    }
  }

  async function saveMyProfile() {
    if (saving) return;
    setSaving(true);
    try {
      await adminApi.updateMe(profileForm);
      showNotice('success', tr('\u041f\u0440\u043e\u0444\u0438\u043b\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d', 'Profil saqlandi'));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function changeMyPassword() {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      showNotice('error', tr('Введите текущий и новый пароль', 'Joriy va yangi parolni kiriting'));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showNotice('error', tr('\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u043f\u0430\u0440\u043e\u043b\u044f \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442', 'Parol tasdig\'i mos emas'));
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await adminApi.changeMyPassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showNotice('success', tr('\u041f\u0430\u0440\u043e\u043b\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d', 'Parol yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
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
      showNotice('success', tr('\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d', "Foydalanuvchi qo'shildi"));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
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
      showNotice('success', tr('\u0421\u0442\u0430\u0442\u0443\u0441 \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d', 'Status yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
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
      showNotice('success', tr('\u041f\u0430\u0440\u043e\u043b\u044c \u0441\u0431\u0440\u043e\u0448\u0435\u043d', 'Parol tiklandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }


  async function generateTelegramLinkCode() {
    setTelegramLinkLoading(true);
    try {
      const data = await adminApi.createTelegramLinkCode();
      setTelegramLinkData(data);
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    } finally {
      setTelegramLinkLoading(false);
    }
  }

  async function createApiKey() {
    if (!apiKeyForm.name.trim() || saving) return;
    setSaving(true);
    try {
      const payload: any = { name: apiKeyForm.name.trim() };
      if (apiKeyForm.expiresAt) payload.expiresAt = new Date(apiKeyForm.expiresAt).toISOString();
      const data = await adminApi.createApiKey(payload);
      setNewKeySecret(data.key);
      setApiKeyForm({ name: '', expiresAt: '' });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function revokeApiKey(id: string) {
    setPendingDeleteKey(null);
    try {
      await adminApi.revokeApiKey(id);
      await load();
      showNotice('success', tr('Ключ отозван', 'Kalit bekor qilindi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function createWebhook() {
    if (!webhookForm.url.trim() || webhookForm.events.length === 0 || saving) return;
    setSaving(true);
    try {
      const data = await adminApi.createWebhook({ url: webhookForm.url.trim(), events: webhookForm.events });
      setNewWebhookSecret(data.secret);
      setWebhookForm({ url: '', events: ['order.created', 'order.status_changed', 'order.paid', 'customer.created'] });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleWebhook(hook: any) {
    try {
      await adminApi.updateWebhook(hook.id, { isActive: !hook.isActive });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function deleteWebhook(id: string) {
    setPendingDeleteWebhook(null);
    try {
      await adminApi.deleteWebhook(id);
      await load();
      showNotice('success', tr('Вебхук удалён', 'Webhook o\'chirildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  function openCreateStore() {
    setEditingStoreId(null);
    setStoreForm({ name: '', botToken: '', welcomeMessage: '' });
    setShowStoreForm(true);
  }

  function openEditStore(store: any) {
    setEditingStoreId(store.id);
    setStoreForm({ name: store.name || '', botToken: '', welcomeMessage: store.welcomeMessage || '' });
    setShowStoreForm(true);
  }

  async function saveStore() {
    if (saving) return;
    if (!editingStoreId && (!storeForm.name || !storeForm.botToken)) {
      showNotice('error', tr('\u041d\u0443\u0436\u043d\u044b \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 \u0438 bot token', "Do'kon nomi va bot token kerak"));
      return;
    }
    setSaving(true);
    try {
      if (editingStoreId) {
        const payload: any = {
          name: storeForm.name,
          welcomeMessage: storeForm.welcomeMessage,
        };
        if (storeForm.botToken) payload.botToken = storeForm.botToken;
        await adminApi.updateStore(editingStoreId, payload);
      } else {
        await adminApi.createStore(storeForm);
      }
      setShowStoreForm(false);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  function openCreateZone() {
    setEditingZoneId(null);
    setZoneForm({ name: '', price: '', freeFrom: '', storeId: stores[0]?.id || '' });
    setShowZoneForm(true);
  }

  function openEditZone(zone: any) {
    setEditingZoneId(zone.id);
    setZoneForm({
      name: zone.name || '',
      price: String(zone.price || ''),
      freeFrom: zone.freeFrom ? String(zone.freeFrom) : '',
      storeId: zone.storeId || '',
    });
    setShowZoneForm(true);
  }

  async function saveZone() {
    if (saving) return;
    setSaving(true);
    try {
      const payload: any = {
        name: zoneForm.name,
        price: Number(zoneForm.price),
        freeFrom: zoneForm.freeFrom ? Number(zoneForm.freeFrom) : null,
      };
      if (editingZoneId) {
        await adminApi.updateDeliveryZone(editingZoneId, payload);
      } else {
        await adminApi.createDeliveryZone({ ...payload, storeId: zoneForm.storeId || stores[0]?.id });
      }
      setShowZoneForm(false);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(id: string) {
    setPendingDeleteZone(null);
    try {
      await adminApi.deleteDeliveryZone(id);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    }
  }

  async function deleteStore(id: string) {
    setPendingDeleteStore(null);
    try {
      await adminApi.deleteStore(id);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    }
  }

  async function checkStoreConnection(store: any) {
    try {
      const data = await adminApi.checkStoreBot(store.id);
      const ok = Boolean(data?.ok);
      const webhook = data?.webhook;
      const mismatch = webhook?.matchesExpected === false;

      const parts = [
        ok
          ? tr(`\u0411\u043e\u0442 "${store.name}" \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0451\u043d \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u043e.`, `"${store.name}" boti to'g'ri ulangan.`)
          : tr(`\u0411\u043e\u0442 "${store.name}" \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d, \u043d\u0430\u0439\u0434\u0435\u043d\u044b \u043f\u0440\u043e\u0431\u043b\u0435\u043c\u044b.`, `"${store.name}" botida muammo topildi.`),
      ];

      if (data?.bot?.username) parts.push(`@${data.bot.username}`);
      if (mismatch && webhook?.expectedUrl) {
        parts.push(tr('Webhook \u043e\u0442\u043b\u0438\u0447\u0430\u0435\u0442\u0441\u044f \u043e\u0442 \u043e\u0436\u0438\u0434\u0430\u0435\u043c\u043e\u0433\u043e.', 'Webhook kutilgan manzilga mos emas.'));
      }
      if (typeof webhook?.pendingUpdateCount === 'number') {
        parts.push(tr(`Pending updates: ${webhook.pendingUpdateCount}`, `Kutilayotgan update: ${webhook.pendingUpdateCount}`));
      }
      if (data?.error) parts.push(String(data.error));

      showNotice(ok ? 'success' : 'error', parts.join(' | '));
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    }
  }

  async function activateStoreConnection(store: any) {
    if (activating) return;
    setActivating(store.id);
    try {
      const data = await adminApi.activateStore(store.id);
      const webhookUrl = data?.webhookUrl ? `\nWebhook: ${data.webhookUrl}` : '';
      showNotice('success', tr(`\u0411\u043e\u0442 "${store.name}" \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0451\u043d \u0443\u0441\u043f\u0435\u0448\u043d\u043e.${webhookUrl}`, `"${store.name}" boti muvaffaqiyatli ulandi.${webhookUrl}`));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    } finally {
      setActivating(null);
    }
  }

  async function saveLoyalty() {
    if (saving) return;
    setSaving(true);
    try {
      await adminApi.updateLoyaltyConfig(loyalty);
      showNotice('success', tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e', 'Saqlandi'));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  const noticeNode = notice ? (
    <div
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 70,
        minWidth: 280,
        maxWidth: 440,
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 14,
        fontWeight: 700,
        boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
        color: notice.tone === 'error' ? '#991b1b' : notice.tone === 'success' ? '#065f46' : '#1e3a8a',
        background: notice.tone === 'error' ? '#fee2e2' : notice.tone === 'success' ? '#d1fae5' : '#dbeafe',
        border: `1px solid ${notice.tone === 'error' ? '#fecaca' : notice.tone === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
      }}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div>
          <div className="sg-skeleton" style={{ height: 28, width: '30%' }} />
          <div className="sg-skeleton" style={{ height: 14, width: '55%', marginTop: 8 }} />
        </div>
        <div className="sg-card soft" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div className="sg-skeleton" style={{ height: 18, width: '40%' }} />
            <div className="sg-skeleton" style={{ height: 12, width: '60%', marginTop: 6 }} />
          </div>
          <div className="sg-skeleton" style={{ height: 36, width: 140, borderRadius: 10 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="sg-skeleton" style={{ height: 34, width: 100, borderRadius: 999 }} />
          ))}
        </div>
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #edf2ee' }}>
              <div style={{ flex: 1 }}>
                <div className="sg-skeleton" style={{ height: 16, width: '40%' }} />
                <div className="sg-skeleton" style={{ height: 12, width: '25%', marginTop: 6 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="sg-skeleton" style={{ height: 32, width: 90, borderRadius: 8 }} />
                <div className="sg-skeleton" style={{ height: 32, width: 90, borderRadius: 8 }} />
                <div className="sg-skeleton" style={{ height: 32, width: 80, borderRadius: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}
      <header>
        <h2 className="sg-title">{tr('\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438', 'Sozlamalar')}</h2>
        <p className="sg-subtitle">{tr('\u041c\u0430\u0433\u0430\u0437\u0438\u043d\u044b, \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0430, \u043b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0438 Telegram-\u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0430', "Do'konlar, yetkazib berish, loyallik va Telegram bog'lash")}</p>
      </header>

      <div className="sg-card soft">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800 }}>{tr('\u041f\u0440\u0438\u0432\u044f\u0437\u043a\u0430 Telegram-\u0430\u0434\u043c\u0438\u043d\u0430', 'Telegram adminini bog\'lash')}</p>
            <p className="sg-subtitle" style={{ marginTop: 4 }}>
              {tr('\u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u043a\u043e\u0434 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u0431\u043e\u0442\u0443: /admin CODE', 'Kod yarating va botga yuboring: /admin CODE')}
            </p>
          </div>
          <button className="sg-btn primary" type="button" onClick={generateTelegramLinkCode}>
            {telegramLinkLoading ? tr('\u0413\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u0442\u0441\u044f...', 'Yaratilmoqda...') : tr('\u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043a\u043e\u0434', 'Kod yaratish')}
          </button>
        </div>

        {telegramLinkData && (
          <div className="sg-card" style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              {tr('\u041a\u043e\u0434', 'Kod')}: <b style={{ fontFamily: 'monospace' }}>{telegramLinkData.code}</b>
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('\u0421\u0440\u043e\u043a \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'Amal qilish muddati')}: {new Date(telegramLinkData.expiresAt).toLocaleString(locale)}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('\u041a\u043e\u043c\u0430\u043d\u0434\u0430', 'Buyruq')}: <span style={{ fontFamily: 'monospace' }}>{telegramLinkData.command}</span>
            </p>
          </div>
        )}
      </div>

      <div className="sg-pill-row">
        <button className={`sg-pill ${tab === 'stores' ? 'active' : ''}`} type="button" onClick={() => setTab('stores')}>
          {tr('\u041c\u0430\u0433\u0430\u0437\u0438\u043d\u044b', 'Do\'konlar')}
        </button>
        <button className={`sg-pill ${tab === 'zones' ? 'active' : ''}`} type="button" onClick={() => setTab('zones')}>
          {tr('\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430', 'Yetkazib berish')}
        </button>
        <button className={`sg-pill ${tab === 'loyalty' ? 'active' : ''}`} type="button" onClick={() => setTab('loyalty')}>
          {tr('\u041b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u044c', 'Loyallik')}
        </button>
        <button className={`sg-pill ${tab === 'account' ? 'active' : ''}`} type="button" onClick={() => setTab('account')}>
          {tr('\u0410\u043a\u043a\u0430\u0443\u043d\u0442', 'Akkaunt')}
        </button>
        <button className={`sg-pill ${tab === 'api' ? 'active' : ''}`} type="button" onClick={() => setTab('api')}>
          {tr('API', 'API')}
        </button>
        <button className={`sg-pill ${tab === 'webhooks' ? 'active' : ''}`} type="button" onClick={() => setTab('webhooks' as any)}>
          {tr('Webhooks', 'Webhooks')}
        </button>
        <button className={`sg-pill ${tab === 'crm' ? 'active' : ''}`} type="button" onClick={() => setTab('crm' as any)}>
          {tr('CRM', 'CRM')}
        </button>
      </div>

      {tab === 'stores' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p className="sg-subtitle" style={{ margin: 0 }}>
              {tr('\u041e\u0434\u0438\u043d \u043c\u0430\u0433\u0430\u0437\u0438\u043d = \u043e\u0434\u0438\u043d Telegram-\u0431\u043e\u0442', 'Bitta do\'kon = bitta Telegram bot')}
            </p>
            <button className="sg-btn primary" type="button" onClick={openCreateStore}>
              + {tr('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Do\'kon')}
            </button>
          </div>

          {stores.map((store) => {
            const isConfirming = pendingDeleteStore === store.id;
            return (
              <article key={store.id} className="sg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 800 }}>{store.name}</p>
                  {store.botUsername && <p style={{ margin: '4px 0 0', color: '#2e7d64', fontSize: 13 }}>@{store.botUsername}</p>}
                </div>
                {isConfirming ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                      {tr('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d?', "Do'konni o'chirish?")}
                    </span>
                    <button className="sg-btn danger" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => void deleteStore(store.id)}>
                      {tr('\u0414\u0430', 'Ha')}
                    </button>
                    <button className="sg-btn ghost" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setPendingDeleteStore(null)}>
                      {tr('\u041e\u0442\u043c\u0435\u043d\u0430', 'Bekor')}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="sg-btn ghost" type="button" onClick={() => openEditStore(store)}>
                      {tr('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c', 'Tahrirlash')}
                    </button>
                    <button className="sg-btn ghost" type="button" onClick={() => checkStoreConnection(store)}>
                      {tr('\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0431\u043e\u0442\u0430', 'Botni tekshirish')}
                    </button>
                    <button className="sg-btn primary" type="button" disabled={!!activating} onClick={() => void activateStoreConnection(store)}>
                      {activating === store.id ? '...' : tr('\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c', 'Ulash')}
                    </button>
                    <button
                      className="sg-btn danger"
                      type="button"
                      disabled={stores.length <= 1}
                      title={stores.length <= 1 ? tr('\u041d\u0435\u043b\u044c\u0437\u044f \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u043c\u0430\u0433\u0430\u0437\u0438\u043d', 'Oxirgi do\'konni o\'chirib bo\'lmaydi') : undefined}
                      onClick={() => setPendingDeleteStore(store.id)}
                    >
                      {tr('\u0423\u0434\u0430\u043b\u0438\u0442\u044c', 'O\'chirish')}
                    </button>
                  </div>
                )}
              </article>
            );
          })}

          {stores.length === 0 && <p className="sg-subtitle">{tr('\u041f\u043e\u043a\u0430 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u043e\u0432 \u043d\u0435\u0442', 'Hozircha do\'konlar yo\'q')}</p>}
        </section>
      )}

      {tab === 'zones' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p className="sg-subtitle" style={{ margin: 0 }}>
              {tr('\u0417\u043e\u043d\u044b \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438 \u0438 \u0442\u0430\u0440\u0438\u0444\u044b', 'Yetkazib berish hududlari va tariflar')}
            </p>
            <button className="sg-btn primary" type="button" onClick={openCreateZone}>
              + {tr('\u0417\u043e\u043d\u0430', 'Hudud')}
            </button>
          </div>

          <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="sg-table">
              <thead>
                <tr>
                  <th>{tr('\u0417\u043e\u043d\u0430', 'Hudud')}</th>
                  <th>{tr('\u0426\u0435\u043d\u0430', 'Narx')}</th>
                  <th>{tr('\u0411\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u044b\u0439 \u043f\u043e\u0440\u043e\u0433', 'Bepul chegarasi')}</th>
                  <th>{tr('\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'Amallar')}</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => {
                  const isConfirming = pendingDeleteZone === zone.id;
                  return (
                    <tr key={zone.id}>
                      <td style={{ fontWeight: 700 }}>{zone.name}</td>
                      <td>{Number(zone.price).toLocaleString()} UZS</td>
                      <td>{zone.freeFrom ? `${Number(zone.freeFrom).toLocaleString()} UZS` : '-'}</td>
                      <td>
                        {isConfirming ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>{tr('\u0423\u0434\u0430\u043b\u0438\u0442\u044c?', "O'chirish?")}</span>
                            <button className="sg-btn danger" type="button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => void deleteZone(zone.id)}>
                              {tr('\u0414\u0430', 'Ha')}
                            </button>
                            <button className="sg-btn ghost" type="button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setPendingDeleteZone(null)}>
                              {tr('\u041d\u0435\u0442', "Yo'q")}
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="sg-btn ghost" type="button" onClick={() => openEditZone(zone)}>
                              {tr('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c', 'Tahrirlash')}
                            </button>
                            <button className="sg-btn danger" type="button" onClick={() => setPendingDeleteZone(zone.id)}>
                              {tr('\u0423\u0434\u0430\u043b\u0438\u0442\u044c', 'O\'chirish')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {zones.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#6b7a71' }}>
                      {tr('\u0417\u043e\u043d\u044b \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438 \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d\u044b', 'Yetkazib berish hududlari sozlanmagan')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'loyalty' && loyalty && (
        <section className="sg-grid" style={{ gap: 12, maxWidth: 760 }}>
          {/* Base settings */}
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Программа лояльности', 'Loyallik dasturi')}</h3>
            <p className="sg-subtitle">{tr('Начисление баллов и лимиты скидки', 'Ball berish qoidalari va chegirma limitlari')}</p>
            <form onSubmit={(e) => { e.preventDefault(); void saveLoyalty(); }} className="sg-grid" style={{ gap: 12, marginTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={!!loyalty.isEnabled} onChange={(e) => setLoyalty({ ...loyalty, isEnabled: e.target.checked })} />
                {tr('Включена', 'Yoqilgan')}
              </label>
              <div className="sg-grid cols-2">
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Сумма шага', 'Qadam summasi')}</label>
                  <input type="number" value={loyalty.unitAmount || 1000} onChange={(e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value })} style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Баллов за шаг', 'Qadam uchun ball')}</label>
                  <input type="number" value={loyalty.pointsPerUnit || 1} onChange={(e) => setLoyalty({ ...loyalty, pointsPerUnit: +e.target.value })} style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div className="sg-grid cols-2">
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Цена 1 балла (сум)', '1 ball qiymati (so\'m)')}</label>
                  <input type="number" value={loyalty.pointValue || 100} onChange={(e) => setLoyalty({ ...loyalty, pointValue: +e.target.value })} style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Макс. скидка %', 'Maks. chegirma %')}</label>
                  <input type="number" value={loyalty.maxDiscountPct || 30} onChange={(e) => setLoyalty({ ...loyalty, maxDiscountPct: +e.target.value })} style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>
              <button className="sg-btn primary" type="submit" disabled={saving}>
                {saving ? '...' : tr('Сохранить', 'Saqlash')}
              </button>
            </form>
          </article>

          {/* Tiers */}
          <article className="sg-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Уровни лояльности', 'Loyallik darajalari')}</h3>
                <p className="sg-subtitle" style={{ margin: '4px 0 0' }}>{tr('Множитель баллов растёт с суммой покупок', 'Ball ko\'paytmasi umumiy xarid bilan o\'sadi')}</p>
              </div>
              <button
                className="sg-btn ghost"
                type="button"
                style={{ fontSize: 12 }}
                onClick={() => {
                  const tiers = [...(loyalty.tiers || [])];
                  tiers.push({ name: 'New', nameUz: 'Yangi', minSpend: 0, multiplier: 1, color: '#cd7f32' });
                  setLoyalty({ ...loyalty, tiers });
                }}
              >
                + {tr('Добавить', 'Qo\'shish')}
              </button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {(loyalty.tiers || []).map((tier: any, idx: number) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 80px 36px 36px', gap: 6, alignItems: 'center', background: '#f9fafb', borderRadius: 10, padding: '8px 10px' }}>
                  <input
                    value={tier.name}
                    onChange={(e) => {
                      const tiers = [...loyalty.tiers];
                      tiers[idx] = { ...tiers[idx], name: e.target.value };
                      setLoyalty({ ...loyalty, tiers });
                    }}
                    placeholder="Bronze"
                    style={{ border: '1px solid #d6e0da', borderRadius: 8, padding: '5px 8px', fontSize: 13 }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="color"
                      value={tier.color || '#cd7f32'}
                      onChange={(e) => {
                        const tiers = [...loyalty.tiers];
                        tiers[idx] = { ...tiers[idx], color: e.target.value };
                        setLoyalty({ ...loyalty, tiers });
                      }}
                      style={{ width: 28, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{tr('от суммы', 'summadan')}</div>
                      <input
                        type="number"
                        value={tier.minSpend}
                        min={0}
                        onChange={(e) => {
                          const tiers = [...loyalty.tiers];
                          tiers[idx] = { ...tiers[idx], minSpend: +e.target.value };
                          setLoyalty({ ...loyalty, tiers });
                        }}
                        style={{ border: '1px solid #d6e0da', borderRadius: 8, padding: '4px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{tr('множитель', 'ko\'paytma')}</div>
                    <input
                      type="number"
                      value={tier.multiplier}
                      min={0.1}
                      step={0.1}
                      onChange={(e) => {
                        const tiers = [...loyalty.tiers];
                        tiers[idx] = { ...tiers[idx], multiplier: +e.target.value };
                        setLoyalty({ ...loyalty, tiers });
                      }}
                      style={{ border: '1px solid #d6e0da', borderRadius: 8, padding: '4px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>x</div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: tier.color || '#cd7f32' }}>{tier.multiplier}×</span>
                  </div>
                  <button
                    type="button"
                    className="sg-btn ghost"
                    style={{ fontSize: 11, padding: '4px 6px' }}
                    disabled={(loyalty.tiers || []).length <= 1}
                    onClick={() => {
                      const tiers = loyalty.tiers.filter((_: any, i: number) => i !== idx);
                      setLoyalty({ ...loyalty, tiers });
                    }}
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    className="sg-btn primary"
                    style={{ fontSize: 11, padding: '4px 6px' }}
                    disabled={saving}
                    onClick={() => void saveLoyalty()}
                  >
                    ✓
                  </button>
                </div>
              ))}
            </div>
          </article>

          {/* Referral program */}
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{tr('Реферальная программа', 'Referal dasturi')}</h3>
            <p className="sg-subtitle" style={{ marginBottom: 12 }}>
              {tr('Клиент получает код, делится с друзьями. Бонус — после первого заказа друга.', 'Mijoz kod oladi, do\'stlariga ulashadi. Bonus — do\'stning birinchi buyurtmasidan keyin.')}
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={!!loyalty.referralEnabled}
                  onChange={(e) => setLoyalty({ ...loyalty, referralEnabled: e.target.checked })}
                />
                {tr('Реферальная программа включена', 'Referal dasturi yoqilgan')}
              </label>
              {loyalty.referralEnabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 440 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>
                      {tr('Бонус тому, кто пригласил (баллов)', 'Taklif qiluvchiga bonus (ball)')}
                    </label>
                    <input
                      type="number"
                      value={loyalty.referralBonus ?? 500}
                      min={0}
                      onChange={(e) => setLoyalty({ ...loyalty, referralBonus: +e.target.value })}
                      style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }}
                    />
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      {tr('Начисляется после первого заказа друга', 'Do\'stning birinchi buyurtmasidan keyin')}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>
                      {tr('Бонус приглашённому (баллов)', 'Taklif qilinganga bonus (ball)')}
                    </label>
                    <input
                      type="number"
                      value={loyalty.referralFriendBonus ?? 0}
                      min={0}
                      onChange={(e) => setLoyalty({ ...loyalty, referralFriendBonus: +e.target.value })}
                      style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }}
                    />
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      {tr('0 = не начислять другу', '0 = do\'stga berilmaydi')}
                    </div>
                  </div>
                </div>
              )}
              <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void saveLoyalty()}>
                {saving ? '...' : tr('Сохранить', 'Saqlash')}
              </button>
            </div>
          </article>
        </section>
      )}

      {tab === 'account' && (
        <section className="sg-grid" style={{ gap: 12 }}>
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('\u041c\u043e\u0439 \u0430\u043a\u043a\u0430\u0443\u043d\u0442', 'Mening akkauntim')}</h3>
            <div className="sg-grid cols-2" style={{ marginTop: 10 }}>
              <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('\u0418\u043c\u044f', 'Ism')} />
              <input value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder="Email" />
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void saveMyProfile()}>{saving ? '...' : tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c', 'Profilni saqlash')}</button>
            </div>
          </article>

          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('\u0421\u043c\u0435\u043d\u0430 \u043f\u0430\u0440\u043e\u043b\u044f', 'Parolni almashtirish')}</h3>
            <div className="sg-grid cols-3" style={{ marginTop: 10 }}>
              <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'Joriy parol')} />
              <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'Yangi parol')} />
              <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043f\u0430\u0440\u043e\u043b\u044c', 'Parolni tasdiqlang')} />
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void changeMyPassword()}>{saving ? '...' : tr('\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c', 'Parolni yangilash')}</button>
            </div>
          </article>

          {canManageUsers && (
            <article className="sg-card">
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u0438 \u0440\u043e\u043b\u0438', 'Foydalanuvchilar va rollar')}</h3>
              <p className="sg-subtitle">{tr('\u0414\u043e\u0431\u0430\u0432\u043b\u044f\u0439\u0442\u0435 \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u043e\u0432 \u0438 \u0443\u043f\u0440\u0430\u0432\u043b\u044f\u0439\u0442\u0435 \u0438\u0445 \u043f\u0440\u0430\u0432\u0430\u043c\u0438.', "Operator qo'shing va ruxsatlarini boshqaring.")}</p>

              <div className="sg-card soft" style={{ marginTop: 10 }}>
                <div className="sg-grid cols-4" style={{ gap: 8 }}>
                  <input value={teamForm.email} onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder="Email" />
                  <input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('\u0418\u043c\u044f', 'Ism')} />
                  <input type="password" value={teamForm.password} onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('\u041f\u0430\u0440\u043e\u043b\u044c', 'Parol')} />
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
                  <button className="sg-btn primary" type="button" disabled={saving || !teamForm.email || !teamForm.name || !teamForm.password} onClick={() => void createTeamUser()}>{saving ? '...' : tr('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f', "Foydalanuvchi qo'shish")}</button>
                </div>
              </div>

              <div className="sg-grid" style={{ gap: 8, marginTop: 10 }}>
                {team.map((user) => (
                  <div key={user.id} className="sg-card soft" style={{ padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{user.name} ({user.email})</div>
                        <div style={{ fontSize: 12, color: '#6b7a71' }}>{user.role} • {user.isActive ? tr('\u0430\u043a\u0442\u0438\u0432\u0435\u043d', 'faol') : tr('\u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d', "o'chirilgan")}</div>
                      </div>
                      {user.role !== 'OWNER' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="sg-btn ghost" type="button" disabled={togglingUser === user.id} onClick={() => void toggleTeamUserActive(user)}>{togglingUser === user.id ? '...' : user.isActive ? tr('\u041e\u0442\u043a\u043b\u044e\u0447\u0438\u0442\u044c', "O'chirish") : tr('\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c', 'Yoqish')}</button>
                          <button className="sg-btn ghost" type="button" onClick={() => { setPendingResetUser(user.id); setPendingResetPassword(''); }}>
                            {tr('\u0421\u0431\u0440\u043e\u0441 \u043f\u0430\u0440\u043e\u043b\u044f', 'Parolni tiklash')}
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
                          placeholder={tr('\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'Yangi parol')}
                          style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '7px 10px', fontSize: 13, flex: 1, minWidth: 160 }}
                        />
                        <button className="sg-btn primary" type="button" style={{ padding: '7px 14px', fontSize: 13 }} disabled={!pendingResetPassword.trim() || saving} onClick={() => void resetTeamUserPassword(user.id)}>
                          {saving ? '...' : tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', 'Saqlash')}
                        </button>
                        <button className="sg-btn ghost" type="button" style={{ padding: '7px 12px', fontSize: 13 }} onClick={() => { setPendingResetUser(null); setPendingResetPassword(''); }}>
                          {tr('\u041e\u0442\u043c\u0435\u043d\u0430', 'Bekor')}
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
                    'Akkauntni o\'chirish barcha do\'kon va botlarni o\'chiradi. Ma\'lumotlar 30 kundan so\'ng butunlay o\'chiriladi.')}
              </p>
              <button
                className="sg-btn"
                type="button"
                style={{ marginTop: 10, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 700 }}
                onClick={() => { setShowDeleteAccountModal(true); setDeleteAccountPassword(''); }}
              >
                {tr('Удалить аккаунт', 'Akkauntni o\'chirish')}
              </button>
            </article>
          )}
        </section>
      )}

      {showDeleteAccountModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', color: '#dc2626', fontWeight: 800 }}>{tr('Подтвердите удаление', 'O\'chirishni tasdiqlang')}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#374151' }}>
              {tr('Это действие нельзя отменить. Все магазины, товары и заказы будут удалены. Введите пароль для подтверждения.',
                  'Bu amalni bekor qilib bo\'lmaydi. Barcha do\'kon, mahsulot va buyurtmalar o\'chiriladi. Tasdiqlash uchun parolni kiriting.')}
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
                {deletingAccount ? '...' : tr('Удалить навсегда', 'Butunlay o\'chirish')}
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

      {tab === 'api' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Public API — ключи доступа', 'Public API — kirish kalitlari')}</h3>
            <p className="sg-subtitle">{tr('Создайте API-ключ для интеграций. Ключ показывается только один раз.', 'Integratsiyalar uchun API kalit yarating. Kalit faqat bir marta ko\'rsatiladi.')}</p>

            {newKeySecret && (
              <div className="sg-card" style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #86efac' }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#065f46' }}>{tr('Ваш новый ключ (сохраните сейчас):', 'Yangi kalitingiz (hozir saqlang):')}</p>
                <p style={{ margin: '8px 0 0', fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all', color: '#1a2e1e' }}>{newKeySecret}</p>
                <button className="sg-btn ghost" type="button" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setNewKeySecret(null)}>
                  {tr('Закрыть', 'Yopish')}
                </button>
              </div>
            )}

            <div className="sg-card soft" style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <input
                  value={apiKeyForm.name}
                  onChange={(e) => setApiKeyForm({ ...apiKeyForm, name: e.target.value })}
                  placeholder={tr('Название ключа', 'Kalit nomi')}
                  style={{ flex: 1, minWidth: 180, border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
                <input
                  type="date"
                  value={apiKeyForm.expiresAt}
                  onChange={(e) => setApiKeyForm({ ...apiKeyForm, expiresAt: e.target.value })}
                  title={tr('Срок действия (необязательно)', 'Amal qilish muddati (ixtiyoriy)')}
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: 160 }}
                />
                <button
                  className="sg-btn primary"
                  type="button"
                  disabled={saving || !apiKeyForm.name.trim()}
                  onClick={() => void createApiKey()}
                >
                  {saving ? '...' : tr('Создать ключ', 'Kalit yaratish')}
                </button>
              </div>
            </div>

            <div className="sg-grid" style={{ gap: 8, marginTop: 10 }}>
              {apiKeys.map((key) => (
                <div key={key.id} className="sg-card soft" style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{key.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7a71', marginTop: 2 }}>
                        <span style={{ fontFamily: 'monospace' }}>{key.prefix}...</span>
                        {' · '}
                        {key.isActive ? tr('активен', 'faol') : tr('отозван', 'bekor qilingan')}
                        {key.expiresAt && ` · ${tr('до', 'muddati')} ${new Date(key.expiresAt).toLocaleDateString(locale)}`}
                        {key.lastUsedAt && ` · ${tr('посл. исп.', 'oxirgi foy.')} ${new Date(key.lastUsedAt).toLocaleDateString(locale)}`}
                      </div>
                    </div>
                    {pendingDeleteKey === key.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>{tr('Отозвать ключ?', 'Kalitni bekor qilish?')}</span>
                        <button className="sg-btn danger" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => void revokeApiKey(key.id)}>{tr('Да', 'Ha')}</button>
                        <button className="sg-btn ghost" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setPendingDeleteKey(null)}>{tr('Отмена', 'Bekor')}</button>
                      </div>
                    ) : (
                      <button className="sg-btn danger" type="button" style={{ padding: '5px 14px', fontSize: 13 }} onClick={() => setPendingDeleteKey(key.id)}>
                        {tr('Отозвать', 'Bekor qilish')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {apiKeys.length === 0 && <p className="sg-subtitle">{tr('Нет API-ключей', 'API kalitlar yo\'q')}</p>}
            </div>

            <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{tr('Использование', 'Foydalanish')}</p>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
                GET https://api.sellgram.uz/api/v1/products<br />
                Authorization: Bearer {'<'}your_key{'>'}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                {tr('Эндпоинты: GET /v1/products, GET /v1/products/:id, GET /v1/orders, GET /v1/orders/:id, PATCH /v1/orders/:id/status', 'Endpointlar: GET /v1/products, GET /v1/products/:id, GET /v1/orders, GET /v1/orders/:id, PATCH /v1/orders/:id/status')}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                {tr(
                  'Лимит: 60 запросов / минуту на ключ. Ключ можно отозвать в любой момент — он перестанет работать немедленно.',
                  "Limit: daqiqada 60 so'rov / kalit. Kalitni istalgan vaqtda bekor qilish mumkin — u darhol ishlamay qoladi."
                )}
              </p>
            </div>
          </article>
        </section>
      )}

      {(tab as string) === 'webhooks' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Webhooks', 'Webhooks')}</h3>
            <p className="sg-subtitle">{tr('Получайте события заказов на ваш URL в реальном времени.', 'Buyurtma voqealarini real vaqtda URL manzilingizga oling.')}</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#748278', lineHeight: 1.6 }}>
              {tr(
                'При каждом событии SellGram делает POST-запрос на ваш URL. Если сервер не ответил 2xx — одна повторная попытка через 3 секунды. Подпись запроса передаётся в заголовке X-Sellgram-Signature: sha256=...',
                "Har bir voqeada SellGram URL manzilingizga POST so'rov yuboradi. Server 2xx javob bermasa — 3 soniyadan so'ng bitta qayta urinish. So'rov imzosi X-Sellgram-Signature: sha256=... sarlavhasida uzatiladi."
              )}
            </p>

            {newWebhookSecret && (
              <div className="sg-card" style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #86efac' }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#065f46' }}>{tr('Секрет для верификации подписи (сохраните):', 'Imzo tekshirish siri (saqlang):')}</p>
                <p style={{ margin: '8px 0 0', fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>{newWebhookSecret}</p>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>{tr('Заголовок: X-Sellgram-Signature: sha256=HMAC_SHA256(body, secret)', 'Sarlavha: X-Sellgram-Signature: sha256=HMAC_SHA256(body, secret)')}</p>
                <button className="sg-btn ghost" type="button" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setNewWebhookSecret(null)}>{tr('Закрыть', 'Yopish')}</button>
              </div>
            )}

            <div className="sg-card soft" style={{ marginTop: 10 }}>
              <input
                value={webhookForm.url}
                onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                placeholder="https://your-server.com/webhook"
                style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                {ALL_EVENTS.map((ev) => (
                  <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={webhookForm.events.includes(ev)}
                      onChange={(e) => setWebhookForm({
                        ...webhookForm,
                        events: e.target.checked
                          ? [...webhookForm.events, ev]
                          : webhookForm.events.filter((x) => x !== ev),
                      })}
                    />
                    {ev}
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  className="sg-btn primary"
                  type="button"
                  disabled={saving || !webhookForm.url.trim() || webhookForm.events.length === 0}
                  onClick={() => void createWebhook()}
                >
                  {saving ? '...' : tr('Добавить вебхук', 'Webhook qo\'shish')}
                </button>
              </div>
            </div>

            <div className="sg-grid" style={{ gap: 8, marginTop: 10 }}>
              {webhooks.map((hook) => (
                <div key={hook.id} className="sg-card soft" style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, wordBreak: 'break-all' }}>{hook.url}</div>
                      <div style={{ fontSize: 12, color: '#6b7a71', marginTop: 4 }}>
                        {(hook.events as string[]).join(', ')}
                        {' · '}
                        {hook.isActive ? tr('активен', 'faol') : tr('отключён', "o'chirilgan")}
                      </div>
                    </div>
                    {pendingDeleteWebhook === hook.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>{tr('Удалить?', "O'chirish?")}</span>
                        <button className="sg-btn danger" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => void deleteWebhook(hook.id)}>{tr('Да', 'Ha')}</button>
                        <button className="sg-btn ghost" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setPendingDeleteWebhook(null)}>{tr('Отмена', 'Bekor')}</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button className="sg-btn ghost" type="button" style={{ padding: '5px 12px', fontSize: 13 }} onClick={() => void toggleWebhook(hook)}>
                          {hook.isActive ? tr('Откл.', "O'ch.") : tr('Вкл.', 'Yoq.')}
                        </button>
                        <button className="sg-btn danger" type="button" style={{ padding: '5px 12px', fontSize: 13 }} onClick={() => setPendingDeleteWebhook(hook.id)}>
                          {tr('Удалить', "O'chirish")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {webhooks.length === 0 && <p className="sg-subtitle">{tr('Вебхуков нет', 'Webhooklar yo\'q')}</p>}
            </div>
          </article>
        </section>
      )}

      {(tab as string) === 'crm' && (
        <section className="sg-grid" style={{ gap: 12 }}>
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('CRM интеграция', 'CRM integratsiya')}</h3>
            <p className="sg-subtitle">
              {tr(
                'Подключите Bitrix24 или AmoCRM — новые клиенты и заказы будут автоматически попадать в CRM.',
                'Bitrix24 yoki AmoCRM ulang — yangi mijozlar va buyurtmalar avtomatik CRM-ga tushadi.'
              )}
            </p>

            {/* Quick connect */}
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                {tr('URL входящего вебхука CRM', 'CRM kiruvchi webhook URL')}
              </label>
              <input
                value={crmUrl}
                onChange={(e) => setCrmUrl(e.target.value)}
                placeholder="https://your-crm.bitrix24.ru/rest/..."
                style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}
              />
              <button
                className="sg-btn primary"
                type="button"
                disabled={crmSaving || !crmUrl.trim()}
                onClick={async () => {
                  if (!crmUrl.trim()) return;
                  setCrmSaving(true);
                  try {
                    const data = await adminApi.createWebhook({
                      url: crmUrl.trim(),
                      events: ['order.created', 'order.status_changed', 'order.paid', 'customer.created'],
                    });
                    setNewWebhookSecret(data.secret);
                    setCrmUrl('');
                    await load();
                    setTab('webhooks' as any);
                    showNotice('success', tr('CRM подключена — вебхук создан', 'CRM ulandi — webhook yaratildi'));
                  } catch (e: any) {
                    showNotice('error', e.message || tr('Ошибка', 'Xatolik'));
                  } finally {
                    setCrmSaving(false);
                  }
                }}
              >
                {crmSaving ? tr('Подключение...', 'Ulanmoqda...') : tr('Подключить CRM', 'CRM ulash')}
              </button>
            </div>
          </article>

          {/* Bitrix24 instructions */}
          <article className="sg-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 28 }}>⚡</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Bitrix24</div>
                <div style={{ fontSize: 12, color: '#748278' }}>{tr('Входящий вебхук REST API', 'Kiruvchi webhook REST API')}</div>
              </div>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
              <li>{tr('Перейдите в Bitrix24 → Приложения → Вебхуки → Входящий вебхук', 'Bitrix24 → Ilovalar → Webhooklar → Kiruvchi webhook')}</li>
              <li>{tr('Скопируйте URL вида', 'Quyidagi URL-ni nusxalang:')} <code style={{ background: '#f3f4f6', borderRadius: 4, padding: '1px 5px', fontSize: 12 }}>https://ДОМЕН.bitrix24.ru/rest/ПОЛЬЗОВАТЕЛЬ/ТОКЕН/</code></li>
              <li>{tr('Вставьте в поле URL выше и нажмите «Подключить»', 'Yuqoridagi URL maydoniga joylashtiring va "Ulash" tugmasini bosing')}</li>
              <li>{tr('SellGram будет отправлять события order.* и customer.created на этот URL', 'SellGram order.* va customer.created voqealarini ushbu URL ga yuboradi')}</li>
            </ol>
            <div style={{ marginTop: 10, background: '#fefce8', border: '1px solid #fde047', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#713f12' }}>
              {tr(
                'Bitrix24 REST не принимает вебхуки напрямую — настройте обработчик (например через n8n, Make или собственный сервер).',
                'Bitrix24 REST webhooklarni to\'g\'ridan-to\'g\'ri qabul qilmaydi — n8n, Make yoki o\'z serveringiz orqali sozlang.'
              )}
            </div>
          </article>

          {/* AmoCRM instructions */}
          <article className="sg-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 28 }}>🔗</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>AmoCRM</div>
                <div style={{ fontSize: 12, color: '#748278' }}>{tr('Через n8n / Make / Zapier', 'n8n / Make / Zapier orqali')}</div>
              </div>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
              <li>{tr('Создайте сценарий в n8n/Make с триггером Webhook', 'n8n/Make\'da Webhook trigger bilan stsenariy yarating')}</li>
              <li>{tr('Скопируйте URL триггера и вставьте в поле выше', 'Trigger URL-ni nusxalab yuqoridagi maydonga joylashtiring')}</li>
              <li>{tr('В сценарии маппируйте поля SellGram → AmoCRM: name, phone, email', 'Stsenariydagi SellGram → AmoCRM maydonlarini moslashtiring: name, phone, email')}</li>
              <li>{tr('Проверьте тестовым заказом', 'Test buyurtma bilan tekshiring')}</li>
            </ol>
          </article>

          {/* Payload reference */}
          <article className="sg-card">
            <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{tr('Структура событий', 'Voqealar tuzilishi')}</h4>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                {
                  event: 'customer.created',
                  fields: 'customerId, telegramId, firstName, lastName, username',
                },
                {
                  event: 'order.created',
                  fields: 'orderId, orderNumber, total, customerId',
                },
                {
                  event: 'order.status_changed',
                  fields: 'orderId, status',
                },
                {
                  event: 'order.paid',
                  fields: 'orderId, storeId',
                },
              ].map(({ event, fields }) => (
                <div key={event} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#1e3a5f', marginBottom: 2 }}>{event}</div>
                  <div style={{ color: '#748278' }}>data: {`{ ${fields} }`}</div>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {showStoreForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div className="sg-card" style={{ width: '100%', maxWidth: 520 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {editingStoreId ? tr('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d', 'Do\'konni tahrirlash') : tr('\u041d\u043e\u0432\u044b\u0439 \u043c\u0430\u0433\u0430\u0437\u0438\u043d', 'Yangi do\'kon')}
            </h3>

            <div className="sg-grid" style={{ gap: 10, marginTop: 12 }}>
              <input
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430', 'Do\'kon nomi')}
              />
              <input
                value={storeForm.botToken}
                onChange={(e) => setStoreForm({ ...storeForm, botToken: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder="Bot token"
              />
              <textarea
                value={storeForm.welcomeMessage}
                onChange={(e) => setStoreForm({ ...storeForm, welcomeMessage: e.target.value })}
                rows={3}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', resize: 'vertical' }}
                placeholder={tr('\u041f\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435', 'Xush kelibsiz xabari')}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void saveStore()}>
                  {saving ? '...' : tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" disabled={saving} onClick={() => setShowStoreForm(false)}>
                  {tr('\u041e\u0442\u043c\u0435\u043d\u0430', 'Bekor qilish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showZoneForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div className="sg-card" style={{ width: '100%', maxWidth: 520 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {editingZoneId ? tr('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0437\u043e\u043d\u0443', 'Hududni tahrirlash') : tr('\u041d\u043e\u0432\u0430\u044f \u0437\u043e\u043d\u0430', 'Yangi hudud')}
            </h3>

            <div className="sg-grid" style={{ gap: 10, marginTop: 12 }}>
              {!editingZoneId && (
                <select
                  value={zoneForm.storeId}
                  onChange={(e) => setZoneForm({ ...zoneForm, storeId: e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0437\u043e\u043d\u044b', 'Hudud nomi')}
              />
              <input
                type="number"
                value={zoneForm.price}
                onChange={(e) => setZoneForm({ ...zoneForm, price: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('\u0426\u0435\u043d\u0430', 'Narx')}
              />
              <input
                type="number"
                value={zoneForm.freeFrom}
                onChange={(e) => setZoneForm({ ...zoneForm, freeFrom: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('\u0411\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u044b\u0439 \u043f\u043e\u0440\u043e\u0433', 'Bepul chegarasi')}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void saveZone()}>
                  {saving ? '...' : tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" disabled={saving} onClick={() => setShowZoneForm(false)}>
                  {tr('\u041e\u0442\u043c\u0435\u043d\u0430', 'Bekor qilish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
