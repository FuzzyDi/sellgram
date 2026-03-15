const ADMIN_API_BASE = '/api/store-admin';

function getToken(): string | null {
  return localStorage.getItem('accessToken');
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}


function parseFilenameFromDisposition(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const raw = match?.[1] || match?.[2];
  if (!raw) return fallback;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken && !path.includes('/auth/')) {
      try {
        const refreshRes = await fetch(`${ADMIN_API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const refreshData = await refreshRes.json();
        if (refreshData.success) {
          setTokens(refreshData.data.accessToken, refreshData.data.refreshToken);
          return request(path, options);
        }
      } catch {}
    }
    clearTokens();
    window.location.hash = '';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'API error');
  return data.data;
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data: any) =>
    request<any>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<any>('/auth/me'),
  updateMe: (data: any) => request<any>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  changeMyPassword: (currentPassword: string, newPassword: string) =>
    request<any>('/auth/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  getTeamUsers: () => request<any>('/auth/team'),
  createTeamUser: (data: any) => request<any>('/auth/team', { method: 'POST', body: JSON.stringify(data) }),
  updateTeamUser: (id: string, data: any) => request<any>(`/auth/team/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  resetTeamUserPassword: (id: string, newPassword: string) =>
    request<any>(`/auth/team/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  createTelegramLinkCode: () => request<any>('/auth/telegram-link-code', { method: 'POST' }),

  getProducts: (params?: string) => request<any>(`/products${params ? '?' + params : ''}`),
  getProduct: (id: string) => request<any>(`/products/${id}`),
  createProduct: (data: any) => request<any>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: any) => request<any>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: string) => request<any>(`/products/${id}`, { method: 'DELETE' }),

  getCategories: () => request<any>('/categories'),
  createCategory: (data: any) => request<any>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: any) => request<any>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request<any>(`/categories/${id}`, { method: 'DELETE' }),

  getOrders: (params?: string) => request<any>(`/orders${params ? '?' + params : ''}`),
  getOrder: (id: string) => request<any>(`/orders/${id}`),
  updateOrderStatus: (id: string, data: any) => request<any>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),

  getCustomers: (params?: string) => request<any>(`/customers${params ? '?' + params : ''}`),
  getCustomer: (id: string) => request<any>(`/customers/${id}`),

  getStores: () => request<any>('/stores'),
  createStore: (data: any) => request<any>('/stores', { method: 'POST', body: JSON.stringify(data) }),
  updateStore: (id: string, data: any) => request<any>(`/stores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  checkStoreBot: (id: string) => request<any>(`/stores/${id}/check-bot`),
  activateStore: (id: string) => request<any>(`/stores/${id}/activate`, { method: 'POST' }),
  deleteStore: (id: string) => request<any>(`/stores/${id}`, { method: 'DELETE' }),

  getStorePaymentMethods: (storeId: string) => request<any>(`/stores/${storeId}/payment-methods`),
  createStorePaymentMethod: (storeId: string, data: any) =>
    request<any>(`/stores/${storeId}/payment-methods`, { method: 'POST', body: JSON.stringify(data) }),
  updateStorePaymentMethod: (storeId: string, methodId: string, data: any) =>
    request<any>(`/stores/${storeId}/payment-methods/${methodId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteStorePaymentMethod: (storeId: string, methodId: string) =>
    request<any>(`/stores/${storeId}/payment-methods/${methodId}`, { method: 'DELETE' }),

  getDeliveryZones: (storeId?: string) => request<any>(`/delivery-zones${storeId ? '?storeId=' + storeId : ''}`),
  createDeliveryZone: (data: any) => request<any>('/delivery-zones', { method: 'POST', body: JSON.stringify(data) }),
  updateDeliveryZone: (id: string, data: any) => request<any>(`/delivery-zones/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDeliveryZone: (id: string) => request<any>(`/delivery-zones/${id}`, { method: 'DELETE' }),

  getSubscription: () => request<any>('/subscription'),
  getPlans: () => request<any>('/subscription/plans'),
  upgradePlan: (plan: string) => request<any>('/subscription/upgrade', { method: 'POST', body: JSON.stringify({ plan }) }),
  getInvoices: () => request<any>('/subscription/invoices'),
  submitInvoicePayment: (id: string, paymentRef: string) =>
    request<any>(`/subscription/invoices/${id}/pay`, { method: 'PATCH', body: JSON.stringify({ paymentRef }) }),

  uploadProductImage: async (productId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/store-admin/products/${productId}/images`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');
    return data.data;
  },
  deleteProductImage: (productId: string, imageId: string) =>
    request<any>(`/products/${productId}/images/${imageId}`, { method: 'DELETE' }),

  getLoyaltyConfig: () => request<any>('/loyalty/config'),
  updateLoyaltyConfig: (data: any) => request<any>('/loyalty/config', { method: 'PATCH', body: JSON.stringify(data) }),

  getPurchaseOrders: () => request<any>('/purchase-orders'),
  createPurchaseOrder: (data: any) => request<any>('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  receivePurchaseOrder: (id: string, data: any) => request<any>(`/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify(data) }),

  getDashboard: () => request<any>('/analytics/dashboard'),
  getTopProducts: (period?: number) => request<any>(`/analytics/top-products?period=${period || 30}`),
  getRevenue: (days?: number) => request<any>(`/analytics/revenue?days=${days || 30}`),
  getReportsMeta: () => request<any>('/analytics/reports/meta'),
  getCategoryReport: (days?: number, limit?: number) =>
    request<any>(`/analytics/report-categories?days=${days || 30}&limit=${limit || 20}`),
  getCustomersReport: (days?: number, limit?: number) =>
    request<any>(`/analytics/report-customers?days=${days || 90}&limit=${limit || 30}`),
  downloadReportCsv: async (type: string, days?: number) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(
      `${ADMIN_API_BASE}/analytics/reports/export?type=${encodeURIComponent(type)}&days=${days || 30}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );

    if (!res.ok) {
      try {
        const data = await res.json();
        throw new Error(data?.error || data?.message || 'Export failed');
      } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error('Export failed');
      }
    }

    const blob = await res.blob();
    const defaultName = `sellgram-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    const filename = parseFilenameFromDisposition(res.headers.get('content-disposition'), defaultName);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  getBroadcasts: (storeId?: string) => request<any>(`/broadcasts${storeId ? `?storeId=${storeId}` : ''}`),
  getBroadcast: (id: string) => request<any>(`/broadcasts/${id}`),
  sendBroadcast: (data: any) => request<any>('/broadcasts/send', { method: 'POST', body: JSON.stringify(data) }),
};


