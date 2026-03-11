if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (let registration of registrations) {
        registration.unregister().then((boolean) => {
          console.log('Service worker unregistered:', boolean);
        });
      }
    });
  });
}
