// 타임카드 서비스 워커 (v46): 직원 휴대폰 알림(웹 푸시)만 받아서 보여 줘요.
// 화면·데이터를 저장해 두지 않아요 (fetch 처리 없음) — 앱을 고치면 늘 새 화면이 열리게.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const strong = !!d.strong;
  e.waitUntil(self.registration.showNotification(d.title || '타임카드', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || 'tc',
    renotify: true,
    requireInteraction: strong,   // 강한 경고는 직접 닫을 때까지 남김
    vibrate: strong ? [400, 150, 400, 150, 800] : [200, 100, 200],
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return self.clients.openWindow(url);
  }));
});
