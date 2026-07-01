/**
 * Service Worker - Protein.Log
 *
 * Responsibilities:
 *   1. Cache static assets for offline-first behavior.
 *   2. Serve cached responses when the network is unavailable.
 *   3. Receive reminder settings from the main thread and fire
 *      scheduled notifications at the configured time.
 *   4. Handle notification-click events (re-focus / open the app).
 */

/* Bump the version suffix whenever cached assets change so the
 * activate step can purge stale caches automatically. */
const CACHE_NAME = 'protein-log-v1';

/** Static assets pre-cached during the install phase. */
const urlsToCache = [
  './',
  './index.html',
  './protein-food.html',
  './styles.css',
  './app.js',
  './translations.js',
  './manifest.json',
  './icons/icon.svg'
];

/** @type {{ enabled: boolean, time: string, lastNotified: string|null } | null} */
let reminderSettings = null;

/** Handle returned by setInterval so we can reset the check loop. */
let reminderCheckInterval = null;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', event => {
  const { type } = event.data || {};

  if (type === 'SET_REMINDER') {
    reminderSettings = event.data.settings;
    if (reminderCheckInterval) clearInterval(reminderCheckInterval);
    startReminderCheck();

  } else if (type === 'SHOW_DRINK_NOTIFICATION') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      tag: 'protein-notification',
      requireInteraction: false
    }).catch(err => {
      console.log('[SW] Notification error:', err);
    });
  }
});

/**
 * Evaluate whether a reminder notification should be shown right now.
 * Conditions: reminders enabled, current HH:MM matches configured time,
 * and we haven't already notified for today's date.
 */
function checkReminder() {
  if (!reminderSettings || !reminderSettings.enabled) return;

  const now = new Date();
  const [h, m] = reminderSettings.time.split(':').map(Number);
  const today = now.toISOString().split('T')[0];

  if (
    now.getHours() === h &&
    now.getMinutes() === m &&
    reminderSettings.lastNotified !== today
  ) {
    self.registration.showNotification('\uD83D\uDCAA Protein Reminder!', {
      body: 'Time to drink your protein! Did you have your drink today?',
      icon: './icons/icon.svg',
      badge: './icons/icon.svg',
      tag: 'protein-reminder',
      requireInteraction: false
    });

    reminderSettings.lastNotified = today;
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'UPDATE_REMINDER',
          settings: reminderSettings
        });
      });
    });
  }
}

function startReminderCheck() {
  reminderCheckInterval = setInterval(() => {
    checkReminder();
  }, 60000);
  checkReminder();
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('./'));
});

startReminderCheck();
