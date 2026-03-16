// In dev: Vite proxies /api/* to localhost:4000
// In prod: miniapp.sellgram.uz calls api.sellgram.uz directly
const API_BASE = import.meta.env.VITE_API_URL || '/api';

let _initData = '';
let _storeId = '';

export function setAuthData(initData: string, storeId: string) {
  _initData = initData;
  _storeId = storeId;
}

function normalizeImageUrl(url?: string | null): string | null | undefined {
  if (!url) return url;
  if (url.startsWith('/uploads/')) return url;

  const trimmed = url.replace(/^\/+/, '');
  if (trimmed.startsWith('uploads/')) {
    return `/${trimmed}`;
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\/+/, '');
      if (!path) return url;
      if (path.startsWith('uploads/')) return `/${path}`;
      // Keep full path after host, including bucket if present:
      // /sellgram/products/a.webp -> /uploads/sellgram/products/a.webp
      return `/uploads/${path}`;
    } catch {
      return url;
    }
  }

  return `/uploads/${trimmed}`;
}

function normalizeCatalog(data: any) {
  if (!data || !Array.isArray(data.products)) return data;
  return {
    ...data,
    products: data.products.map((p: any) => ({
      ...p,
      images: Array.isArray(p.images)
        ? p.images.map((img: any) => ({ ...img, url: normalizeImageUrl(img?.url) }))
        : [],
    })),
  };
}

function normalizeProduct(data: any) {
  if (!data) return data;
  return {
    ...data,
    images: Array.isArray(data.images)
      ? data.images.map((img: any) => ({ ...img, url: normalizeImageUrl(img?.url) }))
      : [],
  };
}

function normalizeCart(data: any) {
  if (!data || !Array.isArray(data.items)) return data;
  return {
    ...data,
    items: data.items.map((item: any) => ({
      ...item,
      image: normalizeImageUrl(item?.image),
    })),
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'X-Telegram-Init-Data': _initData,
    'X-Store-Id': _storeId,
  };
  if (options?.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'API error');
  return data.data;
}

export const api = {
  getCatalog: async () => normalizeCatalog(await request<any>('/shop/catalog')),
  getProduct: async (id: string) => normalizeProduct(await request<any>(`/shop/products/${id}`)),
  getCart: async () => normalizeCart(await request<any>('/shop/cart')),
  addToCart: (productId: string, variantId?: string, qty = 1) =>
    request<any>('/shop/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, variantId, qty }),
    }),
  updateCartItem: (id: string, qty: number) =>
    request<any>(`/shop/cart/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ qty }),
    }),
  removeCartItem: (id: string) =>
    request<any>(`/shop/cart/items/${id}`, { method: 'DELETE' }),
  getDeliveryZones: () => request<any>('/shop/delivery-zones'),
  getPaymentMethods: () => request<any>('/shop/payment-methods'),
  checkout: (data: any) =>
    request<any>('/shop/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getOrders: () => request<any>('/shop/orders'),
  getOrder: (id: string) => request<any>(`/shop/orders/${id}`),
  cancelOrder: (id: string) => request<any>(`/shop/orders/${id}/cancel`, { method: 'POST' }),
  reviewOrder: (id: string, rating: number, comment?: string) =>
    request<any>(`/shop/orders/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),
  getLoyalty: () => request<any>('/shop/loyalty'),
};

