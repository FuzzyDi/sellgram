import React, { useState } from 'react';
import {
  ChevronDown, ChevronUp, Rocket, Bot, Package, ShoppingCart, Truck,
  Users, Star, Megaphone, UserCog, CreditCard, LifeBuoy, Webhook,
  ClipboardList, BarChart2, Tag, type LucideIcon,
} from 'lucide-react';
import { useAdminI18n } from '../i18n';

const SUPPORT_TG = 'https://t.me/sellgram_support';

// ─── Quick-start steps ────────────────────────────────────────────────────────

const QUICKSTART_STEPS = [
  {
    num: 1,
    icon: '🤖',
    titleRu: 'Получите токен бота',
    titleUz: 'Bot tokenini oling',
    descRu: 'Откройте @BotFather в Telegram → /newbot → придумайте имя и username. Скопируйте токен вида 123456:ABCdef…',
    descUz: "Telegram'da @BotFather → /newbot → nom va username kiriting. 123456:ABCdef… ko'rinishidagi tokenni nusxa oling.",
  },
  {
    num: 2,
    icon: '🏪',
    titleRu: 'Создайте магазин',
    titleUz: "Do'kon yarating",
    descRu: 'Настройки → Магазины → «+ Магазин». Вставьте токен и нажмите «Подключить». Webhook настраивается автоматически.',
    descUz: "Sozlamalar → Do'konlar → «+ Do'kon». Tokenni joylashtiring va «Ulash» ni bosing. Webhook avtomatik sozlanadi.",
  },
  {
    num: 3,
    icon: '📦',
    titleRu: 'Добавьте каталог',
    titleUz: 'Katalog qo\'shing',
    descRu: 'Каталог → Категории → создайте хотя бы одну. Затем Каталог → Товары → «+». Заполните название, цену, фото.',
    descUz: "Katalog → Toifalar → kamida bitta yarating. Keyin Katalog → Mahsulotlar → «+». Nom, narx, rasm kiriting.",
  },
  {
    num: 4,
    icon: '💳',
    titleRu: 'Настройте оплату',
    titleUz: "To'lovni sozlang",
    descRu: 'Настройки → Способы оплаты → добавьте Click или Payme (нужны merchant ID и секрет). Можно включить «Оплата при получении».',
    descUz: "Sozlamalar → To'lov usullari → Click yoki Payme qo'shing (merchant ID va secret kerak). «Qabul qilishda to'lash» ni ham yoqish mumkin.",
  },
  {
    num: 5,
    icon: '🚀',
    titleRu: 'Готово к работе',
    titleUz: 'Ishga tayyor',
    descRu: 'Откройте t.me/your_bot — магазин работает. Поделитесь ссылкой с первыми покупателями.',
    descUz: "t.me/your_bot ni oching — do'kon ishlayapti. Havola bilan birinchi xaridorlarga ulashing.",
  },
];

// ─── Order flow ───────────────────────────────────────────────────────────────

const ORDER_STATUSES = [
  { key: 'NEW',        labelRu: 'Новый',      labelUz: 'Yangi',        color: '#3b82f6', bg: '#eff6ff' },
  { key: 'CONFIRMED',  labelRu: 'Принят',     labelUz: 'Qabul',        color: '#8b5cf6', bg: '#f5f3ff' },
  { key: 'PREPARING',  labelRu: 'Готовится',  labelUz: 'Tayyorlanmoqda', color: '#f59e0b', bg: '#fffbeb' },
  { key: 'READY',      labelRu: 'Готов',      labelUz: 'Tayyor',       color: '#10b981', bg: '#ecfdf5' },
  { key: 'DELIVERING', labelRu: 'Доставка',   labelUz: 'Yetkazilmoqda', color: '#f97316', bg: '#fff7ed' },
  { key: 'COMPLETED',  labelRu: 'Выполнен',   labelUz: 'Bajarildi',    color: '#059669', bg: '#d1fae5' },
];

// ─── Plan comparison ──────────────────────────────────────────────────────────

interface PlanRow { featureRu: string; featureUz: string; free: string; pro: string; business: string }

