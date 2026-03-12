export const resetApp = async () => {
  if (!window.confirm('This will clear all app data, logout, and reset the application. Continue?')) return;

  try {
    // 1. Clear LocalStorage & SessionStorage
    localStorage.clear();
    sessionStorage.clear();

    // 2. Clear Caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    // 3. Unregister Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      
      // Send purge message to active worker if any
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'PURGE' });
      }
    }

    // 4. Clear IndexedDB
    if ('indexedDB' in window) {
      const dbs = await window.indexedDB.databases();
      dbs.forEach(db => {
        if (db.name) window.indexedDB.deleteDatabase(db.name);
      });
    }

    // 5. Reload
    window.location.reload();
  } catch (e) {
    console.error('Reset failed:', e);
    window.location.reload();
  }
};

export const checkForUpdates = async () => {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }
};
