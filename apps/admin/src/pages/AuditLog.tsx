import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

const ACTION_LABELS: Record<string, { ru: string; uz: string }> = {
  'store.create':              { ru: 'Магазин создан',           uz: "Do'kon yaratildi" },
  'store.update':              { ru: 'Магазин обновлён',          uz: "Do'kon yangilandi" },
  'store.delete':              { ru: 'Магазин удалён',            uz: "Do'kon o'chirildi" },
  'store.activate':            { ru: 'Бот активирован',           uz: 'Bot faollashtirildi' },
  'team.user.create':          { ru: 'Пользователь добавлен',     uz: "Foydalanuvchi qo'shildi" },
  'team.user.update':          { ru: 'Пользователь изменён',      uz: "Foydalanuvchi o'zgartirildi" },
  'team.user.reset-password':  { ru: 'Пароль сброшен',            uz: 'Parol tiklandi' },
  'order.delivery.update':     { ru: 'Доставка обновлена',        uz: 'Yetkazib berish yangilandi' },
  'order.payment.update':      { ru: 'Оплата обновлена',          uz: "To'lov yangilandi" },
  'loyalty.config.update':     { ru: 'Лояльность настроена',      uz: 'Sodiqlik sozlandi' },
  'delivery.zone.create':      { ru: 'Зона доставки создана',     uz: 'Yetkazib berish zonasi yaratildi' },
  'delivery.zone.update':      { ru: 'Зона доставки обновлена',   uz: 'Yetkazib berish zonasi yangilandi' },
  'delivery.zone.delete':      { ru: 'Зона доставки удалена',     uz: "Yetkazib berish zonasi o'chirildi" },
  'payment.method.create':     { ru: 'Способ оплаты добавлен',    uz: "To'lov usuli qo'shildi" },
  'payment.method.update':     { ru: 'Способ оплаты изменён',     uz: "To'lov usuli o'zgartirildi" },
  'payment.method.delete':     { ru: 'Способ оплаты удалён',      uz: "To'lov usuli o'chirildi" },
};

const CATEGORY_LABELS: Record<string, { ru: string; uz: string }> = {
  '':          { ru: 'Все', uz: 'Barchasi' },
  'store':     { ru: 'Магазин', uz: "Do'kon" },
  'team':      { ru: 'Команда', uz: 'Jamoa' },
  'order':     { ru: 'Заказы', uz: 'Buyurtmalar' },
  'delivery':  { ru: 'Доставка', uz: 'Yetkazib berish' },
  'loyalty':   { ru: 'Лояльность', uz: 'Sodiqlik' },
  'payment':   { ru: 'Оплата', uz: "To'lov" },
};

export default function AuditLog() {
  const { tr, locale } = useAdminI18n();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState('');

  function load() {
    setLoading(true);
    setError(false);
    adminApi.getAuditLogs(100)
      .then((data: any) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function actionLabel(action: string) {
    const entry = ACTION_LABELS[action];
    if (!entry) return action;
    return tr(entry.ru, entry.uz);
  }

  const filteredLogs = category
    ? logs.filter((l) => l.action.startsWith(category + '.'))
    : logs;

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div className="sg-skeleton" style={{ height: 28, width: '30%' }} />
        <div className="sg-card sg-grid" style={{ gap: 10 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #edf2ee' }}>
              <div className="sg-skeleton" style={{ height: 14, width: 140 }} />
              <div className="sg-skeleton" style={{ height: 14, width: 180 }} />
              <div className="sg-skeleton" style={{ height: 14, flex: 1 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <header>
          <h2 className="sg-title">{tr('Журнал действий', 'Harakatlar jurnali')}</h2>
        </header>
        <div className="sg-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#be123c' }}>{tr('Не удалось загрузить журнал', "Jurnal yuklanmadi")}</p>
          <button className="sg-btn ghost" style={{ marginTop: 14 }} onClick={load}>{tr('Повторить', 'Qayta urinish')}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header>
        <h2 className="sg-title">{tr('Журнал действий', 'Harakatlar jurnali')}</h2>
        <p className="sg-subtitle">{tr('Последние 100 действий администраторов', "So'nggi 100 ta admin harakati")}</p>
      </header>

      <div className="sg-pill-row" style={{ flexWrap: 'wrap' }}>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={`sg-pill${category === key ? ' active' : ''}`}
          >
            {tr(label.ru, label.uz)}
          </button>
        ))}
      </div>

      <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredLogs.length === 0 ? (
          <p className="sg-subtitle" style={{ padding: '24px 16px' }}>{tr('Действий пока нет', "Harakatlar yo'q")}</p>
        ) : (
          <table className="sg-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ whiteSpace: 'nowrap' }}>{tr('Дата', 'Sana')}</th>
                <th>{tr('Действие', 'Harakat')}</th>
                <th>{tr('Исполнитель', 'Ijrochi')}</th>
                <th>{tr('Детали', 'Tafsilotlar')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#748278' }}>
                    {new Date(log.createdAt).toLocaleString(locale)}
                  </td>
                  <td>
                    <span className="sg-badge" style={{ background: '#f3f4f6', color: '#1f2937', fontWeight: 600 }}>
                      {actionLabel(log.action)}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {log.actor ? (log.actor.name || log.actor.email) : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ fontSize: 12, color: '#5f6d64', maxWidth: 260 }}>
                    {log.details ? (
                      <span title={JSON.stringify(log.details, null, 2)}>
                        {Object.entries(log.details as Record<string, unknown>)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')}
                      </span>
                    ) : (
                      log.targetId ? <span style={{ color: '#9ca3af' }}>{log.targetId}</span> : <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