const PLAN_ROWS: PlanRow[] = [
  { featureRu: 'Магазинов',            featureUz: "Do'konlar",           free: '1',       pro: '3',       business: '10' },
  { featureRu: 'Товаров',              featureUz: 'Mahsulotlar',         free: '30',      pro: '500',     business: '∞' },
  { featureRu: 'Заказов / месяц',      featureUz: 'Buyurtma / oy',       free: '50',      pro: '1 000',   business: '∞' },
  { featureRu: 'Зон доставки',         featureUz: 'Yetkazish zonalari',  free: '2',       pro: '10',      business: '∞' },
  { featureRu: 'Рассылки',             featureUz: 'Xabar yuborish',      free: '—',       pro: '✓',       business: '✓' },
  { featureRu: 'Экспорт CSV',          featureUz: 'CSV eksport',         free: '—',       pro: '✓',       business: '✓' },
  { featureRu: 'Аналитика',            featureUz: 'Analitika',           free: 'базовая', pro: '✓',       business: '✓' },
  { featureRu: 'Программа лояльности', featureUz: 'Loyallik dasturi',    free: '—',       pro: '✓',       business: '✓' },
  { featureRu: 'Промокоды',            featureUz: 'Promokodlar',         free: '—',       pro: '✓',       business: '✓' },
  { featureRu: 'Вебхуки / API',        featureUz: 'Webhook / API',       free: '—',       pro: '✓',       business: '✓' },
  { featureRu: 'Закупки (PO)',          featureUz: 'Xaridlar (PO)',       free: '—',       pro: '✓',       business: '✓' },
  { featureRu: 'Отчёты по расписанию', featureUz: 'Jadval hisobotlari',  free: '—',       pro: 'до 3',    business: '∞' },
  { featureRu: 'Поддержка',            featureUz: "Qo'llab-quvvatlash",  free: 'базовая', pro: 'приоритет', business: 'VIP' },
];

// ─── FAQ sections ─────────────────────────────────────────────────────────────

interface FaqItem { qRu: string; qUz: string; aRu: string; aUz: string }
interface FaqSection { id: string; icon: LucideIcon; titleRu: string; titleUz: string; items: FaqItem[] }

