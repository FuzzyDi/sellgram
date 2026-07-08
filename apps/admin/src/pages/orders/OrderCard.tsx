import React from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import { useAdminI18n } from '../../i18n';
import { ORDER_STATUS_VARIANT, PAYMENT_STATUS_VARIANT } from './statusMeta';

interface OrderCardProps {
  order: any;
  pending: boolean;
  statusLabels: Record<string, string>;
  paymentLabels: Record<string, string>;
  expanded: boolean;
  orderDetail: any;
  onToggle: () => void;
  onStatusChange: (status: string) => void;
  onOpenShipDialog: () => void;
  onOpenActionDialog: (action: 'cancel' | 'refund') => void;
}

export default function OrderCard({
  order, pending, statusLabels, paymentLabels, expanded, orderDetail,
  onToggle, onStatusChange, onOpenShipDialog, onOpenActionDialog,
}: OrderCardProps) {
  const { tr, locale } = useAdminI18n();

  return (
    <Card>
      <div className="flex justify-between gap-2.5">
        <div>
          <div className="font-semibold text-token-lg text-neutral-800">
            {tr('Заказ', 'Buyurtma')} #{order.orderNumber}
          </div>
          <div className="mt-1 text-token-sm text-neutral-500">
            {order.customer?.firstName} {order.customer?.lastName}
            {order.customer?.telegramUser ? ` (@${order.customer.telegramUser})` : ''}
            {order.customer?.phone ? ` • ${order.customer.phone}` : ''}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          <Badge variant={ORDER_STATUS_VARIANT[order.status] || 'neutral'}>
            {statusLabels[order.status]}
          </Badge>
          <Badge variant={PAYMENT_STATUS_VARIANT[order.paymentStatus] || 'warning'}>
            {paymentLabels[order.paymentStatus] || order.paymentStatus}
          </Badge>
        </div>
      </div>

      <div className="text-token-sm text-neutral-600 mt-2">
        {order.items?.map((i: any) => `${i.name} x${i.qty}`).join(', ')}
      </div>

      <div className="flex justify-between items-center mt-3 gap-2.5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-token-xl font-semibold text-success">{Number(order.total).toLocaleString()} UZS</div>
          {order.promoCode && (
            <span className="font-mono text-token-xs font-semibold bg-accent-600/10 text-accent-600 px-2 py-0.5 rounded-token-sm">
              🏷 {order.promoCode.code}
            </span>
          )}
          {Number(order.loyaltyDiscount) > 0 && (
            <span className="text-token-xs font-semibold bg-success/10 text-success px-2 py-0.5 rounded-token-sm">
              ⭐ −{Number(order.loyaltyDiscount).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {order.status === 'NEW' && (
            <>
              <Button variant="primary" size="sm" type="button" disabled={pending} onClick={() => onStatusChange('CONFIRMED')}>
                {tr('Подтвердить', 'Tasdiqlash')}
              </Button>
              <Button variant="danger" size="sm" type="button" disabled={pending} onClick={() => onOpenActionDialog('cancel')}>
                {tr('Отменить', 'Bekor qilish')}
              </Button>
            </>
          )}
          {order.status === 'CONFIRMED' && (
            <>
              <Button variant="ghost" size="sm" type="button" disabled={pending} onClick={() => onStatusChange('PREPARING')}>
                {tr('Готовить', 'Tayyorlash')}
              </Button>
              <Button variant="danger" size="sm" type="button" disabled={pending} onClick={() => onOpenActionDialog('cancel')}>
                {tr('Отменить', 'Bekor qilish')}
              </Button>
            </>
          )}
          {order.status === 'PREPARING' && (
            <>
              <Button variant="ghost" size="sm" type="button" disabled={pending} onClick={() => onStatusChange('READY')}>
                {tr('Готов', 'Tayyor')}
              </Button>
              <Button variant="danger" size="sm" type="button" disabled={pending} onClick={() => onOpenActionDialog('cancel')}>
                {tr('Отменить', 'Bekor qilish')}
              </Button>
            </>
          )}
          {order.status === 'READY' && (
            <>
              <Button variant="ghost" size="sm" type="button" disabled={pending} onClick={onOpenShipDialog}>
                {tr('Отправить', "Jo'natish")}
              </Button>
              <Button variant="danger" size="sm" type="button" disabled={pending} onClick={() => onOpenActionDialog('cancel')}>
                {tr('Отменить', 'Bekor qilish')}
              </Button>
            </>
          )}
          {order.status === 'SHIPPED' && (
            <Button variant="ghost" size="sm" type="button" disabled={pending} onClick={() => onStatusChange('DELIVERED')}>
              {tr('Доставлен', 'Yetkazildi')}
            </Button>
          )}
          {order.status === 'DELIVERED' && (
            <>
              <Button variant="primary" size="sm" type="button" disabled={pending} onClick={() => onStatusChange('COMPLETED')}>
                {tr('Завершить', 'Yakunlash')}
              </Button>
              <Button variant="danger" size="sm" type="button" disabled={pending} onClick={() => onOpenActionDialog('refund')}>
                {tr('Возврат', 'Qaytarish')}
              </Button>
            </>
          )}
          {order.status === 'COMPLETED' && (
            <Button variant="danger" size="sm" type="button" disabled={pending} onClick={() => onOpenActionDialog('refund')}>
              {tr('Возврат', 'Qaytarish')}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex justify-between items-center">
        <span className="text-token-xs text-neutral-400">{new Date(order.createdAt).toLocaleString(locale)}</span>
        <button
          type="button"
          onClick={onToggle}
          className="bg-transparent border-none cursor-pointer text-token-xs text-neutral-500 px-1.5 py-0.5"
        >
          {expanded ? '▲' : '▼'} {tr('История', 'Tarix')}
        </button>
      </div>

      {expanded && (
        <div className="mt-2.5 border-t border-neutral-200 pt-2.5">
          {order.cancelReason && (
            <div className="mb-2 px-2.5 py-2 bg-danger/10 rounded-token-md text-token-sm">
              <span className="font-semibold text-danger">{tr('Причина: ', 'Sabab: ')}</span>
              <span className="text-danger">{order.cancelReason}</span>
            </div>
          )}
          {order.refundAmount != null && (
            <div className="mb-2 px-2.5 py-2 bg-warning/10 rounded-token-md text-token-sm">
              <span className="font-semibold text-warning">{tr('Сумма возврата: ', 'Qaytarish summasi: ')}</span>
              <span className="text-warning">{Number(order.refundAmount).toLocaleString()} UZS</span>
            </div>
          )}
          {!orderDetail ? (
            <div className="flex flex-col gap-1.5">
              {[1, 2].map((i) => (
                <div key={i} className={`h-3 rounded-token-sm bg-neutral-100 animate-pulse ${i === 1 ? 'w-3/5' : 'w-2/5'}`} />
              ))}
            </div>
          ) : orderDetail?.statusHistory?.length === 0 ? (
            <p className="m-0 text-token-xs text-neutral-400">{tr('История изменений пуста', "O'zgarishlar tarixi bo'sh")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(orderDetail?.statusHistory || []).map((h: any, idx: number) => (
                <div key={h.id} className="flex gap-2.5 items-start text-token-xs">
                  <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${idx === 0 ? 'bg-success' : 'bg-neutral-300'}`} />
                  <div className="flex-1">
                    <div className="flex gap-1.5 flex-wrap items-center">
                      {h.fromStatus && (
                        <>
                          <Badge variant="neutral">{statusLabels[h.fromStatus] || h.fromStatus}</Badge>
                          <span className="text-neutral-400">→</span>
                        </>
                      )}
                      <Badge variant={ORDER_STATUS_VARIANT[h.toStatus] || 'neutral'}>{statusLabels[h.toStatus] || h.toStatus}</Badge>
                    </div>
                    <div className="mt-0.5 text-neutral-400">
                      {h.actor ? (h.actor.name || h.actor.email) : tr('Система', 'Tizim')}
                      {' · '}
                      {new Date(h.createdAt).toLocaleString(locale)}
                    </div>
                    {h.note && <div className="mt-0.5 text-neutral-500 italic">{h.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
