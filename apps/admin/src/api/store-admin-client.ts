const ADMIN_API_BASE = '/api/store-admin';

// Images are served via api.sellgram.uz to bypass app.sellgram.uz Cloudflare cache
const UPLOADS_BASE = window.location.hostname === 'app.sellgram.uz'
  ? 'https://api.sellgram.uz'
  : '';

export function toImageUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${UPLOADS_BASE}${normalized}`;
}

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
async function request<T>(path: string, options?: RequestInit, retried = false): Promise<T> {
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
    if (!retried && refreshToken && !path.includes('/auth/')) {
      try {
        const refreshRes = await fetch(`${ADMIN_API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const refreshData = await refreshRes.json();
        if (refreshData.success) {
          setTokens(refreshData.data.accessToken, refreshData.data.refreshToken);
          return request(path, options, true);
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
  forgotPassword: (email: string) =>
    request<any>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    request<any>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, newPassword }) }),
  deleteAccount: (password: string) =>
    request<any>('/auth/account/delete', { method: 'POST', body: JSON.stringify({ password }) }),
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
  bulkUpdateProducts: (data: { ids: string[]; action: 'activate' | 'deactivate' }) =>
    request<any>('/products/bulk', { method: 'PATCH', body: JSON.stringify(data) }),
  adjustStock: (id: string, qty: number, opts?: { variantId?: string; mode?: 'set' | 'delta'; note?: string }) =>
    request<any>(`/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ qty, ...opts }) }),
  getStockMovements: (params?: string) => request<any>(`/stock-movements${params ? '?' + params : ''}`),

  getCategories: () => request<any>('/categories'),
  createCategory: (data: any) => request<any>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: any) => request<any>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request<any>(`/categories/${id}`, { method: 'DELETE' }),
  updateCategoryAttributes: (id: string, attributes: { name: string }[]) =>
    request<any>(`/categories/${id}/attributes`, { method: 'PUT', body: JSON.stringify({ attributes }) }),

  createProductVariant: (productId: string, data: { name: string; price?: number | null; stockQty?: number; sku?: string }) =>
    request<any>(`/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(data) }),
  updateProductVariant: (productId: string, variantId: string, data: { name?: string; price?: number | null; stockQty?: number; isActive?: boolean }) =>
    request<any>(`/products/${productId}/variants/${variantId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProductVariant: (productId: string, variantId: string) =>
    request<any>(`/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),

  getOrders: (params?: string) => request<any>(`/orders${params ? '?' + params : ''}`),
  getOrder: (id: string) => request<any>(`/orders/${id}`),
  downloadOrdersCsv: async (params?: string) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(
      `${ADMIN_API_BASE}/orders/export${params ? '?' + params : ''}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const filename = parseFilenameFromDisposition(res.headers.get('content-disposition'), `orders-${new Date().toISOString().slice(0, 10)}.csv`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  updateOrderStatus: (id: string, data: any) => request<any>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),
  getReviews: (params?: string) => request<any>(`/reviews${params ? '?' + params : ''}`),
  hideReview: (id: string) => request<any>(`/reviews/${id}/hide`, { method: 'PATCH' }),
  showReview: (id: string) => request<any>(`/reviews/${id}/show`, { method: 'PATCH' }),

  getPromoCodes: () => request<any>('/promo-codes'),
  createPromoCode: (data: any) => request<any>('/promo-codes', { method: 'POST', body: JSON.stringify(data) }),
  updatePromoCode: (id: string, data: any) => request<any>(`/promo-codes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePromoCode: (id: string) => request<any>(`/promo-codes/${id}`, { method: 'DELETE' }),

  getCustomers: (params?: string) => request<any>(`/customers${params ? '?' + params : ''}`),
  getCustomer: (id: string) => request<any>(`/customers/${id}`),
  downloadCustomersCsv: async () => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${ADMIN_API_BASE}/customers/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const date = new Date().toISOString().slice(0, 10);
    const filename = parseFilenameFromDisposition(res.headers.get('content-disposition'), `customers-${date}.csv`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  },
  updateCustomer: (id: string, data: { tags?: string[]; note?: string | null; phone?: string | null }) =>
    request<any>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adjustCustomerLoyalty: (id: string, points: number, description?: string) =>
    request<any>(`/customers/${id}/loyalty`, { method: 'POST', body: JSON.stringify({ points, description }) }),

  getStores: () => request<any>('/stores'),
  createStore: (data: any) => request<any>('/stores', { method: 'POST', body: JSON.stringify(data) }),
  updateStore: (id: string, data: any) => request<any>(`/stores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  checkStoreBot: (id: string) => request<any>(`/stores/${id}/check-bot`),
  activateStore: (id: string) => request<any>(`/stores/${id}/activate`, { method: 'POST' }),
  completeOnboarding: () => request<any>('/onboarding/complete', { method: 'POST' }),
  deleteStore: (id: string) => request<any>(`/stores/${id}`, { method: 'DELETE' }),

  getStorePaymentMethods: (storeId: string) => request<any>(`/stores/${storeId}/payment-methods`),
  createStorePaymentMethod: (storeId: string, data: any) =>
    request<any>(`/stores/${storeId}/payment-methods`, { method: 'POST', body: JSON.stringify(data) }),
  updateStorePaymentMethod: (storeId: string, methodId: string, data: any) =>
    request<any>(`/stores/${storeId}/payment-methods/${methodId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteStorePaymentMethod: (storeId: string, methodId: string) =>
    request<any>(`/stores/${storeId}/payment-methods/${methodId}`, { method: 'DELETE' }),

  getDeliveryZones: (storeId?: string) => request<any>(`/delivery-zones${storeId ? '?storeId=' + encodeURIComponent(storeId) : ''}`),
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

  getImportTemplate: () => {
    const token = localStorage.getItem('accessToken');
    const a = document.createElement('a');
    a.href = `/api/store-admin/products/import/template`;
    a.setAttribute('Authorization', token || '');
    // use fetch to trigger download with auth
    return fetch('/api/store-admin/products/import/template', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = 'products_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  },
  importProductsPreview: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('accessToken');
    const res = await fetch('/api/store-admin/products/import?preview=true', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Preview failed');
    return data.data;
  },
  importProductsApply: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('accessToken');
    const res = await fetch('/api/store-admin/products/import?preview=false', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Import failed');
    return data.data;
  },

  getBanners: () => request<any>('/banners'),
  uploadBanner: async (file: File, meta: { title?: string; linkUrl?: string; sortOrder?: number }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (meta.title) formData.append('title', meta.title);
    if (meta.linkUrl) formData.append('linkUrl', meta.linkUrl);
    if (meta.sortOrder !== undefined) formData.append('sortOrder', String(meta.sortOrder));
    const token = localStorage.getItem('accessToken');
    const res = await fetch('/api/store-admin/banners', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');
    return data.data;
  },
  updateBanner: (id: string, data: { title?: string; linkUrl?: string; sortOrder?: number; isActive?: boolean }) =>
    request<any>(`/banners/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBanner: (id: string) => request<any>(`/banners/${id}`, { method: 'DELETE' }),

  getLoyaltyConfig: () => request<any>('/loyalty/config'),
  updateLoyaltyConfig: (data: any) => request<any>('/loyalty/config', { method: 'PATCH', body: JSON.stringify(data) }),

  getSuppliers: () => request<any>('/suppliers'),
  getSupplier: (id: string) => request<any>(`/suppliers/${id}`),
  createSupplier: (data: any) => request<any>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: any) => request<any>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  archiveSupplier: (id: string) => request<any>(`/suppliers/${id}`, { method: 'DELETE' }),

  getPurchaseOrders: () => request<any>('/purchase-orders'),
  createPurchaseOrder: (data: any) => request<any>('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  updatePurchaseOrder: (id: string, data: any) => request<any>(`/purchase-orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  receivePurchaseOrder: (id: string, data: any) => request<any>(`/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify(data) }),

  getDashboard: () => request<any>('/analytics/dashboard'),
  getAnalyticsSummary: (days?: number) => request<any>(`/analytics/summary?days=${days || 30}`),
  getTopProducts: (period?: number) => request<any>(`/analytics/top-products?period=${period || 30}`),
  getRevenue: (days?: number) => request<any>(`/analytics/revenue?days=${days || 30}`),
  getReportsMeta: () => request<any>('/analytics/reports/meta'),
  getNewCustomersSeries: (days?: number) => request<any>(`/analytics/new-customers-series?days=${days || 30}`),
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

  getBroadcasts: (storeId?: string) => request<any>(`/broadcasts${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`),
  getBroadcast: (id: string) => request<any>(`/broadcasts/${id}`),
  getBroadcastAudience: (storeId: string, segment?: string) =>
    request<any>(`/broadcasts/audience?storeId=${encodeURIComponent(storeId)}${segment ? `&segment=${encodeURIComponent(segment)}` : ''}`),
  sendBroadcast: (data: any) => request<any>('/broadcasts/send', { method: 'POST', body: JSON.stringify(data) }),

  getAuditLogs: (limit?: number) => request<any>(`/audit-logs${limit ? '?limit=' + limit : ''}`),

  getScheduledReports: () => request<any>('/analytics/scheduled-reports'),
  createScheduledReport: (data: { reportType: string; periodDays: number; frequency: string }) =>
    request<any>('/analytics/scheduled-reports', { method: 'POST', body: JSON.stringify(data) }),
  deleteScheduledReport: (id: string) => request<any>(`/analytics/scheduled-reports/${id}`, { method: 'DELETE' }),

  getApiKeys: () => request<any>('/api-keys'),
  createApiKey: (data: { name: string; expiresAt?: string }) =>
    request<any>('/api-keys', { method: 'POST', body: JSON.stringify(data) }),
  revokeApiKey: (id: string) => request<any>(`/api-keys/${id}`, { method: 'DELETE' }),

  getWebhooks: () => request<any>('/webhooks'),
  createWebhook: (data: { url: string; events: string[] }) =>
    request<any>('/webhooks', { method: 'POST', body: JSON.stringify(data) }),
  updateWebhook: (id: string, data: { url?: string; events?: string[]; isActive?: boolean }) =>
    request<any>(`/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteWebhook: (id: string) => request<any>(`/webhooks/${id}`, { method: 'DELETE' }),
};


