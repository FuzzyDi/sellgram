import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Rocket, Bot, Package, ShoppingCart, Truck, Users, Star, Megaphone, UserCog, CreditCard, LifeBuoy, type LucideIcon } from 'lucide-react';
import { useAdminI18n } from '../i18n';

const SUPPORT_EMAIL = 'support@sellgram.uz';

interface Section {
  id: string;
  icon: LucideIcon;
  titleRu: string;
  titleUz: string;
  items: Array<{ qRu: string; qUz: string; aRu: string; aUz: string }>;
}

const SECTIONS: Section[] = [
  {
    id: 'start',
    icon: Rocket,
    titleRu: 'Быстрый старт',
    titleUz: 'Tezkor boshlash',
    items: [
      {
        qRu: 'С чего начать?',
        qUz: 'Qanday boshlash kerak?',
        aRu: 'Зарегистрируйтесь, создайте магазин, вставьте Bot Token от @BotFather и нажмите «Подключить». Добавьте хотя бы одну категорию и один товар — магазин готов к работе.',
        aUz: "Ro'yxatdan o'ting, do'kon yarating, @BotFather'dan olingan Bot Token kiriting va «Ulash» ni bosing. Kamida bitta toifa va bitta mahsulot qo'shing — do'kon tayyor.",
      },
      {
        qRu: 'Как получить Bot Token?',
        qUz: 'Bot Token qanday olish mumkin?',
        aRu: 'Откройте Telegram, найдите @BotFather, отправьте /newbot, придумайте имя и username. BotFather выдаст токен вида 123456:ABCdef... — скопируйте и вставьте в настройки магазина.',
        aUz: "Telegram'ni oching, @BotFather'ni toping, /newbot yuboring, nom va username o'ylab toping. BotFather 123456:ABCdef... ko'rinishidagi token beradi — uni nusxa oling va do'kon sozlamalariga joylashtiring.",
      },
      {
        qRu: 'Где ссылка на мой магазин?',
        qUz: "Do'konim havolasi qayerda?",
        aRu: 'После подключения бота — в списке магазинов отображается username бота (@your_bot). Ссылка на miniapp: https://t.me/your_bot/app',
        aUz: "Bot ulangandan so'ng — do'konlar ro'yxatida botning username'i (@your_bot) ko'rinadi. Miniapp havolasi: https://t.me/your_bot/app",
      },
    ],
  },
  {
    id: 'bot',
    icon: Bot,
    titleRu: 'Магазины и боты',
    titleUz: "Do'konlar va botlar",
    items: [
      {
        qRu: 'Можно ли подключить несколько ботов?',
        qUz: 'Bir nechta bot ulash mumkinmi?',
        aRu: 'Да. Каждый магазин — это отдельный Telegram-бот. Тарифы PRO и BUSINESS позволяют иметь несколько магазинов.',
        aUz: "Ha. Har bir do'kon — bu alohida Telegram bot. PRO va BUSINESS tariflarida bir nechta do'kon bo'lishi mumkin.",
      },
      {
        qRu: 'Бот не отвечает покупателям — что делать?',
        qUz: "Bot xaridorlarga javob bermayapti — nima qilish kerak?",
        aRu: 'Перейдите в Настройки → Магазины, нажмите «Проверить бота». Если статус ошибка — проверьте токен и нажмите «Подключить» снова. Убедитесь, что бот не заблокирован.',
        aUz: "Sozlamalar → Do'konlar bo'limiga o'ting, «Botni tekshirish» ni bosing. Xato ko'rsatsa — tokenni tekshiring va «Ulash» ni qayta bosing.",
      },
      {
        qRu: 'Что такое Webhook и зачем он нужен?',
        qUz: 'Webhook nima va nima uchun kerak?',
        aRu: 'Webhook — это адрес, на который Telegram отправляет сообщения от пользователей. SellGram настраивает его автоматически при нажатии «Подключить».',
        aUz: "Webhook — bu Telegram foydalanuvchi xabarlarini yuboradigan manzil. SellGram uni «Ulash» bosilganda avtomatik sozlaydi.",
      },
    ],
  },
  {
    id: 'catalog',
    icon: Package,
    titleRu: 'Каталог товаров',
    titleUz: 'Mahsulotlar katalogi',
    items: [
      {
        qRu: 'Как добавить товар?',
        qUz: "Mahsulot qanday qo'shiladi?",
        aRu: 'Каталог → Товары → кнопка «+». Заполните название, описание, цену, укажите категорию и загрузите фото. Переключатель «Активен» делает товар видимым в магазине.',
        aUz: "Katalog → Mahsulotlar → «+» tugmasi. Nom, tavsif, narxni kiriting, toifani belgilang va rasm yuklang. «Faol» tugmachasi mahsulotni do'konda ko'rinadigan qiladi.",
      },
      {
        qRu: 'Как управлять остатками?',
        qUz: 'Qoldiqlarni qanday boshqarish mumkin?',
        aRu: 'В карточке товара есть поле «Остаток». Если поле пустое — считается, что товар всегда в наличии. При заказе остаток уменьшается автоматически.',
        aUz: "Mahsulot kartasida «Qoldiq» maydoni mavjud. Maydon bo'sh bo'lsa — mahsulot doim mavjud deb hisoblanadi. Buyurtma berilganda qoldiq avtomatik kamayadi.",
      },
      {
        qRu: 'Что такое варианты товара?',
        qUz: 'Mahsulot variantlari nima?',
        aRu: 'Варианты — это разновидности одного товара: размер, цвет, объём. У каждого варианта своя цена и остаток. Например: футболка S/M/L.',
        aUz: "Variantlar — bu bitta mahsulotning turlari: o'lcham, rang, hajm. Har bir variantning o'z narxi va qoldig'i bor. Masalan: futbolka S/M/L.",
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
        qRu: 'Какие статусы заказа существуют?',
        qUz: 'Buyurtma statuslari qanday?',
        aRu: 'NEW → CONFIRMED → PREPARING → READY → DELIVERING → COMPLETED. Также возможен CANCELLED. Переводите заказ по шагам — покупатель получает уведомление в Telegram.',
        aUz: "NEW → CONFIRMED → PREPARING → READY → DELIVERING → COMPLETED. CANCELLED ham mumkin. Buyurtmani bosqichma-bosqich o'tkazing — xaridor Telegram'da bildirishnoma oladi.",
      },
      {
        qRu: 'Как указать трек-номер доставки?',
        qUz: "Yetkazib berish trek-raqamini qanday ko'rsatish mumkin?",
        aRu: 'Откройте заказ → раздел «Доставка» → введите трек-номер. Покупатель увидит его в своём заказе.',
        aUz: "Buyurtmani oching → «Yetkazib berish» bo'limi → trek-raqam kiriting. Xaridor uni o'z buyurtmasida ko'radi.",
      },
      {
        qRu: 'Как отменить заказ?',
        qUz: 'Buyurtmani qanday bekor qilish mumkin?',
        aRu: 'В карточке заказа выберите статус CANCELLED. Если к заказу начислены баллы лояльности — они будут автоматически списаны.',
        aUz: "Buyurtma kartasida CANCELLED statusini tanlang. Agar buyurtmaga loyalty ballar hisoblangan bo'lsa — ular avtomatik yechiladi.",
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
        qRu: 'Как настроить зоны доставки?',
        qUz: 'Yetkazib berish hududlarini qanday sozlash mumkin?',
        aRu: 'Настройки → Доставка → «+ Зона». Укажите название зоны, цену доставки и порог бесплатной доставки. Можно создать зоны для разных городов или районов.',
        aUz: "Sozlamalar → Yetkazib berish → «+ Hudud». Hudud nomini, narxini va bepul yetkazib berish chegarasini kiriting. Turli shahar yoki tumanlar uchun hududlar yaratish mumkin.",
      },
      {
        qRu: 'Как сделать бесплатную доставку?',
        qUz: "Bepul yetkazib berishni qanday o'rnatish mumkin?",
        aRu: 'В настройках зоны установите «Бесплатный порог» — сумму заказа, начиная с которой доставка бесплатна. Например: при заказе от 200 000 UZS — доставка 0.',
        aUz: "Hudud sozlamalarida «Bepul chegara» ni o'rnating — buyurtma summasidan boshlab yetkazib berish bepul bo'ladi. Masalan: 200 000 UZS dan buyurtmada yetkazib berish 0.",
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
        qRu: 'Откуда берутся покупатели?',
        qUz: 'Xaridorlar qayerdan keladi?',
        aRu: 'Покупатель автоматически создаётся при первом входе в miniapp. Данные берутся из Telegram: имя, username, фото.',
        aUz: "Xaridor miniapp'ga birinchi kirishda avtomatik yaratiladi. Ma'lumotlar Telegram'dan olinadi: ism, username, rasm.",
      },
      {
        qRu: 'Что такое теги покупателя?',
        qUz: 'Xaridor teglari nima?',
        aRu: 'Теги — ваши внутренние метки. Например: «VIP», «Оптовик», «Новый». Используются для фильтрации и сегментации при рассылках.',
        aUz: "Teglar — bu sizning ichki belgilaringiz. Masalan: «VIP», «Ulgurji», «Yangi». Xabarlar yuborishda filtrlash va segmentatsiya uchun ishlatiladi.",
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
        qRu: 'Как работает начисление баллов?',
        qUz: 'Ballar qanday hisoblanadi?',
        aRu: 'Настройки → Лояльность. Укажите: за каждые N сум → M баллов. При оплате баллами 1 балл = K сум. Максимальный процент скидки ограничен вами.',
        aUz: "Sozlamalar → Loyallik. Kiriting: har N so'm → M ball. Ballar bilan to'lovda 1 ball = K so'm. Chegirma maksimal foizi siz tomonidan cheklangan.",
      },
      {
        qRu: 'Когда начисляются баллы?',
        qUz: 'Ballar qachon hisoblanadi?',
        aRu: 'Баллы начисляются при переводе заказа в статус COMPLETED. При отмене заказа — автоматически списываются.',
        aUz: "Ballar buyurtma COMPLETED statusiga o'tkazilganda hisoblanadi. Buyurtma bekor qilinsa — avtomatik yechiladi.",
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
        qRu: 'Как отправить рассылку?',
        qUz: 'Xabar qanday yuboriladi?',
        aRu: 'Рассылки → «Новая рассылка». Введите текст, добавьте фото при необходимости. Можно фильтровать по тегам и активности покупателей.',
        aUz: "Xabarlar → «Yangi xabar». Matn kiriting, kerak bo'lsa rasm qo'shing. Xaridorlar teglari va faolligi bo'yicha filtrlash mumkin.",
      },
      {
        qRu: 'Есть ли ограничения на рассылки?',
        qUz: "Xabar yuborishda cheklovlar bormi?",
        aRu: 'Да. Telegram ограничивает скорость отправки. Мы отправляем ~30 сообщений/сек. Большие списки отправляются порциями автоматически.',
        aUz: "Ha. Telegram yuborish tezligini cheklaydi. Biz ~30 ta xabar/soniya yuboramiz. Katta ro'yxatlar avtomatik ravishda bo'lib yuboriladi.",
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
        qRu: 'Какие роли есть в системе?',
        qUz: 'Tizimda qanday rollar mavjud?',
        aRu: 'OWNER — полный доступ. MANAGER — всё кроме удаления владельца. OPERATOR — только разрешённые разделы. Для операторов можно точечно включить/выключить каждый раздел.',
        aUz: "OWNER — to'liq kirish. MANAGER — egalikni o'chirishdan tashqari hamma narsa. OPERATOR — faqat ruxsat etilgan bo'limlar. Operatorlar uchun har bir bo'limni alohida yoqish/o'chirish mumkin.",
      },
      {
        qRu: 'Может ли оператор сбросить пароль другого?',
        qUz: "Operator boshqasining parolini tiklashi mumkinmi?",
        aRu: 'Только если у оператора включено право manageUsers. Сбросить пароль OWNER может только сам OWNER.',
        aUz: "Faqat operatorda manageUsers huquqi yoqilgan bo'lsa. OWNER parolini faqat OWNER o'zi tiklashi mumkin.",
      },
    ],
  },
  {
    id: 'billing',
    icon: CreditCard,
    titleRu: 'Тарифы и оплата',
    titleUz: "Tariflar va to'lov",
    items: [
      {
        qRu: 'Чем отличаются тарифы?',
        qUz: 'Tariflar nimasi bilan farq qiladi?',
        aRu: 'FREE — 1 магазин, до 50 товаров, базовые функции. PRO — несколько магазинов, рассылки, экспорт. BUSINESS — без ограничений, приоритетная поддержка.',
        aUz: "FREE — 1 do'kon, 50 tagacha mahsulot, asosiy funksiyalar. PRO — bir nechta do'kon, xabarlar, eksport. BUSINESS — cheksiz, ustuvor qo'llab-quvvatlash.",
      },
      {
        qRu: 'Как оплатить тариф?',
        qUz: "Tarifni qanday to'lash mumkin?",
        aRu: 'Биллинг → выберите план → нажмите «Оплатить». Введите реквизиты перевода и payment reference. После проверки администратором тариф будет активирован.',
        aUz: "Billing → reja tanlang → «To'lash» ni bosing. O'tkazma rekvizitlari va payment reference kiriting. Administrator tekshirganidan so'ng tarif faollashtiriladi.",
      },
    ],
  },
];

