import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type NoticeTone = 'success' | 'error' | 'info';

export default function Settings() {
  const { tr, locale } = useAdminI18n();
  const [tab, setTab] = useState<'stores' | 'zones' | 'loyalty' | 'account'>('stores');
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
  const [teamForm, setTeamForm] = useState({
    email: '',
    name: '',
    password: '',
    role: 'OPERATOR' as 'MANAGER' | 'OPERATOR',
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
      const [storeList, zoneList, loyaltyConfig, meData, teamData] = await Promise.all([
        adminApi.getStores(),
        adminApi.getDeliveryZones(),
        adminApi.getLoyaltyConfig(),
        adminApi.me(),
        adminApi.getTeamUsers().catch(() => []),
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
      if (teamForm.role === 'OPERATOR') payload.permissions = teamForm.permissions;
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
        <section className="sg-card" style={{ maxWidth: 720 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('\u041f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430 \u043b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u0438', 'Loyallik dasturi')}</h3>
          <p className="sg-subtitle">{tr('\u041d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u0438\u0435 \u0431\u0430\u043b\u043b\u043e\u0432 \u0438 \u043b\u0438\u043c\u0438\u0442\u044b \u0441\u043a\u0438\u0434\u043a\u0438', 'Ball berish qoidalari va chegirma limitlari')}</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveLoyalty();
            }}
            className="sg-grid"
            style={{ gap: 12, marginTop: 10 }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={!!loyalty.isEnabled}
                onChange={(e) => setLoyalty({ ...loyalty, isEnabled: e.target.checked })}
              />
              {tr('\u0412\u043a\u043b\u044e\u0447\u0435\u043d\u0430', 'Yoqilgan')}
            </label>

            <div className="sg-grid cols-2">
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('\u0421\u0443\u043c\u043c\u0430 \u0448\u0430\u0433\u0430', 'Qadam summasi')}</label>
                <input
                  type="number"
                  value={loyalty.unitAmount || 1000}
                  onChange={(e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('\u0411\u0430\u043b\u043b\u043e\u0432 \u0437\u0430 \u0448\u0430\u0433', 'Qadam uchun ball')}</label>
                <input
                  type="number"
                  value={loyalty.pointsPerUnit || 1}
                  onChange={(e) => setLoyalty({ ...loyalty, pointsPerUnit: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
            </div>

            <div className="sg-grid cols-2">
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('\u0426\u0435\u043d\u0430 1 \u0431\u0430\u043b\u043b\u0430', '1 ball qiymati')}</label>
                <input
                  type="number"
                  value={loyalty.pointValue || 100}
                  onChange={(e) => setLoyalty({ ...loyalty, pointValue: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('\u041c\u0430\u043a\u0441. \u0441\u043a\u0438\u0434\u043a\u0430 %', 'Maks. chegirma %')}</label>
                <input
                  type="number"
                  value={loyalty.maxDiscountPct || 30}
                  onChange={(e) => setLoyalty({ ...loyalty, maxDiscountPct: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
            </div>

            <button className="sg-btn primary" type="submit" disabled={saving}>
              {saving ? '...' : tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', 'Saqlash')}
            </button>
          </form>
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
                  <select value={teamForm.role} onChange={(e) => setTeamForm({ ...teamForm, role: e.target.value as 'MANAGER' | 'OPERATOR' })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}>
                    <option value="OPERATOR">Operator</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                </div>

                {teamForm.role === 'OPERATOR' && (
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
