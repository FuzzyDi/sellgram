import React, { useEffect, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { BottomNav } from './Catalog';
import { useMiniI18n } from '../i18n';

export default function Profile() {
  const { tr, locale } = useMiniI18n();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editPhone, setEditPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    api.getProfile()
      .then((d) => { setProfile(d); setPhone(d.phone || ''); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function savePhone() {
    if (!phone.trim()) return;
    setSaving(true);
    try {
      await api.updateProfile({ phone: phone.trim() });
      setProfile((p: any) => ({ ...p, phone: phone.trim() }));
      setEditPhone(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* keep editing */ }
    finally { setSaving(false); }
  }

  const initials = profile
    ? ((profile.firstName?.[0] || '') + (profile.lastName?.[0] || '')).toUpperCase() || '?'
    : '?';

  const displayName = profile
    ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.telegramUser || '—'
    : '—';

  if (loading) {
    return (
      <div style={{ padding: 16, paddingBottom: 'calc(var(--nav-h) + 12px)' }}>
        <div className="skeleton" style={{ height: 80, width: 80, borderRadius: '50%', margin: '32px auto 16px' }} />
        <div className="skeleton" style={{ height: 20, width: 160, margin: '0 auto 8px' }} />
        <div className="skeleton" style={{ height: 14, width: 120, margin: '0 auto 24px' }} />
        {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius)', marginBottom: 10 }} />)}
        <BottomNav active="profile" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center', paddingBottom: 'calc(var(--nav-h) + 12px)' }}>
        <p className="error-banner" style={{ marginBottom: 12 }}>{tr('Не удалось загрузить профиль', "Profilni yuklab bo'lmadi")}</p>
        <button className="btn secondary sm pill" onClick={load}>{tr('Повторить', 'Qayta urinish')}</button>
        <BottomNav active="profile" />
      </div>
    );
  }

  return (
    <div className="anim-fade" style={{ paddingBottom: 'calc(var(--nav-h) + 12px)' }}>
      {/* Header */}
      <div className="glass" style={{ position: 'sticky', top: 0, zIndex: 20, padding: '12px 16px', borderBottom: '0.5px solid var(--divider)' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{tr('Профиль', 'Profil')}</h1>
      </div>

      <div style={{ padding: '24px 16px 0' }}>
        {/* Avatar + name */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', margin: '0 auto 12px',
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 700,
          }}>
            {initials}
          </div>
          <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>{displayName}</p>
          {profile?.telegramUser && (
            <p style={{ fontSize: 13, color: 'var(--hint)' }}>@{profile.telegramUser}</p>
          )}
          <p style={{ fontSize: 12, color: 'var(--hint)', marginTop: 4 }}>
            {tr('С нами с', "Biz bilan")} {new Date(profile?.createdAt).toLocaleDateString(locale)}
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { label: tr('Заказов', 'Buyurtma'), value: profile?.ordersCount ?? 0 },
            { label: tr('Потрачено', 'Sarflandi'), value: `${Number(profile?.totalSpent ?? 0).toLocaleString()} ${tr('сум', "so'm")}` },
            { label: tr('Баллов', 'Ball'), value: profile?.loyaltyPoints ?? 0 },
          ].map((s) => (
            <div key={s.label} style={{
              flex: 1, background: 'var(--sec)', borderRadius: 'var(--radius)',
              padding: '12px 8px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 11, color: 'var(--hint)', margin: 0, marginTop: 2 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Phone */}
        <div style={{ background: 'var(--sec)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--hint)', margin: '0 0 4px' }}>{tr('Телефон', 'Telefon')}</p>
          {editPhone ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
                style={{
                  flex: 1, background: 'var(--bg)', border: '1px solid var(--divider)',
                  borderRadius: 10, padding: '8px 12px', fontSize: 15, color: 'var(--text)',
                }}
                autoFocus
              />
              <button
                onClick={savePhone}
                disabled={saving || !phone.trim()}
                className="btn sm"
                style={{ flexShrink: 0 }}
              >
                {saving ? '...' : tr('Сохранить', 'Saqlash')}
              </button>
              <button
                onClick={() => { setEditPhone(false); setPhone(profile?.phone || ''); }}
                className="btn secondary sm"
                style={{ flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: profile?.phone ? 600 : 400, color: profile?.phone ? 'var(--text)' : 'var(--hint)' }}>
                {profile?.phone || tr('Не указан', "Ko'rsatilmagan")}
              </span>
              <button
                onClick={() => setEditPhone(true)}
                className="btn secondary sm pill"
              >
                {tr('Изменить', "O'zgartirish")}
              </button>
            </div>
          )}
          {saved && <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 6 }}>{tr('Сохранено', 'Saqlandi')}</p>}
        </div>

        {/* Quick links */}
        {[
          { icon: '📦', label: tr('Мои заказы', 'Mening buyurtmalarim'), path: '/orders' },
          { icon: '⭐', label: tr('Бонусные баллы', 'Bonus ballar'), path: '/loyalty' },
          { icon: '❤️', label: tr('Избранное', 'Sevimlilar'), path: '/wishlist' },
        ].map((link) => (
          <button
            key={link.path}
            onClick={() => navigate(link.path)}
            className="pressable"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--sec)', borderRadius: 'var(--radius)', padding: '14px 16px',
              marginBottom: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 20 }}>{link.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{link.label}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--hint)', fontSize: 18 }}>›</span>
          </button>
        ))}
      </div>

      <BottomNav active="profile" />
    </div>
  );
}
