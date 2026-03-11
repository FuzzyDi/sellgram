// In dev: Vite proxies /api/* to localhost:4000
// In prod: miniapp.sellgram.uz calls api.sellgram.uz directly
const API_BASE = import.meta.env.VITE_API_URL || '/api';
let _initData = '';
let _storeId = '';
export function setAuthData(initData, storeId) {
    _initData = initData;
    _storeId = storeId;
}
async function request(path, options) {
    const headers = {
        'X-Telegram-Init-Data': _initData,
        'X-Store-Id': _storeId,
    };
    if (options?.body)
        headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...headers, ...options?.headers },
    });
    const data = await res.json();
    if (!data.success)
        throw new Error(data.error || 'API error');
    return data.data;
}
export const api = {
    getCatalog: () => request('/shop/catalog'),
    getProduct: (id) => request(`/shop/products/${id}`),
    getCart: () => request('/shop/cart'),
    addToCart: (productId, variantId, qty = 1) => request('/shop/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId, variantId, qty }),
    }),
    updateCartItem: (id, qty) => request(`/shop/cart/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ qty }),
    }),
    removeCartItem: (id) => request(`/shop/cart/items/${id}`, { method: 'DELETE' }),
    getDeliveryZones: () => request('/shop/delivery-zones'),
    checkout: (data) => request('/shop/checkout', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    getOrders: () => request('/shop/orders'),
    getOrder: (id) => request(`/shop/orders/${id}`),
    getLoyalty: () => request('/shop/loyalty'),
};
