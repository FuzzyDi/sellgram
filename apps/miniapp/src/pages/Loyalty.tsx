import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { BottomNav } from './Catalog';
import { useMiniI18n } from '../i18n';

export default function Loyalty() {
  const { tr, locale } = useMiniI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    api.getLoyalty().then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div className="skeleton" style={{ height: 28, width: 100, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 160, borderRadius: 20 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p className="error-banner" style={{ marginBottom: 12 }}>{tr('Не удалось загрузить баллы', "Ballarni yuklab bo'lmadi")}</p>
        <button className="btn secondary sm pill" onClick={load}>{tr('Повторить', 'Qayta urinish')}</button>
        <BottomNav active="loyalty" />
      </div>
    );
  }

  const txns = data?.transactions || [];

  return (
    <div className="anim-fade" style={{ paddingBottom: 'calc(var(--nav-h) + 12px)' }}>
      <div className="glass" style={{ position: 'sticky', top: 0, zIndex: 20, padding: 16, borderBottom: '0.5px solid var(--divider)' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{tr('Баллы', 'Ballar')}</h1>
      </div>

      {/* Balance card */}
      <div className="anim-scale" style={{ margin: '12px 12px 0', padding: '28px 24px', borderRadius: 20, background: 'linear-gradient(145deg, #00875a, #00b96b)', color: '#fff', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', bottom: -30, left: -10, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        <p style={{ fontSize: 14, opacity: 0.85, fontWeight: 500 }}>{tr('Ваш баланс', 'Balansingiz')}</p>
        <p style={{ fontSize: 48, fontWeight: 800, marginTop: 4, letterSpacing: -1 }}>{data?.balance || 0}</p>
        <p style={{ fontSize: 14, opacity: 0.75, marginTop: 2 }}>{tr('баллов', 'ball')}</p>
        {data?.config?.isEnabled && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.config.pointValue && (
              <p style={{ fontSize: 12, opacity: 0.75 }}>
                💸 1 {tr('балл', 'ball')} = {data.config.pointValue} {tr('сум', "so'm")} · {tr('используйте при оформлении', 'buyurtmada ishlating')}
              </p>
            )}
            {data.config.pointsPerUnit && data.config.unitAmount && (
              <p style={{ fontSize: 12, opacity: 0.75 }}>
                ⭐ {data.config.pointsPerUnit} {tr('балл за каждые', 'ball har')} {Number(data.config.unitAmount).toLocaleString(locale)} {tr('сум', "so'm")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tier card */}
      {data?.tier?.current && (
        <div style={{ margin: '10px 12px 16px', padding: '16px 18px', borderRadius: 16, background: 'var(--sec)', border: '1px solid var(--divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: data.tier.current.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                {locale === 'uz' ? data.tier.current.nameUz : data.tier.current.name}
              </span>
              <span style={{ fontSize: 12, color: 'var(--hint)', background: 'var(--bg)', borderRadius: 6, padding: '2px 7px' }}>
                {data.tier.current.multiplier}× {tr('баллов', 'ball')}
              </span>
            </div>
            {data.tier.next && (
              <span style={{ fontSize: 12, color: 'var(--hint)' }}>
                {locale === 'uz' ? data.tier.next.nameUz : data.tier.next.name} →
              </span>
            )}
          </div>
          {data.tier.next ? (
            <>
              <div style={{ height: 6, background: 'var(--divider)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${data.tier.progressPct}%`, background: data.tier.current.color, borderRadius: 99, transition: 'width .5s ease' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--hint)', marginTop: 5 }}>
                {Number(data.tier.totalSpent).toLocaleString(locale)} / {Number(data.tier.next.minSpend).toLocaleString(locale)} {tr('сум', "so'm")}
                {' '}· {tr('до уровня', 'darajagacha')} {locale === 'uz' ? data.tier.next.nameUz : data.tier.next.name}
              </p>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--hint)', marginTop: 2 }}>{tr('Максимальный уровень', 'Maksimal daraja')} 🏆</p>
          )}
        </div>
      )}

      {txns.length > 0 && (
        <div style={{ padding: '0 12px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, padding: '0 4px' }}>{tr('История', 'Tarix')}</h3>
          {txns.map((t: any, i: number) => (
            <div key={i} className={`anim-fade anim-d${Math.min(i, 5)}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--sec)', borderRadius: 'var(--radius)', marginBottom: 6 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{t.description}</p>
                <p style={{ color: 'var(--hint)', fontSize: 12, marginTop: 2 }}>{new Date(t.createdAt).toLocaleDateString(locale)}</p>
              </div>
              <span style={{ fontWeight: 700, fontSize: 16, color: t.points > 0 ? 'var(--success)' : 'var(--danger)' }}>{t.points > 0 ? '+' : ''}{t.points}</span>
            </div>
          ))}
        </div>
      )}

      {txns.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--hint)' }}>
          <p style={{ fontSize: 14 }}>{tr('Баллы начисляются за завершенные заказы', 'Ballar yakunlangan buyurtmalar uchun beriladi')}</p>
        </div>
      )}

      <BottomNav active="loyalty" />
    </div>
  );
}