const FAQ_SECTIONS: FaqSection[] = [
  {
    id: 'bot',
    icon: Bot,
    titleRu: 'Магазины и боты',
    titleUz: "Do'konlar va botlar",
    items: [
      {
        qRu: 'Бот не отвечает покупателям — что делать?',
        qUz: "Bot xaridorlarga javob bermayapti — nima qilish kerak?",
        aRu: 'Настройки → Магазины → «Проверить бота». Убедитесь, что токен правильный и бот не заблокирован. Если покупатель заблокировал бота — уведомления ему не отправляются автоматически.',
        aUz: "Sozlamalar → Do'konlar → «Botni tekshirish». Token to'g'riligini va bot bloklanmaganligini tekshiring. Xaridor botni bloklagan bo'lsa — bildirishnomalar avtomatik yuborilmaydi.",
      },
      {
        qRu: 'Что значит метка «Bot blocked» у покупателя?',
        qUz: "Xaridorda «Bot blocked» belgisi nimani anglatadi?",
        aRu: 'Значит, покупатель заблокировал вашего бота в Telegram. Такие пользователи исключаются из рассылок. Метка снимается автоматически, если клиент разблокирует бота.',
        aUz: "Xaridor Telegram'da sizning botingizni bloklagan. Bunday foydalanuvchilar xabar yuborishdan chiqariladi. Belgi — mijoz botni blokdan chiqarsa avtomatik tushadi.",
      },
      {
        qRu: 'Можно подключить несколько магазинов?',
        qUz: "Bir nechta do'kon ulash mumkinmi?",
        aRu: 'Да. PRO позволяет до 3 магазинов, BUSINESS — без ограничений. Каждый магазин — отдельный Telegram-бот с независимым каталогом.',
        aUz: "Ha. PRO — 3 tagacha do'kon, BUSINESS — cheksiz. Har bir do'kon — mustaqil katalogga ega alohida Telegram bot.",
      },
    ],
  },
  {
    id: 'catalog',
    icon: Package,
    titleRu: 'Каталог и товары',
    titleUz: 'Katalog va mahsulotlar',
    items: [
      {
        qRu: 'Как добавить товар с вариантами?',
        qUz: "Variantli mahsulot qanday qo'shiladi?",
        aRu: 'Создайте товар → раздел «Варианты» → «+ Вариант». Укажите название (напр. «Размер S»), цену и остаток для каждого варианта. В miniapp покупатель выбирает вариант перед заказом.',
        aUz: "Mahsulot yarating → «Variantlar» → «+ Variant». Har bir variant uchun nom (mas. «S o'lcham»), narx va qoldiq kiriting. Miniapp'da xaridor buyurtmadan oldin variantni tanlaydi.",
      },
      {
        qRu: 'Как работают баннеры?',
        qUz: 'Bannerlar qanday ishlaydi?',
        aRu: 'Маркетинг → Баннеры. Баннеры показываются в верхней части miniapp в виде слайдера. Можно добавить ссылку на категорию или конкретный товар.',
        aUz: "Marketing → Bannerlar. Bannerlar miniapp'ning yuqori qismida slayder ko'rinishida ko'rsatiladi. Toifa yoki mahsulotga havola qo'shish mumkin.",
      },
      {
        qRu: 'Что такое «Неактивный» товар?',
        qUz: "«Nofaol» mahsulot nima?",
        aRu: 'Неактивный товар скрыт из магазина, но не удалён. Удобно для сезонных товаров или временно недоступных позиций.',
        aUz: "Nofaol mahsulot do'kondan yashiriladi, lekin o'chirilmaydi. Mavsumiy yoki vaqtincha mavjud bo'lmagan mahsulotlar uchun qulay.",
      },
    ],
  },
  {
    id: 'orders',
    icon: ShoppingCart,
    titleRu: 'Заказы',
    titleUz: 'Buyurtmalar',
    items: [
      {
        qRu: 'Покупатель получает уведомления о статусах?',
        qUz: 'Xaridor status haqida bildirishnomalar oladimi?',
        aRu: 'Да — при каждой смене статуса заказа покупатель получает сообщение в Telegram. Исключение: покупатель заблокировал бота.',
        aUz: "Ha — buyurtma har safar status o'zgarganda xaridor Telegram'da xabar oladi. Istisno: xaridor botni bloklagan bo'lsa.",
      },
      {
        qRu: 'Заказ отменяется автоматически?',
        qUz: 'Buyurtma avtomatik bekor qilinadimi?',
        aRu: 'Да. Если заказ со статусом NEW не подтверждён в течение 24 часов — он автоматически переходит в CANCELLED. Остатки при этом восстанавливаются.',
        aUz: "Ha. NEW statusidagi buyurtma 24 soat ichida tasdiqlanmasa — avtomatik CANCELLED ga o'tadi. Qoldiqlar tiklanadi.",
      },
      {
        qRu: 'Как отфильтровать заказы по оплате?',
        qUz: 'Buyurtmalarni to\'lov bo\'yicha qanday filtrlash mumkin?',
        aRu: 'На странице Заказов используйте фильтр «Оплата» — выберите PAID, PENDING или FAILED. Можно также экспортировать отфильтрованный список в CSV.',
        aUz: "Buyurtmalar sahifasida «To'lov» filtridan foydalaning — PAID, PENDING yoki FAILED ni tanlang. Filtrlangan ro'yxatni CSV ga eksport qilish ham mumkin.",
      },
    ],
  },
  {
    id: 'delivery',
    icon: Truck,
    titleRu: 'Доставка',
    titleUz: 'Yetkazib berish',
    items: [
      {
        qRu: 'Как настроить бесплатную доставку?',
        qUz: "Bepul yetkazib berishni qanday sozlash mumkin?",
        aRu: 'Настройки → Доставка → зона → поле «Бесплатно от». Если сумма заказа ≥ этого значения — доставка 0.',
        aUz: "Sozlamalar → Yetkazib berish → hudud → «Bepul dan» maydoni. Buyurtma summasi ≥ bu qiymatga teng bo'lsa — yetkazib berish 0.",
      },
      {
        qRu: 'Можно настроить самовывоз?',
        qUz: "O'zi olib ketishni sozlash mumkinmi?",
        aRu: 'Да. Создайте зону доставки с типом «Самовывоз» и ценой 0. Покупатель выберет её при оформлении заказа.',
        aUz: "Ha. «O'zi olib ketish» turida va narxi 0 yetkazib berish hududini yarating. Xaridor buyurtma berishda uni tanlaydi.",
      },
    ],
  },
  {
    id: 'customers',
    icon: Users,
    titleRu: 'Покупатели',
    titleUz: 'Xaridorlar',
    items: [
      {
        qRu: 'Что такое теги и зачем они?',
        qUz: 'Teglar nima va nima uchun kerak?',
        aRu: 'Теги — ваши внутренние метки (VIP, Оптовик, и т.д.). Используются для сегментации при рассылках: отправьте акцию только «VIP»-клиентам.',
        aUz: "Teglar — ichki belgilar (VIP, Ulgurji va h.k.). Xabar yuborishda segmentatsiya uchun ishlatiladi: faqat «VIP» mijozlarga aksiya yuboring.",
      },
      {
        qRu: 'Как экспортировать базу покупателей?',
        qUz: "Xaridorlar bazasini qanday eksport qilish mumkin?",
        aRu: 'Покупатели → кнопка «Экспорт CSV». Экспорт доступен на тарифах PRO/BUSINESS. Лимит: 5 экспортов в минуту, до 10 000 строк в файле.',
        aUz: "Xaridorlar → «CSV eksport» tugmasi. Eksport PRO/BUSINESS tariflarida mavjud. Limit: daqiqada 5 eksport, faylda 10 000 qatorgacha.",
      },
      {
        qRu: 'Что такое реферальная программа?',
        qUz: 'Referal dasturi nima?',
        aRu: 'У каждого покупателя есть реферальная ссылка. Когда новый клиент регистрируется по ней — оба получают бонусные баллы (настраивается в Настройки → Лояльность).',
        aUz: "Har bir xaridorning referal havolasi bor. Yangi mijoz u orqali ro'yxatdan o'tganda — ikkalasi ham bonus ball oladi (Sozlamalar → Loyallik da sozlanadi).",
      },
    ],
  },
  {
    id: 'loyalty',
    icon: Star,
    titleRu: 'Программа лояльности',
    titleUz: 'Loyallik dasturi',
    items: [
      {
        qRu: 'Как работают баллы?',
        qUz: 'Ballar qanday ishlaydi?',
        aRu: 'Настройки → Лояльность. Задайте: за каждые N сум → M баллов. При оплате: 1 балл = K сум, макс. X% от заказа. Баллы начисляются при COMPLETED, списываются при CANCELLED.',
        aUz: "Sozlamalar → Loyallik. Belgilang: har N so'm → M ball. To'lovda: 1 ball = K so'm, maks. X% buyurtmadan. Ballar COMPLETED da hisoblanadi, CANCELLED da yechiladi.",
      },
      {
        qRu: 'Что такое уровни лояльности?',
        qUz: 'Loyallik darajalari nima?',
        aRu: 'Можно настроить уровни (Bronze/Silver/Gold) с разными коэффициентами начисления баллов. Покупатель переходит на следующий уровень по сумме выполненных заказов.',
        aUz: "Turli ball hisoblash koeffitsientlari bilan darajalar (Bronze/Silver/Gold) sozlanishi mumkin. Xaridor bajarilgan buyurtmalar summasiga ko'ra keyingi darajaga o'tadi.",
      },
      {
        qRu: 'Как скорректировать баллы вручную?',
        qUz: "Ballarni qo'lda qanday sozlash mumkin?",
        aRu: 'Покупатели → откройте клиента → раздел «Лояльность» → «Скорректировать». Введите количество баллов (положительное или отрицательное) и причину.',
        aUz: "Xaridorlar → mijozni oching → «Loyallik» → «Tuzatish». Ballar sonini (musbat yoki manfiy) va sababini kiriting.",
      },
    ],
  },
  {
    id: 'broadcasts',
    icon: Megaphone,
    titleRu: 'Рассылки',
    titleUz: 'Xabar yuborish',
    items: [
      {
        qRu: 'Кому отправляется рассылка?',
        qUz: 'Xabar kimga yuboriladi?',
        aRu: 'Всем активным покупателям, которые не заблокировали бота. Можно сузить: по тегам, по активности (купившие за N дней). Исключённые пользователи не считаются в статистике.',
        aUz: "Botni bloklamagan barcha faol xaridorlarga. Toraylash mumkin: teglar bo'yicha, faollik bo'yicha (N kun ichida xarid qilganlar). Chiqarilgan foydalanuvchilar statistikada hisoblanmaydi.",
      },
      {
        qRu: 'Рассылка отправляется сразу?',
        qUz: 'Xabar darhol yuboriladimi?',
        aRu: 'Нет — рассылка ставится в очередь и отправляется с ограничением ~30 сообщений/сек. На 1000 получателей уйдёт ~30 секунд. Можно запланировать на конкретную дату/время.',
        aUz: "Yo'q — xabar navbatga qo'yiladi va ~30 xabar/soniya tezlikda yuboriladi. 1000 qabul qiluvchi uchun ~30 soniya ketadi. Aniq sana/vaqtga rejalashtirish mumkin.",
      },
      {
        qRu: 'Что такое статус «failed» в рассылке?',
        qUz: "Xabar yuborishda «failed» statusi nima?",
        aRu: 'Сообщение не доставлено: покупатель заблокировал бота, или временная ошибка Telegram. Система помечает клиента «bot blocked» при 403-ошибке.',
        aUz: "Xabar yetkazilmadi: xaridor botni bloklagan yoki Telegram vaqtinchalik xatosi. Tizim 403-xatoda mijozni «bot blocked» deb belgilaydi.",
      },
    ],
  },
  {
    id: 'payments',
    icon: CreditCard,
    titleRu: 'Оплата',
    titleUz: "To'lov",
    items: [
      {
        qRu: 'Какие платёжные системы поддерживаются?',
        qUz: "Qanday to'lov tizimlari qo'llab-quvvatlanadi?",
        aRu: 'Click и Payme (интернет-эквайринг), а также «Оплата при получении» (наличными или терминалом). Настройки → Способы оплаты.',
        aUz: "Click va Payme (internet-ekvayring), shuningdek «Qabul qilishda to'lash» (naqd yoki terminal). Sozlamalar → To'lov usullari.",
      },
      {
        qRu: 'Как подключить Click/Payme?',
        qUz: "Click/Payme qanday ulash mumkin?",
        aRu: 'Зарегистрируйтесь в Click Business или Payme Business, получите Merchant ID и Secret Key. Вставьте их в Настройки → Способы оплаты → соответствующий раздел.',
        aUz: "Click Business yoki Payme Business da ro'yxatdan o'ting, Merchant ID va Secret Key oling. Ularni Sozlamalar → To'lov usullari → tegishli bo'limga joylashtiring.",
      },
    ],
  },
  {
    id: 'team',
    icon: UserCog,
    titleRu: 'Команда и роли',
    titleUz: 'Jamoa va rollar',
    items: [
      {
        qRu: 'Какие роли существуют?',
        qUz: 'Qanday rollar mavjud?',
        aRu: 'OWNER — полный доступ. MANAGER — всё кроме управления владельцем. OPERATOR — только разрешённые разделы (настраивается точечно). Пригласите коллегу через Настройки → Команда.',
        aUz: "OWNER — to'liq kirish. MANAGER — egani boshqarishdan tashqari hamma narsa. OPERATOR — faqat ruxsat etilgan bo'limlar (alohida sozlanadi). Hamkorni Sozlamalar → Jamoa orqali taklif qiling.",
      },
      {
        qRu: 'Оператор может видеть финансовые данные?',
        qUz: 'Operator moliyaviy ma\'lumotlarni ko\'ra oladimi?',
        aRu: 'Только если владелец включил разрешение viewFinancials. По умолчанию оператор видит только свой набор разделов.',
        aUz: "Faqat egalik egasi viewFinancials ruxsatini yoqgan bo'lsa. Odatda operator faqat o'zining bo'limlari to'plamini ko'radi.",
      },
    ],
  },
  {
    id: 'webhooks',
    icon: Webhook,
    titleRu: 'Вебхуки и API',
    titleUz: 'Webhook va API',
    items: [
      {
        qRu: 'Что такое вебхуки?',
        qUz: 'Webhook nima?',
        aRu: 'Вебхук — это URL вашей системы, на который SellGram отправляет HTTP POST при событии (order.created, order.paid и т.д.). Доступно на тарифе BUSINESS.',
        aUz: "Webhook — bu voqea sodir bo'lganda (order.created, order.paid va h.k.) SellGram HTTP POST yuboradigan sizning tizimingiz URL manzili. BUSINESS tarifida mavjud.",
      },
      {
        qRu: 'Как проверить подлинность запроса?',
        qUz: 'So\'rov haqiqiyligini qanday tekshirish mumkin?',
        aRu: 'Каждый запрос содержит заголовок X-Webhook-Signature (HMAC-SHA256 подпись тела). Ключ — secret из карточки вебхука. Сравните подпись на своей стороне.',
        aUz: "Har bir so'rov X-Webhook-Signature sarlavhasini (tana HMAC-SHA256 imzosi) o'z ichiga oladi. Kalit — webhook kartasidagi secret. Imzoni o'z tomoningizda solishtiring.",
      },
      {
        qRu: 'Где взять API-ключ?',
        qUz: 'API kalitini qayerdan olish mumkin?',
        aRu: 'Настройки → API-ключи → «+ Создать». Ключ показывается один раз при создании. Срок действия: 90 дней (обновляется вручную). Лимит запросов: 60/мин.',
        aUz: "Sozlamalar → API kalitlari → «+ Yaratish». Kalit yaratishda bir marta ko'rsatiladi. Amal qilish muddati: 90 kun (qo'lda yangilanadi). So'rovlar limiti: 60/min.",
      },
    ],
  },
  {
    id: 'procurement',
    icon: ClipboardList,
    titleRu: 'Закупки',
    titleUz: 'Xaridlar (Zakupki)',
    items: [
      {
        qRu: 'Зачем нужен раздел Закупки?',
        qUz: 'Zakupki bo\'limi nima uchun kerak?',
        aRu: 'Для управления заказами поставщикам. Создайте поставщика → создайте заказ на закупку (PO) с позициями. При получении товара остатки пополняются автоматически.',
        aUz: "Ta'minotchilar buyurtmalarini boshqarish uchun. Ta'minotchi yarating → pozitsiyalar bilan xarid buyurtmasini (PO) yarating. Tovar qabul qilinganida qoldiqlar avtomatik to'ldiriladi.",
      },
      {
        qRu: 'Какие статусы у заказа закупки?',
        qUz: 'Xarid buyurtmasining statuslari qanday?',
        aRu: 'DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED → CANCELLED. При RECEIVED — остатки по всем позициям PO обновляются автоматически.',
        aUz: "DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED → CANCELLED. RECEIVED da — barcha PO pozitsiyalari bo'yicha qoldiqlar avtomatik yangilanadi.",
      },
    ],
  },
  {
    id: 'reports',
    icon: BarChart2,
    titleRu: 'Отчёты',
    titleUz: 'Hisobotlar',
    items: [
      {
        qRu: 'Какие отчёты доступны?',
        qUz: 'Qanday hisobotlar mavjud?',
        aRu: 'Продажи по дням/неделям, топ товаров, география, источники. На BUSINESS — расписание автоотчётов (CSV по email).',
        aUz: "Kunlik/haftalik savdolar, top mahsulotlar, geografiya, manbalar. BUSINESS da — avtohisobotlar jadvali (CSV elektron pochta orqali).",
      },
      {
        qRu: 'Как настроить автоматические отчёты?',
        qUz: 'Avtomatik hisobotlarni qanday sozlash mumkin?',
        aRu: 'Отчёты → «+ Расписание». Укажите тип отчёта, период, формат и периодичность (ежедневно/еженедельно). Отчёт придёт на email ответственного сотрудника.',
        aUz: "Hisobotlar → «+ Jadval». Hisobot turini, davrini, formatini va chastotasini belgilang (kunlik/haftalik). Hisobot mas'ul xodim elektron pochtasiga keladi.",
      },
    ],
  },
  {
    id: 'billing',
    icon: CreditCard,
    titleRu: 'Тарифы',
    titleUz: 'Tariflar',
    items: [
      {
        qRu: 'Что происходит при истечении тарифа?',
        qUz: 'Tarif muddati tugaganda nima bo\'ladi?',
        aRu: 'После истечения даётся 3-дневный льготный период — все функции работают. По истечении 3 дней — аккаунт переходит на FREE. Данные не удаляются.',
        aUz: "Muddati tugagach 3 kunlik imtiyozli davr beriladi — barcha funksiyalar ishlaydi. 3 kundan so'ng — akkaunt FREE ga o'tadi. Ma'lumotlar o'chirilmaydi.",
      },
      {
        qRu: 'Как оплатить?',
        qUz: "Qanday to'lash mumkin?",
        aRu: 'Биллинг → выберите план → нажмите «Оплатить». Переведите сумму по реквизитам и укажите payment reference. Тариф активируется после проверки администратором.',
        aUz: "Billing → reja tanlang → «To'lash» ni bosing. Rekvizitlar bo'yicha summani o'tkazing va payment reference kiriting. Tarif administrator tekshirgandan so'ng faollashtiriladi.",
      },
    ],
  },
  {
    id: 'audit',
    icon: Tag,
    titleRu: 'Журнал аудита',
    titleUz: 'Audit jurnali',
    items: [
      {
        qRu: 'Что фиксирует журнал аудита?',
        qUz: 'Audit jurnali nimani qayd etadi?',
        aRu: 'Все критические действия: смену статусов заказов, создание/изменение товаров, изменения в команде, смену тарифа, экспорт данных. Хранится 90 дней.',
        aUz: "Barcha muhim harakatlar: buyurtma statuslarini o'zgartirish, mahsulot yaratish/o'zgartirish, jamoada o'zgarishlar, tarif almashtirish, ma'lumot eksporti. 90 kun saqlanadi.",
      },
      {
        qRu: 'Кто может видеть журнал?',
        qUz: 'Jurnalni kim ko\'ra oladi?',
        aRu: 'OWNER и MANAGER с правом viewAuditLog. Доступно только на тарифе BUSINESS.',
        aUz: "OWNER va viewAuditLog huquqi bo'lgan MANAGER. Faqat BUSINESS tarifida mavjud.",
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Help() {
  const { tr } = useAdminI18n();
  const [openFaq, setOpenFaq] = useState<Set<string>>(new Set(['bot']));

  function toggleFaq(id: string) {
    setOpenFaq((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 24 }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header>
        <h2 className="sg-title">{tr('Справка', "Qo'llanma")}</h2>
        <p className="sg-subtitle">
          {tr(
            'Всё что нужно знать для работы с SellGram',
            "SellGram bilan ishlash uchun kerakli barcha ma'lumotlar",
          )}
        </p>
      </header>

      {/* ── Quick-start guide ───────────────────────────────────────────────── */}
      <div className="sg-card" style={{ padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #00875a, #00a86f)',
            display: 'grid', placeItems: 'center', fontSize: 18,
          }}>🚀</div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            {tr('Быстрый старт — 5 шагов', "Tezkor boshlash — 5 qadam")}
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {QUICKSTART_STEPS.map((step) => (
            <div key={step.num} style={{
              background: 'var(--sg-panel-2)',
              borderRadius: 12,
              padding: '14px 14px 12px',
              position: 'relative',
              border: '1px solid var(--sg-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, background: '#00875a',
                  color: '#fff', fontWeight: 900, fontSize: 13, flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                }}>{step.num}</div>
                <span style={{ fontSize: 20, lineHeight: 1, marginTop: 2 }}>{step.icon}</span>
              </div>
              <p style={{ margin: '10px 0 4px', fontWeight: 700, fontSize: 13, color: 'var(--sg-text)' }}>
                {tr(step.titleRu, step.titleUz)}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--sg-muted)', lineHeight: 1.5 }}>
                {tr(step.descRu, step.descUz)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Order status flow ───────────────────────────────────────────────── */}
      <div className="sg-card" style={{ padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: '#eff6ff', display: 'grid', placeItems: 'center',
          }}>
            <ShoppingCart size={18} color="#3b82f6" />
          </div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            {tr('Жизненный цикл заказа', "Buyurtma hayot tsikli")}
          </h3>
        </div>

        {/* Flow diagram */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
          padding: '12px 0',
        }}>
          {ORDER_STATUSES.map((s, i) => (
            <React.Fragment key={s.key}>
              <div style={{
                background: s.bg,
                border: `1.5px solid ${s.color}`,
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                minWidth: 88,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: 0.3 }}>{s.key}</span>
                <span style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>{tr(s.labelRu, s.labelUz)}</span>
              </div>
              {i < ORDER_STATUSES.length - 1 && (
                <span style={{ color: '#9ca3af', fontSize: 18, flexShrink: 0 }}>→</span>
              )}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: '1 1 260px' }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>💬</span>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--sg-muted)', lineHeight: 1.55 }}>
              {tr(
                'При каждой смене статуса покупатель получает уведомление в Telegram (кроме заблокировавших бота).',
                "Har bir status o'zgarishida xaridor Telegram'da bildirishnoma oladi (botni bloklaganlardan tashqari).",
              )}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: '1 1 260px' }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⏱️</span>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--sg-muted)', lineHeight: 1.55 }}>
              {tr(
                'Заказы в статусе NEW автоматически отменяются через 24 часа без подтверждения. Остатки восстанавливаются.',
                "NEW statusidagi buyurtmalar 24 soat ichida tasdiqlanmasa avtomatik bekor qilinadi. Qoldiqlar tiklanadi.",
              )}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: '1 1 260px' }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⭐</span>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--sg-muted)', lineHeight: 1.55 }}>
              {tr(
                'Баллы лояльности начисляются при COMPLETED. При CANCELLED — автоматически списываются.',
                "Loyallik ballari COMPLETED da hisoblanadi. CANCELLED da — avtomatik yechiladi.",
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── Plan comparison ─────────────────────────────────────────────────── */}
      <div className="sg-card" style={{ padding: '20px 20px 16px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: '#fef9c3', display: 'grid', placeItems: 'center',
          }}>
            <CreditCard size={18} color="#854d0e" />
          </div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            {tr('Сравнение тарифов', "Tariflarni solishtirish")}
          </h3>
        </div>

        <div style={{ overflowX: 'auto', marginInline: -20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '42%' }} />
              <col style={{ width: '19%' }} />
              <col style={{ width: '19%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ padding: '8px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--sg-muted)' }}>
                  {tr('Возможность', 'Imkoniyat')}
                </th>
                {[
                  { label: 'FREE',     bg: '#f9fafb', color: '#374151' },
                  { label: 'PRO',      bg: '#eff6ff', color: '#1d4ed8' },
                  { label: 'BUSINESS', bg: '#ecfdf5', color: '#059669' },
                ].map((plan) => (
                  <th key={plan.label} style={{
                    padding: '8px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800,
                    background: plan.bg, color: plan.color, borderRadius: 0,
                  }}>
                    {plan.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map((row, i) => (
                <tr key={row.featureRu} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--sg-panel-2)' }}>
                  <td style={{ padding: '7px 20px', fontSize: 13, color: 'var(--sg-text)', fontWeight: 500 }}>
                    {tr(row.featureRu, row.featureUz)}
                  </td>
                  <td style={{ padding: '7px 12px', textAlign: 'center', fontSize: 13, color: row.free === '—' ? '#9ca3af' : '#374151' }}>
                    {row.free}
                  </td>
                  <td style={{ padding: '7px 12px', textAlign: 'center', fontSize: 13, color: row.pro === '—' ? '#9ca3af' : '#1d4ed8', fontWeight: row.pro === '✓' ? 700 : 400 }}>
                    {row.pro}
                  </td>
                  <td style={{ padding: '7px 12px', textAlign: 'center', fontSize: 13, color: row.business === '—' ? '#9ca3af' : '#059669', fontWeight: row.business === '✓' ? 700 : 400 }}>
                    {row.business}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--sg-muted)' }}>
          {tr(
            '⚠️ После истечения тарифа действует 3-дневный льготный период — все функции сохраняются. Данные не удаляются при переходе на FREE.',
            "⚠️ Tarif muddati tugagach 3 kunlik imtiyozli davr beriladi — barcha funksiyalar saqlanadi. FREE ga o'tishda ma'lumotlar o'chirilmaydi.",
          )}
        </p>
      </div>

      {/* ── Support banner ──────────────────────────────────────────────────── */}
      <div className="sg-card soft" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, #00875a, #00a86f)',
          display: 'grid', placeItems: 'center',
        }}>
          <LifeBuoy size={22} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
            {tr('Нужна помощь?', 'Yordam kerakmi?')}
          </p>
          <p className="sg-subtitle" style={{ marginTop: 2 }}>
            {tr('Напишите нам в Telegram: ', "Telegram'da yozing: ")}
            <a href={SUPPORT_TG} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sg-brand)', fontWeight: 700 }}>
              @sellgram_support
            </a>
          </p>
        </div>
      </div>

      {/* ── FAQ accordion ───────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>
          {tr('Частые вопросы', "Ko'p so'raladigan savollar")}
        </h3>
        <div className="sg-grid" style={{ gap: 8 }}>
          {FAQ_SECTIONS.map((section) => {
            const isOpen = openFaq.has(section.id);
            const Icon = section.icon;
            return (
              <div key={section.id} className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  onClick={() => toggleFaq(section.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--sg-panel-2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: isOpen ? 'linear-gradient(135deg, #00875a, #00a86f)' : 'var(--sg-bg-soft)',
                    display: 'grid', placeItems: 'center', transition: 'background 0.2s',
                  }}>
                    <Icon size={17} color={isOpen ? '#fff' : '#00875a'} />
                  </div>
                  <span style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>{tr(section.titleRu, section.titleUz)}</span>
                  {isOpen
                    ? <ChevronUp size={18} color="var(--sg-muted)" />
                    : <ChevronDown size={18} color="var(--sg-muted)" />}
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--sg-border)' }}>
                    {section.items.map((item, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '14px 16px',
                          borderBottom: i < section.items.length - 1 ? '1px solid var(--sg-border)' : 'none',
                          background: i % 2 === 0 ? 'transparent' : 'var(--sg-panel-2)',
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--sg-text)' }}>
                          {tr(item.qRu, item.qUz)}
                        </p>
                        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--sg-muted)', lineHeight: 1.55 }}>
                          {tr(item.aRu, item.aUz)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </section>
  );
}
