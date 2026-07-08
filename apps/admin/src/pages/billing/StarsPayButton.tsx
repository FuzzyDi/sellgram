import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import Button from '../../components/Button';

type NoticeTone = 'success' | 'error' | 'info';

export default function StarsPayButton({ invoiceId, prefetched, tr, submitting, setSubmitting, showNotice }: {
  invoiceId: string;
  prefetched?: { starsAmount: number; invoiceLink: string } | null;
  tr: (ru: string, uz: string) => string;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  showNotice: (tone: NoticeTone, msg: string) => void;
}) {
  const [invoiceLink, setInvoiceLink] = useState<string | null>(prefetched?.invoiceLink ?? null);

  useEffect(() => {
    if (prefetched?.invoiceLink) setInvoiceLink(prefetched.invoiceLink);
  }, [prefetched?.invoiceLink]);

  async function handleClick() {
    if (invoiceLink) { window.open(invoiceLink, '_blank'); return; }
    setSubmitting(true);
    try {
      const res = await adminApi.payWithStars(invoiceId);
      setInvoiceLink(res.invoiceLink);
      window.open(res.invoiceLink, '_blank');
    } catch (e: any) {
      showNotice('error', e?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        onClick={handleClick}
        disabled={submitting}
        className="bg-[#f5c842] text-[#1a1a1a] rounded-token-md px-5 py-2.5 text-token-sm font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {submitting ? '...' : invoiceLink ? tr('Открыть в Telegram ↗', "Telegramda ochish ↗") : tr('Оплатить ⭐ Stars', "⭐ Stars bilan to'lash")}
      </Button>
      {invoiceLink && (
        <p className="m-0 text-token-xs text-neutral-500">
          {tr('Ссылка создана. Если не открылось — ', "Havola yaratildi. Ochilmasa — ")}
          <a href={invoiceLink} target="_blank" rel="noreferrer" className="text-accent-600">{tr('нажмите здесь', 'bu yerni bosing')}</a>
        </p>
      )}
    </div>
  );
}
