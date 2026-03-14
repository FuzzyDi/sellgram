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
  health: () => systemRequest<any>('/health'),
  activity: (limit = 30) => systemRequest<any>(`/activity?limit=${limit}`),
  tenants: (params?: string) => systemRequest<any>(`/tenants${params ? `?${params}` : ''}`),
  stores: (params?: string) => systemRequest<any>(`/stores${params ? `?${params}` : ''}`),
  pendingInvoices: () => systemRequest<any>('/invoices/pending'),
  invoices: (params?: string) => systemRequest<any>(`/invoices${params ? `?${params}` : ''}`),
  confirmInvoice: (id: string) => systemRequest<any>(`/invoices/${id}/confirm`, { method: 'PATCH' }),
  rejectInvoice: (id: string) => systemRequest<any>(`/invoices/${id}/reject`, { method: 'PATCH' }),
  setTenantPlan: (id: string, plan: string, planExpiresAt?: string) =>
    systemRequest<any>(`/tenants/${id}/plan`, {
      method: 'PATCH',
      body: JSON.stringify({ plan, planExpiresAt }),
    }),
};

