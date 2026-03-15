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

  const [telegramLinkData, setTelegramLinkData] = useState<any | null>(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);

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
      showNotice('error', err?.message || tr('Р В РЎвЂєР РЋРІвЂљВ¬Р В РЎвЂР В Р’В±Р В РЎвЂќР В Р’В° Р В Р’В·Р В Р’В°Р В РЎвЂ“Р РЋР вЂљР РЋРЎвЂњР В Р’В·Р В РЎвЂќР В РЎвЂ Р В Р вЂ¦Р В Р’В°Р РЋР С“Р РЋРІР‚С™Р РЋР вЂљР В РЎвЂўР В Р’ВµР В РЎвЂќ', 'Sozlamalarni yuklashda xato'));
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
    try {
      await adminApi.updateMe(profileForm);
      showNotice('success', tr('Р В РЎСџР РЋР вЂљР В РЎвЂўР РЋРІР‚С›Р В РЎвЂР В Р’В»Р РЋР Р‰ Р РЋР С“Р В РЎвЂўР РЋРІР‚В¦Р РЋР вЂљР В Р’В°Р В Р вЂ¦Р В Р’ВµР В Р вЂ¦', 'Profil saqlandi'));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Р В РЎвЂєР РЋРІвЂљВ¬Р В РЎвЂР В Р’В±Р В РЎвЂќР В Р’В°', 'Xatolik'));
    }
  }

  async function changeMyPassword() {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      showNotice('error', tr('Введите текущий и новый пароль', 'Joriy va yangi parolni kiriting'));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showNotice('error', tr('Р В РЎСџР В РЎвЂўР В РўвЂР РЋРІР‚С™Р В Р вЂ Р В Р’ВµР РЋР вЂљР В Р’В¶Р В РўвЂР В Р’ВµР В Р вЂ¦Р В РЎвЂР В Р’Вµ Р В РЎвЂ”Р В Р’В°Р РЋР вЂљР В РЎвЂўР В Р’В»Р РЋР РЏ Р В Р вЂ¦Р В Р’Вµ Р РЋР С“Р В РЎвЂўР В Р вЂ Р В РЎвЂ”Р В Р’В°Р В РўвЂР В Р’В°Р В Р’ВµР РЋРІР‚С™', 'Parol tasdig\'i mos emas'));
      return;
    }

    try {
      await adminApi.changeMyPassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showNotice('success', tr('Р В РЎСџР В Р’В°Р РЋР вЂљР В РЎвЂўР В Р’В»Р РЋР Р‰ Р В РЎвЂўР В Р’В±Р В Р вЂ¦Р В РЎвЂўР В Р вЂ Р В Р’В»Р В Р’ВµР В Р вЂ¦', 'Parol yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Р В РЎвЂєР РЋРІвЂљВ¬Р В РЎвЂР В Р’В±Р В РЎвЂќР В Р’В°', 'Xatolik'));
    }
  }

  async function createTeamUser() {
    if (!canManageUsers) return;
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
      showNotice('success', tr('Р В РЎСџР В РЎвЂўР В Р’В»Р РЋР Р‰Р В Р’В·Р В РЎвЂўР В Р вЂ Р В Р’В°Р РЋРІР‚С™Р В Р’ВµР В Р’В»Р РЋР Р‰ Р В РўвЂР В РЎвЂўР В Р’В±Р В Р’В°Р В Р вЂ Р В Р’В»Р В Р’ВµР В Р вЂ¦', "Foydalanuvchi qo'shildi"));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Р В РЎвЂєР РЋРІвЂљВ¬Р В РЎвЂР В Р’В±Р В РЎвЂќР В Р’В°', 'Xatolik'));
    }
  }

  async function toggleTeamUserActive(user: any) {
    try {
      await adminApi.updateTeamUser(user.id, { isActive: !user.isActive });
      await load();
      showNotice('success', tr('Р РЋРЎвЂљР В°РЎвЂљРЎС“РЎРѓ Р С•Р В±Р Р…Р С•Р Р†Р В»Р ВµР Р…', 'Status yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Р В РЎвЂєР РЋРІвЂљВ¬Р В РЎвЂР В Р’В±Р В РЎвЂќР В Р’В°', 'Xatolik'));
    }
  }

  async function resetTeamUserPassword(user: any) {
    const nextPassword = prompt(tr(`\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c \u0434\u043b\u044f ${user.email}`, `${user.email} uchun yangi parol`));
    if (!nextPassword) return;
    try {
      await adminApi.resetTeamUserPassword(user.id, nextPassword);
      showNotice('success', tr('Р В РЎСџР В Р’В°Р РЋР вЂљР В РЎвЂўР В Р’В»Р РЋР Р‰ Р РЋР С“Р В Р’В±Р РЋР вЂљР В РЎвЂўР РЋРІвЂљВ¬Р В Р’ВµР В Р вЂ¦', 'Parol tiklandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Р В РЎвЂєР РЋРІвЂљВ¬Р В РЎвЂР В Р’В±Р В РЎвЂќР В Р’В°', 'Xatolik'));
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
    try {
      if (editingStoreId) {
        const payload: any = {
          name: storeForm.name,
          welcomeMessage: storeForm.welcomeMessage,
        };
        if (storeForm.botToken) payload.botToken = storeForm.botToken;
        await adminApi.updateStore(editingStoreId, payload);
      } else {
        if (!storeForm.name || !storeForm.botToken) {
          showNotice('error', tr('Р СњРЎС“Р В¶Р Р…РЎвЂ№ Р Р…Р В°Р В·Р Р†Р В°Р Р…Р С‘Р Вµ Р СР В°Р С–Р В°Р В·Р С‘Р Р…Р В° Р С‘ bot token', "Do'kon nomi va bot token kerak"));
          return;
        }
        await adminApi.createStore(storeForm);
      }
      setShowStoreForm(false);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
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
    }
  }

  async function deleteZone(id: string) {
    if (!confirm(tr('Р Р€Р Т‘Р В°Р В»Р С‘РЎвЂљРЎРЉ РЎРЊРЎвЂљРЎС“ Р В·Р С•Р Р…РЎС“?', "Bu hudud o'chirilsinmi?"))) return;
    try {
      await adminApi.deleteDeliveryZone(id);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
    }
  }

  async function deleteStore(id: string, name: string) {
    const question = tr(
      `Р Р€Р Т‘Р В°Р В»Р С‘РЎвЂљРЎРЉ Р СР В°Р С–Р В°Р В·Р С‘Р Р… "${name}"? Р вЂќР ВµР в„–РЎРѓРЎвЂљР Р†Р С‘Р Вµ Р Р…Р ВµР С•Р В±РЎР‚Р В°РЎвЂљР С‘Р СР С•.`,
      `"${name}" do'koni o'chirilsinmi? Bu amalni ortga qaytarib bo'lmaydi.`
    );
    if (!confirm(question)) return;
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
          ? tr(`Р вЂР С•РЎвЂљ "${store.name}" Р С—Р С•Р Т‘Р С”Р В»РЎР‹РЎвЂЎР ВµР Р… Р С”Р С•РЎР‚РЎР‚Р ВµР С”РЎвЂљР Р…Р С•.`, `"${store.name}" boti to'g'ri ulangan.`)
          : tr(`Р вЂР С•РЎвЂљ "${store.name}" Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚Р ВµР Р…, Р Р…Р В°Р в„–Р Т‘Р ВµР Р…РЎвЂ№ Р С—РЎР‚Р С•Р В±Р В»Р ВµР СРЎвЂ№.`, `"${store.name}" botida muammo topildi.`),
      ];

      if (data?.bot?.username) parts.push(`@${data.bot.username}`);
      if (mismatch && webhook?.expectedUrl) {
        parts.push(tr('Webhook Р С•РЎвЂљР В»Р С‘РЎвЂЎР В°Р ВµРЎвЂљРЎРѓРЎРЏ Р С•РЎвЂљ Р С•Р В¶Р С‘Р Т‘Р В°Р ВµР СР С•Р С–Р С•.', 'Webhook kutilgan manzilga mos emas.'));
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
    try {
      const data = await adminApi.activateStore(store.id);
      const webhookUrl = data?.webhookUrl ? `\nWebhook: ${data.webhookUrl}` : '';
      showNotice('success', tr(`Р вЂР С•РЎвЂљ "${store.name}" Р С—Р С•Р Т‘Р С”Р В»РЎР‹РЎвЂЎР ВµР Р… РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•.${webhookUrl}`, `"${store.name}" boti muvaffaqiyatli ulandi.${webhookUrl}`));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    }
  }

  async function saveLoyalty() {
    try {
      await adminApi.updateLoyaltyConfig(loyalty);
      showNotice('success', tr('Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С•', 'Saqlandi'));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
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

  if (loading) return <p className="sg-subtitle">{tr('Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР С”...','Sozlamalar yuklanmoqda...')}</p>;

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}
      <header>
        <h2 className="sg-title">{tr('Р СњР В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘', 'Sozlamalar')}</h2>
        <p className="sg-subtitle">{tr('Магазины, доставка, лояльность и Telegram-привязка', "Do'konlar, yetkazib berish, loyallik va Telegram bog'lash")}</p>
      </header>

      <div className="sg-card soft">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800 }}>{tr('Р СџРЎР‚Р С‘Р Р†РЎРЏР В·Р С”Р В° Telegram-Р В°Р Т‘Р СР С‘Р Р…Р В°', 'Telegram adminini bog\'lash')}</p>
            <p className="sg-subtitle" style={{ marginTop: 4 }}>
              {tr('Сгенерируйте код и отправьте боту: /admin CODE', 'Kod yarating va botga yuboring: /admin CODE')}
            </p>
          </div>
          <button className="sg-btn primary" type="button" onClick={generateTelegramLinkCode}>
            {telegramLinkLoading ? tr('Генерируется...', 'Yaratilmoqda...') : tr('Сгенерировать код', 'Kod yaratish')}
          </button>
        </div>

        {telegramLinkData && (
          <div className="sg-card" style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              {tr('Р С™Р С•Р Т‘', 'Kod')}: <b style={{ fontFamily: 'monospace' }}>{telegramLinkData.code}</b>
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('Р ВРЎРѓРЎвЂљР ВµР С”Р В°Р ВµРЎвЂљ', 'Amal qilish muddati')}: {new Date(telegramLinkData.expiresAt).toLocaleString(locale)}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('Р С™Р С•Р СР В°Р Р…Р Т‘Р В°', 'Buyruq')}: <span style={{ fontFamily: 'monospace' }}>{telegramLinkData.command}</span>
            </p>
          </div>
        )}
      </div>

      <div className="sg-pill-row">
        <button className={`sg-pill ${tab === 'stores' ? 'active' : ''}`} type="button" onClick={() => setTab('stores')}>
          {tr('Р СљР В°Р С–Р В°Р В·Р С‘Р Р…РЎвЂ№', "Do'konlar")}
        </button>
        <button className={`sg-pill ${tab === 'zones' ? 'active' : ''}`} type="button" onClick={() => setTab('zones')}>
          {tr('Р вЂќР С•РЎРѓРЎвЂљР В°Р Р†Р С”Р В°', 'Yetkazib berish')}
        </button>
        <button className={`sg-pill ${tab === 'loyalty' ? 'active' : ''}`} type="button" onClick={() => setTab('loyalty')}>
          {tr('Р вЂєР С•РЎРЏР В»РЎРЉР Р…Р С•РЎРѓРЎвЂљРЎРЉ', 'Loyallik')}
        </button>
        <button className={`sg-pill ${tab === 'account' ? 'active' : ''}`} type="button" onClick={() => setTab('account')}>
          {tr('Р В РЎвЂ™Р В РЎвЂќР В РЎвЂќР В Р’В°Р РЋРЎвЂњР В Р вЂ¦Р РЋРІР‚С™', 'Akkaunt')}
        </button>
      </div>

      {tab === 'stores' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p className="sg-subtitle" style={{ margin: 0 }}>
              {tr('Р С›Р Т‘Р С‘Р Р… Р СР В°Р С–Р В°Р В·Р С‘Р Р… = Р С•Р Т‘Р С‘Р Р… Telegram-Р В±Р С•РЎвЂљ', "Bitta do'kon = bitta Telegram bot")}
            </p>
            <button className="sg-btn primary" type="button" onClick={openCreateStore}>
              + {tr('Р СљР В°Р С–Р В°Р В·Р С‘Р Р…', "Do'kon")}
            </button>
          </div>

          {stores.map((store) => (
            <article key={store.id} className="sg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 800 }}>{store.name}</p>
                {store.botUsername && <p style={{ margin: '4px 0 0', color: '#2e7d64', fontSize: 13 }}>@{store.botUsername}</p>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="sg-btn ghost" type="button" onClick={() => openEditStore(store)}>
                  {tr('Р ВР В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ', 'Tahrirlash')}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => checkStoreConnection(store)}>
                  {tr('\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0431\u043E\u0442\u0430', 'Botni tekshirish')}
                </button>
                <button className="sg-btn primary" type="button" onClick={() => activateStoreConnection(store)}>
                  {tr('\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C', 'Ulash')}
                </button>
                <button
                  className="sg-btn danger"
                  type="button"
                  disabled={stores.length <= 1}
                  title={stores.length <= 1 ? tr('Р СњР ВµР В»РЎРЉР В·РЎРЏ РЎС“Р Т‘Р В°Р В»Р С‘РЎвЂљРЎРЉ Р С—Р С•РЎРѓР В»Р ВµР Т‘Р Р…Р С‘Р в„– Р СР В°Р С–Р В°Р В·Р С‘Р Р…', "Oxirgi do'konni o'chirib bo'lmaydi") : undefined}
                  onClick={() => deleteStore(store.id, store.name)}
                >
                  {tr('Р Р€Р Т‘Р В°Р В»Р С‘РЎвЂљРЎРЉ', "O'chirish")}
                </button>
              </div>
            </article>
          ))}

          {stores.length === 0 && <p className="sg-subtitle">{tr('Р СљР В°Р С–Р В°Р В·Р С‘Р Р…Р С•Р Р† Р С—Р С•Р С”Р В° Р Р…Р ВµРЎвЂљ', "Hozircha do'konlar yo'q")}</p>}
        </section>
      )}

      {tab === 'zones' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p className="sg-subtitle" style={{ margin: 0 }}>
              {tr('Р вЂ”Р С•Р Р…РЎвЂ№ Р С‘ РЎвЂљР В°РЎР‚Р С‘РЎвЂћРЎвЂ№ Р Т‘Р С•РЎРѓРЎвЂљР В°Р Р†Р С”Р С‘', 'Yetkazib berish hududlari va tariflar')}
            </p>
            <button className="sg-btn primary" type="button" onClick={openCreateZone}>
              + {tr('Р вЂ”Р С•Р Р…Р В°', 'Hudud')}
            </button>
          </div>

          <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="sg-table">
              <thead>
                <tr>
                  <th>{tr('Р вЂ”Р С•Р Р…Р В°', 'Hudud')}</th>
                  <th>{tr('Р В¦Р ВµР Р…Р В°', 'Narx')}</th>
                  <th>{tr('Р вЂР ВµРЎРѓР С—Р В»Р В°РЎвЂљР Р…Р С• Р С•РЎвЂљ', 'Bepul chegarasi')}</th>
                  <th>{tr('Р вЂќР ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎРЏ', 'Amallar')}</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td style={{ fontWeight: 700 }}>{zone.name}</td>
                    <td>{Number(zone.price).toLocaleString()} UZS</td>
                    <td>{zone.freeFrom ? `${Number(zone.freeFrom).toLocaleString()} UZS` : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="sg-btn ghost" type="button" onClick={() => openEditZone(zone)}>
                          {tr('Р ВР В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ', 'Tahrirlash')}
                        </button>
                        <button className="sg-btn danger" type="button" onClick={() => deleteZone(zone.id)}>
                          {tr('Р Р€Р Т‘Р В°Р В»Р С‘РЎвЂљРЎРЉ', "O'chirish")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {zones.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#6b7a71' }}>
                      {tr('Р вЂ”Р С•Р Р…РЎвЂ№ Р Т‘Р С•РЎРѓРЎвЂљР В°Р Р†Р С”Р С‘ Р Р…Р Вµ Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР Р…РЎвЂ№', 'Yetkazib berish hududlari sozlanmagan')}
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
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('Р СџРЎР‚Р С•Р С–РЎР‚Р В°Р СР СР В° Р В»Р С•РЎРЏР В»РЎРЉР Р…Р С•РЎРѓРЎвЂљР С‘', 'Loyallik dasturi')}</h3>
          <p className="sg-subtitle">{tr('Р СњР В°РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С‘Р Вµ Р В±Р В°Р В»Р В»Р С•Р Р† Р С‘ Р В»Р С‘Р СР С‘РЎвЂљРЎвЂ№ РЎРѓР С”Р С‘Р Т‘Р С”Р С‘', 'Ball berish qoidalari va chegirma limitlari')}</p>

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
              {tr('Р вЂ™Р С”Р В»РЎР‹РЎвЂЎР ВµР Р…Р В°', 'Yoqilgan')}
            </label>

            <div className="sg-grid cols-2">
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Р РЋРЎС“Р СР СР В° РЎв‚¬Р В°Р С–Р В°', 'Qadam summasi')}</label>
                <input
                  type="number"
                  value={loyalty.unitAmount || 1000}
                  onChange={(e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Р вЂР В°Р В»Р В»Р С•Р Р† Р В·Р В° РЎв‚¬Р В°Р С–', 'Qadam uchun ball')}</label>
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
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Р В¦Р ВµР Р…Р В° 1 Р В±Р В°Р В»Р В»Р В°', '1 ball qiymati')}</label>
                <input
                  type="number"
                  value={loyalty.pointValue || 100}
                  onChange={(e) => setLoyalty({ ...loyalty, pointValue: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Р СљР В°Р С”РЎРѓ. РЎРѓР С”Р С‘Р Т‘Р С”Р В° %', 'Maks. chegirma %')}</label>
                <input
                  type="number"
                  value={loyalty.maxDiscountPct || 30}
                  onChange={(e) => setLoyalty({ ...loyalty, maxDiscountPct: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
            </div>

            <button className="sg-btn primary" type="submit">
              {tr('Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ', 'Saqlash')}
            </button>
          </form>
        </section>
      )}

      {tab === 'account' && (
        <section className="sg-grid" style={{ gap: 12 }}>
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Р В РЎС™Р В РЎвЂўР В РІвЂћвЂ“ Р В Р’В°Р В РЎвЂќР В РЎвЂќР В Р’В°Р РЋРЎвЂњР В Р вЂ¦Р РЋРІР‚С™', 'Mening akkauntim')}</h3>
            <div className="sg-grid cols-2" style={{ marginTop: 10 }}>
              <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Р В Р’ВР В РЎВР РЋР РЏ', 'Ism')} />
              <input value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder="Email" />
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="sg-btn primary" type="button" onClick={() => void saveMyProfile()}>{tr('Сохранить профиль', 'Profilni saqlash')}</button>
            </div>
          </article>

          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Смена пароля', 'Parolni almashtirish')}</h3>
            <div className="sg-grid cols-3" style={{ marginTop: 10 }}>
              <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Р СћР ВµР С”РЎС“РЎвЂ°Р С‘Р в„– Р С—Р В°РЎР‚Р С•Р В»РЎРЉ', 'Joriy parol')} />
              <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Новый пароль', 'Yangi parol')} />
              <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Р В РЎСџР В РЎвЂўР В РўвЂР РЋРІР‚С™Р В Р вЂ Р В Р’ВµР РЋР вЂљР В РўвЂР В РЎвЂР РЋРІР‚С™Р В Р’Вµ Р В РЎвЂ”Р В Р’В°Р РЋР вЂљР В РЎвЂўР В Р’В»Р РЋР Р‰', 'Parolni tasdiqlang')} />
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="sg-btn primary" type="button" onClick={() => void changeMyPassword()}>{tr('Р В РЎвЂєР В Р’В±Р В Р вЂ¦Р В РЎвЂўР В Р вЂ Р В РЎвЂР РЋРІР‚С™Р РЋР Р‰ Р В РЎвЂ”Р В Р’В°Р РЋР вЂљР В РЎвЂўР В Р’В»Р РЋР Р‰', 'Parolni yangilash')}</button>
            </div>
          </article>

          {canManageUsers && (
            <article className="sg-card">
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Р В РЎСџР В РЎвЂўР В Р’В»Р РЋР Р‰Р В Р’В·Р В РЎвЂўР В Р вЂ Р В Р’В°Р РЋРІР‚С™Р В Р’ВµР В Р’В»Р В РЎвЂ Р В РЎвЂ Р РЋР вЂљР В РЎвЂўР В Р’В»Р В РЎвЂ', 'Foydalanuvchilar va rollar')}</h3>
              <p className="sg-subtitle">{tr('Р В РІР‚СњР В РЎвЂўР В Р’В±Р В Р’В°Р В Р вЂ Р В Р’В»Р РЋР РЏР В РІвЂћвЂ“Р РЋРІР‚С™Р В Р’Вµ Р В РЎвЂўР В РЎвЂ”Р В Р’ВµР РЋР вЂљР В Р’В°Р РЋРІР‚С™Р В РЎвЂўР РЋР вЂљР В РЎвЂўР В Р вЂ  Р В РЎвЂ Р РЋРЎвЂњР В РЎвЂ”Р РЋР вЂљР В Р’В°Р В Р вЂ Р В Р’В»Р РЋР РЏР В РІвЂћвЂ“Р РЋРІР‚С™Р В Р’Вµ Р В РўвЂР В РЎвЂўР РЋР С“Р РЋРІР‚С™Р РЋРЎвЂњР В РЎвЂ”Р В Р’В°Р В РЎВР В РЎвЂ.', "Operator qo'shing va ruxsatlarini boshqaring.")}</p>

              <div className="sg-card soft" style={{ marginTop: 10 }}>
                <div className="sg-grid cols-4" style={{ gap: 8 }}>
                  <input value={teamForm.email} onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder="Email" />
                  <input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Р В Р’ВР В РЎВР РЋР РЏ', 'Ism')} />
                  <input type="password" value={teamForm.password} onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Р В РЎСџР В Р’В°Р РЋР вЂљР В РЎвЂўР В Р’В»Р РЋР Р‰', 'Parol')} />
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
                        {key}
                      </label>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  <button className="sg-btn primary" type="button" onClick={() => void createTeamUser()}>{tr('Р В РІР‚СњР В РЎвЂўР В Р’В±Р В Р’В°Р В Р вЂ Р В РЎвЂР РЋРІР‚С™Р РЋР Р‰ Р В РЎвЂ”Р В РЎвЂўР В Р’В»Р РЋР Р‰Р В Р’В·Р В РЎвЂўР В Р вЂ Р В Р’В°Р РЋРІР‚С™Р В Р’ВµР В Р’В»Р РЋР РЏ', "Foydalanuvchi qo'shish")}</button>
                </div>
              </div>

              <div className="sg-grid" style={{ gap: 8, marginTop: 10 }}>
                {team.map((user) => (
                  <div key={user.id} className="sg-card soft" style={{ padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{user.name} ({user.email})</div>
                        <div style={{ fontSize: 12, color: '#6b7a71' }}>{user.role} • {user.isActive ? tr('активен', 'faol') : tr('отключен', "o\'chirilgan")}</div>
                      </div>
                      {user.role !== 'OWNER' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="sg-btn ghost" type="button" onClick={() => void toggleTeamUserActive(user)}>{user.isActive ? tr('Отключить', "O'chirish") : tr('Включить', 'Yoqish')}</button>
                          <button className="sg-btn ghost" type="button" onClick={() => void resetTeamUserPassword(user)}>{tr('Сброс пароля', 'Parolni tiklash')}</button>
                        </div>
                      )}
                    </div>
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
              {editingStoreId ? tr('Р В Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р СР В°Р С–Р В°Р В·Р С‘Р Р…', "Do'konni tahrirlash") : tr('Р СњР С•Р Р†РЎвЂ№Р в„– Р СР В°Р С–Р В°Р В·Р С‘Р Р…', "Yangi do'kon")}
            </h3>

            <div className="sg-grid" style={{ gap: 10, marginTop: 12 }}>
              <input
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('Р СњР В°Р В·Р Р†Р В°Р Р…Р С‘Р Вµ Р СР В°Р С–Р В°Р В·Р С‘Р Р…Р В°', "Do'kon nomi")}
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
                placeholder={tr('Р СџРЎР‚Р С‘Р Р†Р ВµРЎвЂљРЎРѓРЎвЂљР Р†Р ВµР Р…Р Р…Р С•Р Вµ РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘Р Вµ', 'Xush kelibsiz xabari')}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn primary" type="button" onClick={() => void saveStore()}>
                  {tr('Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => setShowStoreForm(false)}>
                  {tr('Р С›РЎвЂљР СР ВµР Р…Р В°', 'Bekor qilish')}
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
              {editingZoneId ? tr('Р В Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р В·Р С•Р Р…РЎС“', 'Hududni tahrirlash') : tr('Р СњР С•Р Р†Р В°РЎРЏ Р В·Р С•Р Р…Р В°', 'Yangi hudud')}
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
                placeholder={tr('Р СњР В°Р В·Р Р†Р В°Р Р…Р С‘Р Вµ Р В·Р С•Р Р…РЎвЂ№', 'Hudud nomi')}
              />
              <input
                type="number"
                value={zoneForm.price}
                onChange={(e) => setZoneForm({ ...zoneForm, price: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('Р В¦Р ВµР Р…Р В°', 'Narx')}
              />
              <input
                type="number"
                value={zoneForm.freeFrom}
                onChange={(e) => setZoneForm({ ...zoneForm, freeFrom: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('Р вЂР ВµРЎРѓР С—Р В»Р В°РЎвЂљР Р…Р С• Р С•РЎвЂљ', 'Bepul chegarasi')}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn primary" type="button" onClick={() => void saveZone()}>
                  {tr('Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => setShowZoneForm(false)}>
                  {tr('Р С›РЎвЂљР СР ВµР Р…Р В°', 'Bekor qilish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}







