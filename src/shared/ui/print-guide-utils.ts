export function isEmbeddedBrowser(userAgent: string | undefined = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return /MicroMessenger|QQ\//i.test(userAgent) || /;\s*wv\)|\bwv\b|WebView/i.test(userAgent);
}
