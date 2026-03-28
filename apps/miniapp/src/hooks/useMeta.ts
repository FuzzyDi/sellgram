function setMetaTag(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function setPageMeta(title: string, description?: string, imageUrl?: string) {
  document.title = title;
  setMetaTag('og:title', title);
  if (description) setMetaTag('og:description', description);
  if (imageUrl) setMetaTag('og:image', imageUrl);
  // Telegram WebApp title (shown in webview header)
  (window.Telegram?.WebApp as any)?.setTitle?.(title);
}
