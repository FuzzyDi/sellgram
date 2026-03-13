import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

export default function Dashboard() {
  const { tr } = useAdminI18n();
  const [stats, setStats] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.getDashboard(),
      adminApi.getTopProducts(),
      adminApi.getSubscription().catch(() => null),
    ]).then(([s, tp, subscription]) => {
      setStats(s);
      setTopProducts(Array.isArray(tp) ? tp : tp?.items || []);
      setSub(subscription);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-400">{tr('Loading...', 'Yuklanmoqda...')}</p>;

  const usage = sub?.usage;
  const checks = [
    { done: true, label: tr('Registration completed', "Ro'yxatdan o'tish bajarildi"), desc: tr('Great start!', 'Ajoyib start!') },
    { done: (stats?.totalProducts || 0) > 0, label: tr('Add products', "Mahsulot qo'shish"), desc: tr('Products > Add', "Mahsulotlar > Qo'shish"), link: '#/products' },
    { done: (stats?.totalProducts || 0) > 0, label: tr('Upload photos', 'Rasm yuklash'), desc: tr('Open product > Photos', 'Mahsulotni oching > Rasmlar'), link: '#/products' },
    { done: (usage?.stores?.current || 0) > 0, label: tr('Connect bot', 'Botni ulash'), desc: tr('Settings > Edit > Bot token', 'Sozlamalar > Tahrirlash > Bot token'), link: '#/settings' },
    { done: (usage?.deliveryZones?.current || 0) > 0, label: tr('Configure delivery', 'Yetkazib berishni sozlash'), desc: tr('Settings > Delivery', 'Sozlamalar > Yetkazib berish'), link: '#/settings' },
  ];

  const completedSteps = checks.filter((c) => c.done).length;
  const allDone = completedSteps === checks.length;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">?? {tr('Dashboard', 'Dashboard')}</h2>

      {!allDone && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 className="font-bold text-lg">?? {tr('Complete setup', 'Sozlashni yakunlang')}</h3>
              <p className="text-sm text-gray-500 mt-1">{completedSteps} / {checks.length} {tr('steps completed', 'qadam bajarildi')}</p>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#00875a' }}>
              {Math.round((completedSteps / checks.length) * 100)}%
            </div>
          </div>

          <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, marginBottom: 16 }}>
            <div style={{ height: '100%', borderRadius: 3, background: '#00875a', width: `${(completedSteps / checks.length) * 100}%`, transition: 'width 0.5s' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {checks.map((c, i) => (
              <div
                key={i}
                onClick={() => c.link && (window.location.hash = c.link.replace('#', ''))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: c.done ? '#f0fdf4' : '#fafafa',
                  cursor: c.link ? 'pointer' : 'default',
                }}
              >
                <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: c.done ? '#00875a' : '#e5e7eb', color: c.done ? '#fff' : '#9ca3af' }}>
                  {c.done ? '?' : i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, color: c.done ? '#6b7280' : '#1a1a1a', textDecoration: c.done ? 'line-through' : 'none' }}>{c.label}</p>
                  {!c.done && <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{c.desc}</p>}
                </div>
                {c.link && !c.done && <span style={{ fontSize: 14, color: '#00875a' }}>{'>'}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {allDone && (
        <div style={{ background: 'linear-gradient(135deg, #00875a, #00b96b)', borderRadius: 16, padding: 24, marginBottom: 24, color: '#fff' }}>
          <h3 className="font-bold text-lg">?? {tr('Store is ready', "Do'kon ishga tayyor")}</h3>
          <p style={{ fontSize: 14, opacity: 0.9, marginTop: 8, lineHeight: 1.7 }}>{tr('Next step: attract customers.', 'Keyingi qadam: mijozlarni jalb qiling.')}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: tr('Orders today', 'Bugungi buyurtmalar'), value: stats?.ordersToday || 0, icon: '??' },
          { label: tr('Revenue (month)', 'Tushum (oy)'), value: `${((stats?.revenue?.month || 0) / 1000).toFixed(0)}K`, icon: '??' },
          { label: tr('Customers', 'Mijozlar'), value: stats?.totalCustomers || 0, icon: '??' },
          { label: tr('Products', 'Mahsulotlar'), value: stats?.totalProducts || 0, icon: '???' },
        ].map((item) => (
          <div key={item.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p className="text-sm text-gray-500">{item.label}</p>
                <p className="text-2xl font-bold mt-1">{item.value}</p>
              </div>
              <span style={{ fontSize: 28 }}>{item.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {topProducts.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20 }}>
          <h3 className="font-bold mb-3">?? {tr('Top products', 'Top mahsulotlar')}</h3>
          {topProducts.slice(0, 5).map((p: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid #f3f4f6' : 'none' }}>
              <span className="text-sm">{i + 1}. {p.name}</span>
              <span className="text-sm font-medium">{Number(p.totalRevenue || 0).toLocaleString()} UZS</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
