import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import StarsPayButton from './StarsPayButton';

type NoticeTone = 'success' | 'error' | 'info';

export default function InvoicePayModal({
  invoice,
  bankDetails,
  tr,
  submitting,
  setSubmitting,
  paymentRef,
  setPaymentRef,
  onSubmit,
  onClose,
  showNotice,
}: {
  invoice: any;
  bankDetails: any;
  tr: (ru: string, uz: string) => string;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  paymentRef: string;
  setPaymentRef: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  showNotice: (tone: NoticeTone, msg: string) => void;
}) {
  const paymentMethods: { type: string }[] = bankDetails?.paymentMethods ?? [];
  const methods: { id: string; label: string }[] = [];

  const methodLabels: Record<string, string> = {
    bank: tr('Банк / перевод', 'Bank / o\'tkazma'),
    card: tr('Банк. карта', 'Bank kartasi'),
    payme: 'Payme',
    click: 'Click',
    stars: '⭐ Telegram Stars',
  };

  for (const m of paymentMethods) {
    if (methodLabels[m.type]) {
      methods.push({ id: m.type, label: methodLabels[m.type] });
    }
  }

  // Fallback: if no methods configured, show bank
  if (methods.length === 0 && bankDetails && Object.keys(bankDetails).length > 0) {
    methods.push({ id: 'bank', label: tr('Банк / перевод', 'Bank / o\'tkazma') });
  }

  const [method, setMethod] = useState(methods[0]?.id ?? 'stars');
  const [starsData, setStarsData] = useState<{ starsAmount: number; invoiceLink: string } | null>(null);
  const [starsFetching, setStarsFetching] = useState(false);

  async function fetchStars() {
    if (!invoice?.id || starsFetching) return;
    setStarsFetching(true);
    try {
      const res = await adminApi.payWithStars(invoice.id);
      setStarsData(res);
    } catch (e: any) {
      showNotice('error', e?.message || 'Ошибка');
    } finally {
      setStarsFetching(false);
    }
  }

  // Auto-fetch when Stars tab is active (including on initial render if it's the default)
  useEffect(() => {
    if (method === 'stars' && !starsData) {
      void fetchStars();
    }
  }, [method]); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectMethod(id: string) {
    setMethod(id);
  }

  // Fields for the currently selected non-stars method
  function getMethodFields(methodId: string) {
    const methodData = paymentMethods.find((m) => m.type === methodId);
    if (!methodData) return [];
    return Object.entries(methodData as Record<string, string>)
      .filter(([k, v]) => k !== 'type' && v)
      .map(([k, v]) => [k, v] as [string, string]);
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-[480px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">
            {tr('Оплата счёта', "Hisob to'lovi")}
          </h3>
          <button onClick={onClose} className="bg-transparent border-none text-token-xl cursor-pointer text-neutral-500 leading-none px-1.5 py-0.5">×</button>
        </div>

        <div className="mb-3.5 px-3 py-2.5 bg-success/5 rounded-token-md text-token-sm">
          <span className="font-semibold">{tr('Тариф', 'Tarif')}: </span>{invoice?.plan}
          <span className="ml-3">
            <span className="font-semibold">{tr('Сумма', 'Summa')}: </span>
            {method === 'stars'
              ? starsFetching
                ? '...'
                : starsData
                  ? `⭐ ${starsData.starsAmount.toLocaleString()} Stars`
                  : '—'
              : invoice?.amount
                ? `${Number(invoice.amount).toLocaleString()} UZS`
                : '—'}
          </span>
        </div>

        {/* Method tabs */}
        <div className="flex gap-1.5 mb-4">
          {methods.map((m) => (
            <Button
              key={m.id}
              onClick={() => void selectMethod(m.id)}
              className={[
                'flex-1 rounded-token-md text-token-sm px-2.5 py-2 transition-colors',
                method === m.id
                  ? 'border-2 border-accent-600 bg-accent-600/10 text-accent-600 font-semibold'
                  : 'border border-neutral-200 bg-white text-neutral-500 font-medium',
              ].join(' ')}
            >
              {m.label}
            </Button>
          ))}
        </div>

        {method !== 'stars' && (
          <div>
            {(() => {
              const fields = getMethodFields(method);
              return fields.length > 0 ? (
                <div className="mb-3.5 px-3 py-2.5 bg-neutral-50 rounded-token-md">
                  {fields.map(([key, val]) => (
                    <div key={key} className="flex justify-between text-token-sm py-1">
                      <span className="text-neutral-500 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="font-semibold text-right max-w-[60%] break-all">{val}</span>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
            <label className="block text-token-sm font-semibold mb-1.5 text-neutral-700">
              {tr('Номер транзакции / чек', 'Tranzaksiya raqami / chek')}
            </label>
            <Input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder={tr('Введите номер транзакции', 'Tranzaksiya raqamini kiriting')}
              className="mb-3.5"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={onSubmit}
                disabled={submitting || !paymentRef.trim()}
                className="flex-1"
              >
                {submitting ? '...' : tr('Отправить', 'Yuborish')}
              </Button>
              <Button variant="ghost" size="md" onClick={onClose} className="flex-1">
                {tr('Отмена', 'Bekor qilish')}
              </Button>
            </div>
          </div>
        )}

        {method === 'stars' && (
          <div>
            <p className="mt-0 mb-3.5 text-token-sm text-neutral-500">
              {tr(
                'Оплата через Telegram Stars. После оплаты подписка активируется автоматически.',
                "Telegram Stars orqali to'lov. To'lovdan so'ng obuna avtomatik faollashadi."
              )}
            </p>
            <StarsPayButton
              invoiceId={invoice?.id}
              prefetched={starsData}
              tr={tr}
              submitting={submitting || starsFetching}
              setSubmitting={setSubmitting}
              showNotice={showNotice}
            />
            <Button variant="ghost" size="md" onClick={onClose} className="w-full mt-2.5">
              {tr('Закрыть', 'Yopish')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
