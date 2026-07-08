import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';

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

  const columns: TableColumn<any>[] = [
    {
      key: 'date',
      header: tr('Дата', 'Sana'),
      width: 160,
      render: (log) => <span className="whitespace-nowrap text-token-xs text-neutral-500">{new Date(log.createdAt).toLocaleString(locale)}</span>,
    },
    {
      key: 'action',
      header: tr('Действие', 'Harakat'),
      render: (log) => <Badge variant="neutral">{actionLabel(log.action)}</Badge>,
    },
    {
      key: 'actor',
      header: tr('Исполнитель', 'Ijrochi'),
      render: (log) => log.actor ? (log.actor.name || log.actor.email) : <span className="text-neutral-400">—</span>,
    },
    {
      key: 'details',
      header: tr('Детали', 'Tafsilotlar'),
      render: (log) => (
        <span className="text-token-xs text-neutral-500 max-w-[260px]">
          {log.details ? (
            <span title={JSON.stringify(log.details, null, 2)}>
              {Object.entries(log.details as Record<string, unknown>)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ')}
            </span>
          ) : (
            log.targetId ? <span className="text-neutral-400">{log.targetId}</span> : <span className="text-neutral-400">—</span>
          )}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <div className="h-7 w-[30%] rounded-token-sm bg-neutral-100 animate-pulse" />
        <Card className="flex flex-col gap-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 py-2.5 border-b border-neutral-100 last:border-0">
              <div className="h-3.5 w-[140px] rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-3.5 w-[180px] rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-3.5 flex-1 rounded-token-sm bg-neutral-100 animate-pulse" />
            </div>
          ))}
        </Card>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Журнал действий', 'Harakatlar jurnali')}</h2>
        </header>
        <Card className="text-center py-8 px-4">
          <p className="m-0 font-semibold text-danger">{tr('Не удалось загрузить журнал', "Jurnal yuklanmadi")}</p>
          <Button variant="ghost" size="md" type="button" className="mt-3.5" onClick={load}>{tr('Повторить', 'Qayta urinish')}</Button>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Журнал действий', 'Harakatlar jurnali')}</h2>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Последние 100 действий администраторов', "So'nggi 100 ta admin harakati")}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={[
              'rounded-full border px-3 py-1.5 text-token-xs font-semibold transition-colors',
              category === key
                ? 'bg-neutral-800 border-neutral-800 text-white'
                : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50',
            ].join(' ')}
          >
            {tr(label.ru, label.uz)}
          </button>
        ))}
      </div>

      <Table
        columns={columns}
        data={filteredLogs}
        rowKey={(log) => log.id}
        emptyMessage={tr('Действий пока нет', "Harakatlar yo'q")}
      />
    </section>
  );
}
