// In dev: Vite proxies /api/* to localhost:4000
// In prod: miniapp.sellgram.uz calls api.sellgram.uz directly
const API_BASE = import.meta.env.VITE_API_URL || '/api';
let _initData = '';
let _storeId = '';
export function setAuthData(initData, storeId) {
    _initData = initData;
    _storeId = storeId;
}
function normalizeImageUrl(url) {
    if (!url)
        return url;
    if (url.startsWith('/uploads/'))
        return url;
    if (url.startsWith('http://') || url.startsWith('https://')) {
        try {
            const parsed = new URL(url);
            const parts = parsed.pathname.split('/').filter(Boolean);
            if (parts.length === 0)
                return url;
            // Keep full path after host, including bucket if present:
            // /sellgram/products/a.webp -> /uploads/sellgram/products/a.webp
            return `/uploads/${parts.join('/')}`;
        }
        catch {
            return url;
        }
    }
    return `/uploads/${url.replace(/^\/+/, '')}`;
}
function normalizeCatalog(data) {
    if (!data || !Array.isArray(data.products))
        return data;
    return {
        ...data,
        products: data.products.map((p) => ({
            ...p,
            images: Array.isArray(p.images)
                ? p.images.map((img) => ({ ...img, url: normalizeImageUrl(img?.url) }))
                : [],
        })),
    };
}
function normalizeProduct(data) {
    if (!data)
        return data;
    return {
        ...data,
        images: Array.isArray(data.images)
            ? data.images.map((img) => ({ ...img, url: normalizeImageUrl(img?.url) }))
            : [],
    };
}
function normalizeCart(data) {
    if (!data || !Array.isArray(data.items))
        return data;
    return {
        ...data,
        items: data.items.map((item) => ({
            ...item,
            image: normalizeImageUrl(item?.image),
        })),
    };
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
    getCatalog: async () => normalizeCatalog(await request('/shop/catalog')),
    getProduct: async (id) => normalizeProduct(await request(`/shop/products/${id}`)),
    getCart: async () => normalizeCart(await request('/shop/cart')),
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
