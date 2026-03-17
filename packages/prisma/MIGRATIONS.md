# Prisma Migrations — правила

## Как работает деплой

```
prisma-init (docker-compose)
  └─ prisma migrate deploy   ← применяет все pending миграции, пишет в _prisma_migrations

api (Dockerfile.api CMD)
  └─ prisma migrate deploy   ← страховка: применяет то, что prisma-init пропустил
  └─ node apps/api/src/app.ts
```

`update.sh` явно запускает `prisma-init` перед рестартом API.

---

## Правило №1 — никогда не редактировать применённую миграцию

Если миграция уже в `_prisma_migrations` со статусом `finished`, её SQL **больше не выполняется**.
Редактирование файла не имеет эффекта на существующих серверах.

**Неправильно:**
```
# Добавить ALTER TABLE в существующий файл 20260318000000_add_wishlist_promocodes/migration.sql
# → Prisma пропустит, столбец не появится
```

**Правильно:**
```bash
# Создать новый файл миграции:
mkdir packages/prisma/migrations/20260320000000_add_new_column
# Написать SQL в migration.sql
# prisma migrate deploy применит его при следующем деплое
```

---

## Правило №2 — SQL в миграциях должен быть идемпотентным

Используй `IF NOT EXISTS` / `DO $$ EXCEPTION` чтобы миграция не падала при повторном запуске:

```sql
-- Таблицы
CREATE TABLE IF NOT EXISTS "my_table" (...);

-- Колонки
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "myCol" TEXT;

-- Индексы
CREATE INDEX IF NOT EXISTS "my_idx" ON "my_table"("col");

-- Foreign keys
DO $$ BEGIN
  BEGIN
    ALTER TABLE "my_table" ADD CONSTRAINT "my_fk"
      FOREIGN KEY ("col") REFERENCES "other"("id");
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
```

---

## Как создать миграцию вручную

```bash
# 1. Изменить packages/prisma/schema.prisma
# 2. Создать папку и файл:
mkdir packages/prisma/migrations/$(date +%Y%m%d%H%M%S)_describe_change
# 3. Написать SQL (идемпотентный)
# 4. git add + git commit + git push
# 5. На сервере:
cd /opt/sellgram && bash deploy/production/update.sh api
```

---

## Диагностика

```bash
# Какие миграции применены:
docker exec production-postgres-1 psql -U sellgram sellgram \
  -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;"

# Есть ли столбец:
docker exec production-postgres-1 psql -U sellgram sellgram \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='orders';"

# Применить вручную (крайний случай):
docker cp fix.sql production-postgres-1:/tmp/fix.sql
docker exec production-postgres-1 psql -U sellgram sellgram -f /tmp/fix.sql
```
