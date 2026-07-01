# ARCUS + SetRetail10: Текущий статус (2026-03-21)

## Цель

Интеграция пинпада PAX (A35/A36) с Linux-кассой по протоколу ARCUS и подготовка к плагину Set Retail 10.

## К чему пришли

1. Связь с пинпадом через ARCUS на текущей машине работает.
2. Рабочая схема: Windows + WSL + ARCUS `commandLineTool` + HTTP bridge.
3. Порт определяется стабильно (приоритет by-id/by-path, затем `/dev/ttyACM*`), решена проблема плавающего `ttyACM0/1`.
4. Команды ARCUS подтверждены:
   - продажа: `/o1 /a{amount} /c860`
   - возврат: `/o3 /a{amount} /c860 /r{rrn}`

## Что достигли по коду

1. Реализован bridge:
   - файл: `scripts/arcus-bridge.js`
   - API: `/api/sale`, `/api/refund`, `/api/cancel-last`, `/api/cancel`, `/api/settlement`, `/api/run`, `/api/ping`, `/health`, `/ports`.
2. Парсинг результатов операции сделан из:
   - `output.dat`
   - `output_ex.dat`
   - `output_ex.txt`
   - `rc.out`
   - `cheq.out`
3. Добавлены нормализованные поля для фискализации:
   - `fiscalization.rrn`
   - `fiscalization.cardFirst4`
   - `fiscalization.cardLast4`
   - `fiscalization.authCode`
   - `fiscalization.terminalId`
   - `fiscalization.receiptNumber`
4. Поддержаны форматы полей:
   - `RRN=335207521850`
   - `RRN: 335207521850,`
   - `PAN=986008******3743`
   - `CARD: 626291******1516(БЕСКОНТАКТ(W))`
5. В `data` добавляются каноничные ключи:
   - `RRN`, `CARD_FIRST4`, `CARD_LAST4`, `CARD_MASK`, `AUTH_CODE`, `TERMINAL_ID`, `RECEIPT_NUMBER`.

## Что хранить в чеке (обязательно)

После успешной продажи сохранять:

1. `rrn`
2. `cardFirst4`
3. `cardLast4`
4. рекомендуется также `authCode`, `terminalId`, `receiptNumber`

Это нужно для:

1. фискализации
2. возврата по RRN (`/r{rrn}`)
3. выгрузки/аудита на стороне кассы и ERP

## По Set Retail 10

Изучены SDK и руководство:

1. Базовый контракт: `PaymentPlugin` (`doPayment`, `doPaymentCancel`, `doRefund`, `isAvailable`).
2. Для возвратов по чеку рекомендовано добавить:
   - `RefundPreparationPlugin`
   - `TransactionalRefundPlugin`
3. `metainf.xml` обязателен:
   - `SetIntegration` -> `ExternalService serviceType="PAYMENT"` -> `PaymentPlugin paymentType="ELECTRONIC"`.
4. `PersistedField` использовать для полей оплаты, которые должны быть видны в Опердне и уходить в ERP.

## Открытые вопросы / следующий шаг

1. Собрать production-плагин Set10 (`ArcusPaymentPlugin`) поверх текущего bridge.
2. Привязать PersistedField к данным из `fiscalization`.
3. Прогнать приемочные сценарии из `checklists/Payment_checklist.pdf`:
   - sale
   - cancel
   - full/partial refund
   - timeout/no-link
   - ERP export
