import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import {
  usePosStores, isPlanBlockedError, PosPlanBlocked, PosSubNav, PosStoreSelect,
  POS_OPERATOR_ROLES, POS_OPERATOR_ROLE_BADGE, POS_OPERATOR_PERMISSIONS,
  POS_OPERATOR_DEFAULT_PERMISSIONS, PERMISSION_LABELS,
  type PosOperatorRole,
} from './pos-shared';

type NoticeTone = 'success' | 'error';

interface FormState {
  name: string;
  role: PosOperatorRole;
  permissions: string[];
  active: boolean;
  // docs/POS_POLICY_ENGINE.md §14.1. `pin` is the plaintext the admin
  // just typed — empty on every open, including edit (the server never
  // sends the hash back, so there is nothing to prefill and no way to
  // show "the current PIN"). An empty pin on submit means "leave
  // whatever's stored alone", not "clear it" — that's what the
  // separate reset action is for.
  pinRequired: boolean;
  pin: string;
}

function emptyForm(): FormState {
  return { name: '', role: 'CASHIER', permissions: [], active: true, pinRequired: false, pin: '' };
}

export default function PosOperators() {
  const { tr } = useAdminI18n();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [operators, setOperators] = useState<any[]>([]);
  const [loadingOperators, setLoadingOperators] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  function roleLabel(role: string) {
    const found = POS_OPERATOR_ROLES.find((r) => r.value === role);
    return found ? tr(found.ru, found.uz) : role;
  }

  function permissionLabel(permission: string) {
    const found = PERMISSION_LABELS[permission];
    return found ? tr(found.ru, found.uz) : permission;
  }

  async function loadOperators(targetStoreId: string) {
    if (!targetStoreId) return;
    setLoadingOperators(true);
    try {
      const list = await adminApi.getPosOperators(targetStoreId);
      setOperators(Array.isArray(list) ? list : []);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить кассиров', "Kassirlarni yuklab bo'lmadi"));
      }
      setOperators([]);
    } finally {
      setLoadingOperators(false);
    }
  }

  useEffect(() => {
    if (storeId) void loadOperators(storeId);
  }, [storeId]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(op: any) {
    setEditId(op.id);
    setForm({
      name: op.name,
      role: op.role,
      permissions: Array.isArray(op.permissions) ? op.permissions : [],
      active: op.active,
      pinRequired: Boolean(op.pinRequired),
      pin: '',
    });
    setFormOpen(true);
  }

  function togglePermission(permission: string) {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }));
  }

  // docs/POS_POLICY_ENGINE.md §14.6 — picking a role in the create form
  // pre-fills the checkboxes with that role's default set; the admin can
  // still tick/untick individual permissions afterward, this only seeds
  // the starting point. Scoped to create only (!editId) — changing an
  // existing operator's role does not silently overwrite whatever
  // permissions[] they already had; the admin adjusts checkboxes by hand
  // in that case.
  function handleRoleChange(role: PosOperatorRole) {
    setForm((prev) => ({
      ...prev,
      role,
      permissions: editId ? prev.permissions : [...POS_OPERATOR_DEFAULT_PERMISSIONS[role]],
    }));
  }

  const canSave = useMemo(() => form.name.trim().length > 0, [form.name]);

  async function submitForm() {
    if (!canSave || !storeId) return;
    setSaving(true);
    try {
      // pin is only ever sent when the admin actually typed one — an
      // empty field means "don't touch the stored PIN" (edit) or "no
      // PIN yet" (create), never "clear it" (that's resetPin below).
      // pinRequired is always sent as a real toggle, independent of pin.
      const pinFields: { pin?: string; pinRequired: boolean } = { pinRequired: form.pinRequired };
      if (form.pin.trim()) pinFields.pin = form.pin.trim();

      if (editId) {
        await adminApi.updatePosOperator(editId, {
          name: form.name.trim(), role: form.role, permissions: form.permissions, active: form.active,
          ...pinFields,
        });
        showNotice('success', tr('Кассир обновлён', 'Kassir yangilandi'));
      } else {
        await adminApi.createPosOperator({
          storeId, name: form.name.trim(), role: form.role, permissions: form.permissions, active: form.active,
          ...pinFields,
        });
        showNotice('success', tr('Кассир добавлен', "Kassir qo'shildi"));
      }
      setFormOpen(false);
      await loadOperators(storeId);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removeOperator(id: string) {
    setPendingDelete(null);
    setSaving(true);
    try {
      await adminApi.deletePosOperator(id);
      showNotice('success', tr('Кассир удалён', "Kassir o'chirildi"));
      await loadOperators(storeId);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function resetPin() {
    if (!editId) return;
    setSaving(true);
    try {
      await adminApi.resetPosOperatorPin(editId);
      setForm((prev) => ({ ...prev, pinRequired: false, pin: '' }));
      showNotice('success', tr('PIN сброшен', 'PIN tozalandi'));
      await loadOperators(storeId);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'name',
      header: tr('Имя', 'Ism'),
      render: (op) => <span className="font-semibold text-neutral-800">{op.name}</span>,
    },
    {
      key: 'role',
      header: tr('Роль', 'Rol'),
      render: (op) => <Badge variant={POS_OPERATOR_ROLE_BADGE[op.role as PosOperatorRole] || 'neutral'}>{roleLabel(op.role)}</Badge>,
    },
    {
      key: 'permissions',
      header: tr('Права', 'Huquqlar'),
      render: (op) => (
        <div className="flex flex-wrap gap-1">
          {(op.permissions || []).length === 0
            ? <span className="text-token-xs text-neutral-400">—</span>
            : op.permissions.map((p: string) => (
              <span key={p} className="rounded-token-sm bg-neutral-100 px-1.5 py-0.5 text-token-xs text-neutral-600">{permissionLabel(p)}</span>
            ))}
        </div>
      ),
    },
    {
      key: 'active',
      header: tr('Статус', 'Holat'),
      render: (op) => (
        op.active
          ? <Badge variant="success">{tr('Активен', 'Faol')}</Badge>
          : <Badge variant="neutral">{tr('Отключён', "O'chirilgan")}</Badge>
      ),
    },
    {
      key: 'actions',
      header: tr('Действия', 'Amallar'),
      render: (op) => (
        pendingDelete === op.id ? (
          <div className="flex gap-1.5 items-center">
            <span className="text-token-xs text-neutral-600">{tr('Удалить?', "O'chirilsinmi?")}</span>
            <Button variant="danger" size="sm" type="button" onClick={() => removeOperator(op.id)}>{tr('Да', 'Ha')}</Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setPendingDelete(null)}>{tr('Нет', "Yo'q")}</Button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" type="button" onClick={() => openEdit(op)}>{tr('Изменить', 'Tahrirlash')}</Button>
            <Button variant="danger" size="sm" type="button" onClick={() => setPendingDelete(op.id)}>{tr('Удалить', "O'chirish")}</Button>
          </div>
        )
      ),
    },
  ];

  const noticeNode = notice ? (
    <div
      className={[
        'fixed top-[18px] right-[18px] z-[70] min-w-[280px] max-w-[440px] rounded-token-lg px-3.5 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  if (storesLoading) {
    return (
      <section className="flex flex-col gap-4">
        <div className="h-7 w-[35%] rounded-token-sm bg-neutral-100 animate-pulse" />
        <div className="h-32 rounded-token-lg bg-neutral-100 animate-pulse" />
      </section>
    );
  }

  if (storesError || stores.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <PosHeader tr={tr} />
        <PosSubNav />
        <Card className="text-center py-8 px-4">
          <p className="text-token-sm text-neutral-500">
            {tr('Сначала создайте магазин в настройках.', "Avval sozlamalarda do'kon yarating.")}
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <PosHeader tr={tr} />
      <PosSubNav />

      <PosStoreSelect stores={stores} storeId={storeId} onChange={selectStore} />

      {planBlocked ? (
        <PosPlanBlocked />
      ) : (
        <>
          <div className="flex justify-end">
            <Button variant="primary" size="md" type="button" onClick={openCreate}>
              + {tr('Добавить кассира', "Kassir qo'shish")}
            </Button>
          </div>

          <Table
            columns={columns}
            data={operators}
            rowKey={(op) => op.id}
            loading={loadingOperators}
            emptyMessage={tr('Кассиров пока нет', "Hali kassirlar yo'q")}
          />
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={() => !saving && setFormOpen(false)}>
          <Card className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-3 text-token-base font-semibold text-neutral-800">
              {editId ? tr('Изменить кассира', 'Kassirni tahrirlash') : tr('Новый кассир', 'Yangi kassir')}
            </h3>
            <div className="flex flex-col gap-3">
              <Input
                label={tr('Имя', 'Ism')}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={tr('Алиса Иванова', 'Alisa Ivanova')}
              />
              <Select
                label={tr('Роль', 'Rol')}
                value={form.role}
                onChange={(e) => handleRoleChange(e.target.value as PosOperatorRole)}
              >
                {POS_OPERATOR_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{tr(r.ru, r.uz)}</option>
                ))}
              </Select>

              <div>
                <p className="text-token-sm font-medium text-neutral-700 mb-1.5">{tr('Права', 'Huquqlar')}</p>
                <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
                  {POS_OPERATOR_PERMISSIONS.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-token-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(p)}
                        onChange={() => togglePermission(p)}
                      />
                      {permissionLabel(p)}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-token-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                />
                {tr('Активен', 'Faol')}
              </label>

              <div className="border-t border-neutral-200 pt-3 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-token-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={form.pinRequired}
                    onChange={(e) => setForm((prev) => ({ ...prev, pinRequired: e.target.checked }))}
                  />
                  {tr('Требовать PIN', 'PIN talab qilinsin')}
                </label>

                {form.pinRequired && (
                  <>
                    <Input
                      type="password"
                      label={tr('PIN код', 'PIN kod')}
                      value={form.pin}
                      onChange={(e) => setForm((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      placeholder={editId ? tr('Оставьте пустым, чтобы не менять', "O'zgartirmaslik uchun bo'sh qoldiring") : '1234'}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <p className="text-token-xs text-neutral-500 m-0">
                      {tr('PIN хранится в зашифрованном виде', 'PIN shifrlangan holda saqlanadi')}
                    </p>
                  </>
                )}

                {editId && (
                  <Button variant="ghost" size="sm" type="button" onClick={() => void resetPin()} disabled={saving}>
                    {tr('Сбросить PIN', 'PIN-ni tozalash')}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="md" type="button" onClick={() => setFormOpen(false)} disabled={saving}>
                {tr('Отмена', 'Bekor')}
              </Button>
              <Button variant="primary" size="md" type="button" onClick={submitForm} disabled={saving || !canSave}>
                {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}

function PosHeader({ tr }: { tr: (ru: string, uz: string) => string }) {
  return (
    <header className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-token-2xl font-semibold text-neutral-800 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-channel-pos" aria-hidden="true" />
          POS · {tr('Кассиры', 'Kassirlar')}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr('Операторы кассы, роли и права доступа', 'Kassa operatorlari, rollari va huquqlari')}
        </p>
      </div>
    </header>
  );
}
