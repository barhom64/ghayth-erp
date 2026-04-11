self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "إشعار جديد", body: event.data.text() };
  }

  const title = data.title || "غيث ERP";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.svg",
    badge: data.badge || "/favicon.svg",
    data: data.data || {},
    requireInteraction: false,
    silent: false,
    timestamp: data.timestamp || Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const actionUrl = event.notification.data?.actionUrl || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if (actionUrl !== "/" && "navigate" in client) {
              client.navigate(actionUrl);
            }
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(actionUrl);
        }
      })
  );
});
