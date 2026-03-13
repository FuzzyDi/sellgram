import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

export default function Dashboard() {
  const { tr } = useAdminI18n();
  const [stats, setStats] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getDashboard(), adminApi.getTopProducts(), adminApi.getSubscription().catch(() => null)])
      .then(([s, tp, subscription]) => {
        setStats(s);
        setTopProducts(Array.isArray(tp) ? tp : tp?.items || []);
        setSub(subscription);
      })
      .finally(() => setLoading(false));
  }, []);

  const checks = useMemo(() => {
    const usage = sub?.usage;
    return [
      {
        done: true,
        label: tr('Registration completed', "Ro'yxatdan o'tish bajarildi"),
        desc: tr('Great start!', 'Ajoyib start!'),
      },
      {
        done: (stats?.totalProducts || 0) > 0,
        label: tr('Add products', "Mahsulot qo'shish"),
        desc: tr('Products > Add', "Mahsulotlar > Qo'shish"),
        to: '/products',
      },
      {
        done: (stats?.totalProducts || 0) > 0,
        label: tr('Upload photos', 'Rasm yuklash'),
        desc: tr('Open product > Photos', 'Mahsulotni oching > Rasmlar'),
        to: '/products',
      },
      {
        done: (usage?.stores?.current || 0) > 0,
        label: tr('Connect bot', 'Botni ulash'),
        desc: tr('Settings > Edit > Bot token', 'Sozlamalar > Tahrirlash > Bot token'),
        to: '/settings',
      },
      {
        done: (usage?.deliveryZones?.current || 0) > 0,
        label: tr('Configure delivery', 'Yetkazib berishni sozlash'),
        desc: tr('Settings > Delivery', 'Sozlamalar > Yetkazib berish'),
        to: '/settings',
      },
    ];
  }, [stats, sub, tr]);

  const completedSteps = checks.filter((c) => c.done).length;
  const totalSteps = checks.length;

  if (loading) {
    return (
      <section className="sg-page">
        <p className="sg-subtitle">{tr('Loading...', 'Yuklanmoqda...')}</p>
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 18 }}>
      <header>
        <h2 className="sg-title">{tr('Dashboard', 'Dashboard')}</h2>
        <p className="sg-subtitle">{tr('Store performance and setup progress', "Do'kon ko'rsatkichlari va sozlash holati")}</p>
      </header>

      <div className="sg-card soft">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Setup checklist', 'Sozlash roʻyxati')}</h3>
            <p className="sg-subtitle" style={{ marginTop: 6 }}>
              {completedSteps} / {totalSteps} {tr('steps completed', 'qadam bajarildi')}
            </p>
          </div>
          <div className="sg-badge" style={{ background: '#e8f7ef', color: '#006f4a', fontSize: 12 }}>
            {Math.round((completedSteps / totalSteps) * 100)}%
          </div>
        </div>

        <div style={{ height: 7, borderRadius: 999, background: '#e6efe9', marginTop: 12, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${(completedSteps / totalSteps) * 100}%`,
              background: 'linear-gradient(135deg,#00875a,#00a86f)',
              transition: 'width .35s ease',
            }}
          />
        </div>

        <div className="sg-grid" style={{ marginTop: 14 }}>
          {checks.map((check, i) => (
            <button
              key={`${check.label}-${i}`}
              onClick={() => check.to && (window.location.hash = check.to)}
              style={{
                border: '1px solid #e1e9e3',
                borderRadius: 10,
                background: check.done ? '#f0faf4' : '#fff',
                textAlign: 'left',
                padding: '10px 12px',
                cursor: check.to ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: check.done ? '#5f6d64' : '#18261f' }}>
                {check.done ? 'Done' : `Step ${i + 1}`}: {check.label}
              </div>
              {!check.done && <div style={{ color: '#738279', fontSize: 12, marginTop: 2 }}>{check.desc}</div>}
            </button>
          ))}
        </div>
      </div>

      <div className="sg-grid cols-4">
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Orders today', 'Bugungi buyurtmalar')}</div>
          <div className="sg-kpi-value">{stats?.ordersToday || 0}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Revenue (month)', 'Tushum (oy)')}</div>
          <div className="sg-kpi-value">{((stats?.revenue?.month || 0) / 1000).toFixed(0)}K</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Customers', 'Mijozlar')}</div>
          <div className="sg-kpi-value">{stats?.totalCustomers || 0}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Products', 'Mahsulotlar')}</div>
          <div className="sg-kpi-value">{stats?.totalProducts || 0}</div>
        </article>
      </div>

      <section className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Top products', 'Top mahsulotlar')}</h3>
        <p className="sg-subtitle" style={{ marginBottom: 10 }}>{tr('Best sellers by revenue', "Tushum bo'yicha eng yaxshi mahsulotlar")}</p>

        {topProducts.length === 0 ? (
          <p className="sg-subtitle">{tr('No data yet', "Hozircha ma'lumot yo'q")}</p>
        ) : (
          <table className="sg-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{tr('Product', 'Mahsulot')}</th>
                <th>{tr('Revenue', 'Tushum')}</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.slice(0, 7).map((p: any, i: number) => (
                <tr key={`${p.id || p.name}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{p.name}</td>
                  <td>{Number(p.totalRevenue || 0).toLocaleString()} UZS</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
