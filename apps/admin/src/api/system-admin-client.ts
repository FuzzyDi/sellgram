const SYSTEM_API_BASE = '/api/system-admin';

function getSystemToken(): string | null {
  return sessionStorage.getItem('systemToken');
}

export function setSystemToken(token: string) {
  sessionStorage.setItem('systemToken', token);
}

export function clearSystemToken() {
  sessionStorage.removeItem('systemToken');
}

async function systemRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getSystemToken();
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${SYSTEM_API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    clearSystemToken();
    throw new Error('Unauthorized system session');
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'System API error');
  return data.data;
}

export const systemApi = {
  login: async (email: string, password: string) => {
    const data = await systemRequest<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data?.token) setSystemToken(data.token);
    return data;
  },
  dashboard: () => systemRequest<any>('/dashboard'),
  reportUsage: (params?: string) => systemRequest<any>('/reports/usage' + (params ? ('?' + params) : '')),
  health: () => systemRequest<any>('/health'),
  activity: (params?: string) => systemRequest<any>(`/activity${params ? `?${params}` : ''}`),
  tenants: (params?: string) => systemRequest<any>(`/tenants${params ? `?${params}` : ''}`),
  stores: (params?: string) => systemRequest<any>(`/stores${params ? `?${params}` : ''}`),
  users: (params?: string) => systemRequest<any>(`/users${params ? `?${params}` : ''}`),
  resetUserPassword: (id: string, newPassword: string) =>
    systemRequest<any>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),
  pendingInvoices: () => systemRequest<any>('/invoices/pending'),
  invoices: (params?: string) => systemRequest<any>(`/invoices${params ? `?${params}` : ''}`),
  confirmInvoice: (id: string) => systemRequest<any>(`/invoices/${id}/confirm`, { method: 'PATCH' }),
  rejectInvoice: (id: string) => systemRequest<any>(`/invoices/${id}/reject`, { method: 'PATCH' }),
  reminderSettings: () => systemRequest<any>('/settings/reminders'),
  updateReminderSettings: (payload: { enabled?: boolean; days?: number[] }) =>
    systemRequest<any>('/settings/reminders', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  setTenantPlan: (id: string, plan: string, planExpiresAt?: string) =>
    systemRequest<any>(`/tenants/${id}/plan`, {
      method: 'PATCH',
      body: JSON.stringify({ plan, planExpiresAt }),
    }),
  blockTenant: (id: string) => systemRequest<any>(`/tenants/${id}/block`, { method: 'PATCH' }),
  unblockTenant: (id: string) => systemRequest<any>(`/tenants/${id}/unblock`, { method: 'PATCH' }),
  tenantDetail: (id: string) => systemRequest<any>(`/tenants/${id}`),
  impersonate: (id: string) => systemRequest<any>(`/tenants/${id}/impersonate`, { method: 'POST' }),
  revenueTrend: () => systemRequest<any[]>('/revenue-trend'),
  createInvoice: (payload: { tenantId: string; plan: string; amount: number; paymentRef?: string; autoConfirm: boolean }) =>
    systemRequest<any>('/invoices', { method: 'POST', body: JSON.stringify(payload) }),

  // Monitoring
  bots: () => systemRequest<any[]>('/bots'),
  errors: (limit?: number) => systemRequest<any[]>(`/errors${limit ? `?limit=${limit}` : ''}`),
  storage: () => systemRequest<any>('/storage'),

  // Announcements
  sendAnnouncement: (message: string, filter: string) =>
    systemRequest<any>('/announcements', { method: 'POST', body: JSON.stringify({ message, filter }) }),
  announcements: () => systemRequest<any[]>('/announcements'),

  // Plan config management
  planConfigs: () => systemRequest<any>('/plan-configs'),
  updatePlanConfig: (code: string, patch: { price?: number; limits?: Record<string, any> }) =>
    systemRequest<any>(`/plan-configs/${code}`, { method: 'PATCH', body: JSON.stringify(patch) }),
};
