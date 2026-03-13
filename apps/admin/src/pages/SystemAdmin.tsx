import React, { useEffect, useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../api/system-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

export default function SystemAdmin() {
  const { tr } = useAdminI18n();
  const [loggedIn, setLoggedIn] = useState(!!sessionStorage.getItem('systemToken'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [d, t, s, i] = await Promise.all([
        systemApi.dashboard(),
        systemApi.tenants('page=1&pageSize=30'),
        systemApi.stores('page=1&pageSize=30'),
        systemApi.pendingInvoices(),
      ]);
      setDashboard(d);
      setTenants(Array.isArray(t?.items) ? t.items : []);
      setStores(Array.isArray(s?.items) ? s.items : []);
      setInvoices(Array.isArray(i) ? i : []);
    } catch (err: any) {
      clearSystemToken();
      setLoggedIn(false);
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn]);

  async function login() {
    setLoginError('');
    setLoading(true);
    try {
      const data = await systemApi.login(email.trim(), password);
      if (data?.token) setSystemToken(data.token);
      setLoggedIn(true);
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearSystemToken();
    setLoggedIn(false);
  }

  function goToStoreAdmin() {
    clearSystemToken();
    window.location.hash = '/';
  }

  async function setPlan(tenantId: string, plan: 'FREE' | 'PRO' | 'BUSINESS') {
    try {
      await systemApi.setTenantPlan(tenantId, plan);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function moderateInvoice(id: string, action: 'confirm' | 'reject') {
    try {
      if (action === 'confirm') await systemApi.confirmInvoice(id);
      else await systemApi.rejectInvoice(id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (!loggedIn) {
    return (
      <div style={{ maxWidth: 420, margin: '50px auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24 }}>
        <h2 className="text-2xl font-bold mb-1">{tr('Глобальный админ платформы', 'Platforma global admini')}</h2>
        <p className="text-sm text-gray-500 mb-4">
          {tr('Отдельная консоль для управления платформой и подписками.', "Platforma va obunalarni boshqarish uchun alohida konsol.")}
        </p>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr('Пароль', 'Parol')} className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
        {loginError && <p className="text-sm text-red-600 mb-2">{loginError}</p>}
        <button onClick={login} disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50">
          {loading ? tr('Вход...', 'Kirilmoqda...') : tr('Войти', 'Kirish')}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 className="text-2xl font-bold">{tr('Консоль глобального админа', 'Global admin konsoli')}</h2>
          <p className="text-sm text-gray-500">
            {tr('Контроль платформы, планов подписки и модерации платежей за подписку.', "Platforma, obuna rejasi va obuna to'lovlarini moderatsiya qilish.")}
          </p>
        </div>
        <Button onClick={logout} className="px-3 py-2 text-sm bg-gray-100 rounded-lg">{tr('Выйти', 'Chiqish')}</Button>
      </div>
      <div className="mb-4">
        <Button onClick={goToStoreAdmin} className="px-3 py-2 text-sm bg-white border rounded-lg">
          {tr('Перейти в админку магазина', "Do'kon adminiga o'tish")}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: tr('Тенанты', 'Tenantlar'), value: dashboard?.tenants ?? '-' },
          { label: tr('Активные магазины', "Faol do'konlar"), value: dashboard?.activeStores ?? '-' },
          { label: tr('Счета на модерации', "Ko'rib chiqilayotgan hisoblar"), value: dashboard?.pendingInvoices ?? '-' },
          { label: tr('Заказы за месяц', 'Oylik buyurtmalar'), value: dashboard?.monthlyOrders ?? '-' },
        ].map((item) => (
          <div key={item.label} className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="text-2xl font-bold mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold mb-3">{tr('Тенанты', 'Tenantlar')}</h3>
          <div className="space-y-2 max-h-96 overflow-auto">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="border rounded-lg p-3">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <p className="font-medium">{tenant.name}</p>
                    <p className="text-xs text-gray-500">{tenant.slug}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-gray-100">{tenant.plan}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => setPlan(tenant.id, 'FREE')} className="px-2 py-1 text-xs rounded bg-gray-100">FREE</Button>
                  <Button onClick={() => setPlan(tenant.id, 'PRO')} className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">PRO</Button>
                  <Button onClick={() => setPlan(tenant.id, 'BUSINESS')} className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-700">BUSINESS</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold mb-3">{tr('Счета на модерации', "Ko'rib chiqilayotgan hisoblar")}</h3>
          <div className="space-y-2 max-h-56 overflow-auto mb-4">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="border rounded-lg p-3">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <p className="font-medium">{invoice.tenant?.name || invoice.tenantId}</p>
                  <span className="text-xs">{invoice.plan}</span>
                </div>
                <p className="text-sm">{Number(invoice.amount).toLocaleString()} UZS</p>
                <p className="text-xs text-gray-500 mt-1">{invoice.paymentRef || tr('Нет payment ref', "Payment ref yo'q")}</p>
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => moderateInvoice(invoice.id, 'confirm')} className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">{tr('Подтвердить', 'Tasdiqlash')}</Button>
                  <Button onClick={() => moderateInvoice(invoice.id, 'reject')} className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">{tr('Отклонить', 'Rad etish')}</Button>
                </div>
              </div>
            ))}
            {invoices.length === 0 && <p className="text-sm text-gray-400">{tr('Нет счетов на модерации', "Ko'rib chiqish uchun hisob yo'q")}</p>}
          </div>

          <h3 className="font-semibold mb-3">{tr('Магазины', "Do'konlar")}</h3>
          <div className="space-y-2 max-h-40 overflow-auto">
            {stores.map((store) => (
              <div key={store.id} className="border rounded-lg p-2">
                <p className="text-sm font-medium">{store.name}</p>
                <p className="text-xs text-gray-500">{store.tenant?.name || '-'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

