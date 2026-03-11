const ADMIN_API_BASE = '/api/admin';
const SYSTEM_API_BASE = '/api/system';
function getToken() {
    return localStorage.getItem('accessToken');
}
function getSystemToken() {
    return sessionStorage.getItem('systemToken');
}
export function setTokens(access, refresh) {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
}
export function clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
}
export function setSystemToken(token) {
    sessionStorage.setItem('systemToken', token);
}
export function clearSystemToken() {
    sessionStorage.removeItem('systemToken');
}
async function request(path, options) {
    const token = getToken();
    const headers = {
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
            }
            catch { }
        }
        clearTokens();
        window.location.hash = '';
        throw new Error('Unauthorized');
    }
    const data = await res.json();
    if (!data.success)
        throw new Error(data.error || 'API error');
    return data.data;
}
async function systemRequest(path, options) {
    const token = getSystemToken();
    const headers = {
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
    if (!data.success)
        throw new Error(data.error || 'System API error');
    return data.data;
}
export const adminApi = {
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me'),
    createTelegramLinkCode: () => request('/auth/telegram-link-code', { method: 'POST' }),
    getProducts: (params) => request(`/products${params ? '?' + params : ''}`),
    getProduct: (id) => request(`/products/${id}`),
    createProduct: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id, data) => request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
    getCategories: () => request('/categories'),
    createCategory: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
    updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
    getOrders: (params) => request(`/orders${params ? '?' + params : ''}`),
    getOrder: (id) => request(`/orders/${id}`),
    updateOrderStatus: (id, data) => request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),
    getCustomers: (params) => request(`/customers${params ? '?' + params : ''}`),
    getCustomer: (id) => request(`/customers/${id}`),
    getStores: () => request('/stores'),
    createStore: (data) => request('/stores', { method: 'POST', body: JSON.stringify(data) }),
    updateStore: (id, data) => request(`/stores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    getStorePaymentMethods: (storeId) => request(`/stores/${storeId}/payment-methods`),
    createStorePaymentMethod: (storeId, data) => request(`/stores/${storeId}/payment-methods`, { method: 'POST', body: JSON.stringify(data) }),
    updateStorePaymentMethod: (storeId, methodId, data) => request(`/stores/${storeId}/payment-methods/${methodId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteStorePaymentMethod: (storeId, methodId) => request(`/stores/${storeId}/payment-methods/${methodId}`, { method: 'DELETE' }),
    getDeliveryZones: (storeId) => request(`/delivery-zones${storeId ? '?storeId=' + storeId : ''}`),
    createDeliveryZone: (data) => request('/delivery-zones', { method: 'POST', body: JSON.stringify(data) }),
    updateDeliveryZone: (id, data) => request(`/delivery-zones/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteDeliveryZone: (id) => request(`/delivery-zones/${id}`, { method: 'DELETE' }),
    getSubscription: () => request('/subscription'),
    getPlans: () => request('/subscription/plans'),
    upgradePlan: (plan) => request('/subscription/upgrade', { method: 'POST', body: JSON.stringify({ plan }) }),
    getInvoices: () => request('/subscription/invoices'),
    submitInvoicePayment: (id, paymentRef) => request(`/subscription/invoices/${id}/pay`, { method: 'PATCH', body: JSON.stringify({ paymentRef }) }),
    uploadProductImage: async (productId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        const token = localStorage.getItem('accessToken');
        const res = await fetch(`/api/admin/products/${productId}/images`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });
        const data = await res.json();
        if (!data.success)
            throw new Error(data.error || 'Upload failed');
        return data.data;
    },
    deleteProductImage: (productId, imageId) => request(`/products/${productId}/images/${imageId}`, { method: 'DELETE' }),
    getLoyaltyConfig: () => request('/loyalty/config'),
    updateLoyaltyConfig: (data) => request('/loyalty/config', { method: 'PATCH', body: JSON.stringify(data) }),
    getPurchaseOrders: () => request('/purchase-orders'),
    createPurchaseOrder: (data) => request('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
    receivePurchaseOrder: (id, data) => request(`/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify(data) }),
    getDashboard: () => request('/analytics/dashboard'),
    getTopProducts: () => request('/analytics/top-products'),
    getRevenue: (days) => request(`/analytics/revenue?days=${days || 30}`),
    getBroadcasts: (storeId) => request(`/broadcasts${storeId ? `?storeId=${storeId}` : ''}`),
    getBroadcast: (id) => request(`/broadcasts/${id}`),
    sendBroadcast: (data) => request('/broadcasts/send', { method: 'POST', body: JSON.stringify(data) }),
};
export const systemApi = {
    login: async (email, password) => {
        const data = await systemRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        if (data?.token)
            setSystemToken(data.token);
        return data;
    },
    dashboard: () => systemRequest('/dashboard'),
    tenants: (params) => systemRequest(`/tenants${params ? `?${params}` : ''}`),
    stores: (params) => systemRequest(`/stores${params ? `?${params}` : ''}`),
    pendingInvoices: () => systemRequest('/invoices/pending'),
    confirmInvoice: (id) => systemRequest(`/invoices/${id}/confirm`, { method: 'PATCH' }),
    rejectInvoice: (id) => systemRequest(`/invoices/${id}/reject`, { method: 'PATCH' }),
    setTenantPlan: (id, plan, planExpiresAt) => systemRequest(`/tenants/${id}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({ plan, planExpiresAt }),
    }),
};
