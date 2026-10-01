/* Paint the public launch shell before starting authenticated navigation.
 * No timers, fake percentages, private data fetches or persistent flags. */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.location.replace(navigator.onLine === false ? "/offline.html" : "/");
  });
});
