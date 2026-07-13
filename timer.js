/**
 * timer.js
 * ---------------------------------------------------------------------------
 * Manages the countdown for every store with an active, timed Rain Surge
 * session. Manual sessions get an elapsed-time (count-up) display instead.
 *
 * IMPORTANT: this client timer is a UX convenience only. The source of
 * truth for expiry is the server: appscript/Code.gs checks turnOnTime +
 * timerMinutes on every read, so a session still auto-closes correctly
 * even if no browser is open to run this countdown (in addition to the
 * hard 12:30 AM sweep in Code.gs).
 * ---------------------------------------------------------------------------
 */

const Timer = (() => {
  const timers = new Map(); // storeCode -> intervalId

  function fmt(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function start(store) {
    stop(store.storeCode);

    const el = document.querySelector(`[data-timer-for="${store.storeCode}"]`);
    if (!el) return;

    const turnOn = new Date(store.turnOnTime).getTime();
    const isManual = !store.timerMinutes;
    const expiry = isManual ? null : turnOn + store.timerMinutes * 60000;

    const tick = () => {
      const now = Date.now();
      if (isManual) {
        el.textContent = `Elapsed ${fmt(now - turnOn)}`;
        el.classList.remove("timer-expiring");
      } else {
        const remaining = expiry - now;
        el.textContent = remaining > 0 ? `Ends in ${fmt(remaining)}` : "Expired — turning off…";
        el.classList.toggle("timer-expiring", remaining > 0 && remaining < 60000);
        if (remaining <= 0) {
          stop(store.storeCode);
          RainSurge.autoTurnOff(store.storeCode, "Timer expired");
        }
      }
    };

    tick();
    timers.set(store.storeCode, setInterval(tick, CONFIG.CLOCK_TICK_MS));
  }

  function stop(storeCode) {
    if (timers.has(storeCode)) {
      clearInterval(timers.get(storeCode));
      timers.delete(storeCode);
    }
  }

  function stopAll() {
    timers.forEach((id) => clearInterval(id));
    timers.clear();
  }

  return { start, stop, stopAll, fmt };
})();