export default function Help() {
  const { tr, locale } = useAdminI18n();
  const [open, setOpen] = useState<Set<string>>(new Set(['start']));

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header>
        <h2 className="sg-title">{tr('Справка', "Qo'llanma")}</h2>
        <p className="sg-subtitle">
          {tr('Ответы на частые вопросы по работе с SellGram', "SellGram bilan ishlash bo'yicha tez-tez beriladigan savollarga javoblar")}
        </p>
      </header>

      {/* Support banner */}
      <div className="sg-card soft" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, #00875a, #00a86f)',
          display: 'grid', placeItems: 'center',
        }}>
          <LifeBuoy size={22} color="#fff" />
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
            {tr('Нужна помощь?', 'Yordam kerakmi?')}
          </p>
          <p className="sg-subtitle" style={{ marginTop: 2 }}>
            {tr('Напишите нам: ', "Yozing: ")}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--sg-brand)', fontWeight: 700 }}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="sg-grid" style={{ gap: 8 }}>
        {SECTIONS.map((section) => {
          const isOpen = open.has(section.id);
          const Icon = section.icon;
          const title = tr(section.titleRu, section.titleUz);
          return (
            <div key={section.id} className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Section header */}
              <button
                onClick={() => toggle(section.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.14s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--sg-panel-2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: isOpen ? 'linear-gradient(135deg, #00875a, #00a86f)' : 'var(--sg-bg-soft)',
                  display: 'grid', placeItems: 'center',
                  transition: 'background 0.2s',
                }}>
                  <Icon size={17} color={isOpen ? '#fff' : '#00875a'} />
                </div>
                <span style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>{title}</span>
                {isOpen
                  ? <ChevronUp size={18} color="var(--sg-muted)" />
                  : <ChevronDown size={18} color="var(--sg-muted)" />
                }
              </button>

              {/* Q&A items */}
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

      {/* Bottom CTA */}
      <div className="sg-card soft" style={{ textAlign: 'center', padding: '20px 16px' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
          {tr('Не нашли ответ?', 'Javob topmadingizmi?')}
        </p>
        <p className="sg-subtitle" style={{ marginTop: 6 }}>
          {tr(
            'Пошаговое видеоруководство и дополнительная документация — на нашем сайте',
            "Bosqichma-bosqich video qo'llanma va qo'shimcha hujjatlar saytimizda mavjud",
          )}
        </p>
        <a
          href="/guide"
          target="_blank"
          rel="noopener noreferrer"
          className="sg-btn primary"
          style={{ display: 'inline-flex', marginTop: 12, textDecoration: 'none' }}
        >
          {tr('Открыть руководство', "Qo'llanmani ochish")}
        </a>
      </div>
    </section>
  );
}
