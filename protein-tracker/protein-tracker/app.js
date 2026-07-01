/**
 * Protein.Log - Main Application
 *
 * A Progressive Web App for tracking daily protein drink intake.
 * All data is persisted in localStorage; works fully offline via a service worker.
 *
 * Architecture overview:
 *   1. Constants & Configuration
 *   2. Confetti Animation System
 *   3. State Management  (localStorage CRUD)
 *   4. Date / Time Helpers
 *   5. Streak Calculation
 *   6. Notification Reminder
 *   7. Location & World Clocks
 *   8. Theme Management
 *   9. Stats, Badges & Heatmap
 *  10. Motivational Quotes
 *  11. UI Rendering
 *  12. History Table & Export (CSV / PDF)
 *  13. Notification Helpers
 *  14. Initialization & Event Binding
 */
(function () {
  "use strict";

  /* ==========================================================================
   * 1. CONSTANTS & CONFIGURATION
   * ========================================================================== */

  const STORAGE_KEY = "proteinDrinkTracker";
  const THEME_KEY = "proteinTheme";
  const LANG_KEY = "proteinTrackerLang";
  const REMINDER_KEY = "proteinReminder";

  /**
   * The hour (0-23) at which the "app day" resets.
   * An app day runs from RESET_HOUR to (RESET_HOUR - 1):59 the next
   * calendar day. This lets late-night users still count drinks toward
   * the previous day.
   */
  const RESET_HOUR = 2;

  /** Maximum number of history entries kept in localStorage (rolling window). */
  const HISTORY_MAX_DAYS = 365;

  /** SVG progress ring circumference, derived from r=52 in the markup. */
  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

  /**
   * Streak milestone tiers displayed in the streak badge.
   * Ordered highest-first so the first match wins.
   */
  const STREAK_MILESTONES = [
    { min: 100, icon: "\uD83D\uDC8E", class: "milestone-100" },
    { min: 30, icon: "\uD83D\uDD25", class: "milestone-30" },
    { min: 14, icon: "\u2B50", class: "milestone-14" },
    { min: 7, icon: "\uD83C\uDFC6", class: "milestone-7" },
  ];

  /** Cities shown in the footer world-clock strip. */
  const WORLD_CITIES = [
    { name: "New York", timeZone: "America/New_York" },
    { name: "London", timeZone: "Europe/London" },
    { name: "İstanbul", timeZone: "Europe/Istanbul" },
    { name: "Tokyo", timeZone: "Asia/Tokyo" },
    { name: "Sydney", timeZone: "Australia/Sydney" },
    { name: "Santo Domingo", timeZone: "America/Santo_Domingo" },
    { name: "Stockholm", timeZone: "Europe/Stockholm" },
  ];

  /* ==========================================================================
   * 2. CONFETTI ANIMATION SYSTEM
   *
   * Canvas-based particle effect launched when the user logs a drink
   * or hits a streak milestone. Colors match the supplement-label palette.
   * ========================================================================== */
  const confetti = {
    canvas: null,
    ctx: null,
    particles: [],
    running: false,
    colors: ['#C6FF3D', '#FF7A3D', '#F5F3E7', '#FFD23D', '#39C6FF', '#B98BD6'],

    init() {
      this.canvas = document.getElementById('confetti-canvas');
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
    },

    resize() {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    },

    launch(count) {
      if (!this.ctx) return;
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height * 0.4;
      for (let i = 0; i < (count || 80); i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 8;
        this.particles.push({
          x: cx + (Math.random() - 0.5) * 40,
          y: cy + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          size: 4 + Math.random() * 4,
          color: this.colors[Math.floor(Math.random() * this.colors.length)],
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 12,
          life: 1,
          decay: 0.008 + Math.random() * 0.008,
          shape: Math.random() > 0.5 ? 'rect' : 'circle',
        });
      }
      if (!this.running) {
        this.running = true;
        this.animate();
      }
    },

    animate() {
      if (!this.ctx || this.particles.length === 0) {
        this.running = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        return;
      }
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.particles = this.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.vx *= 0.99;
        p.rotation += p.rotSpeed;
        p.life -= p.decay;
        if (p.life <= 0) return false;

        this.ctx.save();
        this.ctx.globalAlpha = p.life;
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);
        this.ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
        return true;
      });
      requestAnimationFrame(() => this.animate());
    }
  };

  /* ==========================================================================
   * 3. STATE MANAGEMENT (localStorage CRUD)
   * ========================================================================== */

  /** User's detected city & IANA time-zone (populated by geolocation). */
  let userLocation = { city: "Local Time", timeZone: undefined };

  /** Active UI language code, persisted in localStorage. */
  let currentLang = localStorage.getItem(LANG_KEY) || "en";

  /* ==========================================================================
   * 4. DATE / TIME HELPERS
   * ========================================================================== */

  function getDateKey() {
    const now = new Date();
    const hour = now.getHours();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (hour < RESET_HOUR) {
      date.setDate(date.getDate() - 1);
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDisplayDate(dateKey) {
    const d = parseDateKey(dateKey);
    return d.toLocaleDateString(currentLang, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw)
        return {
          dateKey: null,
          drank: false,
          drinkTimestamps: [],
          history: [],
        };
      const data = JSON.parse(raw);
      const history = Array.isArray(data.history) ? data.history : [];
      const drinkTimestamps = Array.isArray(data.drinkTimestamps)
        ? data.drinkTimestamps
        : [];
      return {
        dateKey: data.dateKey || null,
        drank: Boolean(data.drank),
        drinkTimestamps: drinkTimestamps,
        history: history,
      };
    } catch (_) {
      return { dateKey: null, drank: false, drinkTimestamps: [], history: [] };
    }
  }

  function saveState(dateKey, drank, history, drinkTimestamps) {
    try {
      const trimmed = (history || []).slice(-HISTORY_MAX_DAYS);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ dateKey, drank, drinkTimestamps, history: trimmed }),
      );
    } catch (_) { }
  }

  function getCurrentDrank() {
    const dateKey = getDateKey();
    const stored = loadState();
    if (stored.dateKey !== dateKey) {
      return false;
    }
    return stored.drank;
  }

  function getHistory() {
    const dateKey = getDateKey();
    const stored = loadState();
    let history = stored.history || [];
    if (
      stored.dateKey === dateKey &&
      stored.drank &&
      !history.includes(dateKey)
    ) {
      history = history.concat([dateKey]);
      saveState(dateKey, true, history, stored.drinkTimestamps);
    } else if (stored.dateKey === dateKey && !stored.drank) {
      history = history.filter(function (k) {
        return k !== dateKey;
      });
    }
    return history;
  }

  function setDrank(drank) {
    const dateKey = getDateKey();
    const stored = loadState();
    let history = stored.history || [];
    let drinkTimestamps = stored.drinkTimestamps || [];

    if (drank) {
      if (!history.includes(dateKey)) history = history.concat([dateKey]);
      drinkTimestamps = drinkTimestamps.filter(function (ts) {
        return ts.date !== dateKey;
      });
      drinkTimestamps = drinkTimestamps.concat([
        { date: dateKey, time: new Date().toLocaleTimeString() },
      ]);
    } else {
      history = history.filter(function (k) {
        return k !== dateKey;
      });
      drinkTimestamps = drinkTimestamps.filter(function (ts) {
        return ts.date !== dateKey;
      });
    }

    saveState(dateKey, drank, history, drinkTimestamps);
  }

  /* ==========================================================================
   * 5. STREAK CALCULATION
   * ========================================================================== */

  function getStreak() {
    const todayKey = getDateKey();
    const history = getHistory();
    const drankSet = new Set(history);
    if (!drankSet.has(todayKey)) return 0;
    let streak = 0;
    const today = parseDateKey(todayKey);
    let d = new Date(today);
    while (true) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = y + "-" + m + "-" + day;
      if (!drankSet.has(key)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function toggleDrank() {
    const next = !getCurrentDrank();
    setDrank(next);
    return next;
  }

  /* ==========================================================================
   * 6. NOTIFICATION REMINDER
   * ========================================================================== */

  function initReminder() {
    if (!localStorage.getItem(REMINDER_KEY)) {
      localStorage.setItem(REMINDER_KEY, JSON.stringify({
        enabled: true,
        time: '09:00',
        lastNotified: null
      }));
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(function (permission) {
        if (permission === 'granted' && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "SET_REMINDER",
            settings: JSON.parse(localStorage.getItem(REMINDER_KEY)),
          });
        }
      });
    } else if (
      "Notification" in window &&
      Notification.permission === "granted" &&
      navigator.serviceWorker.controller
    ) {
      navigator.serviceWorker.controller.postMessage({
        type: "SET_REMINDER",
        settings: JSON.parse(localStorage.getItem(REMINDER_KEY)),
      });
    }
  }

  /* ==========================================================================
   * 7. LOCATION & WORLD CLOCKS
   * ========================================================================== */

  async function fetchCityName(lat, lon) {
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      );
      if (!res.ok) throw new Error("HTTP Error " + res.status);
      const data = await res.json();
      return data.city || data.locality || "Location Found";
    } catch (e) {
      console.error("City fetch failed", e);
      return "Local Time";
    }
  }

  function initLocation() {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        userLocation.city = await fetchCityName(latitude, longitude);
        const el = document.getElementById('main-clock-label');
        if (el) el.textContent = 'Time in ' + userLocation.city;
      });
    }
  }

  function initWorldClocks() {
    const container = document.getElementById("world-clocks");
    if (container) {
      let html = "";
      WORLD_CITIES.forEach((city, index) => {
        html += `
          <div class="world-clock-item">
            <span class="city-name">${city.name}</span>
            <span class="city-time" id="world-clock-time-${index}">--:--</span>
          </div>
        `;
      });
      container.innerHTML = html;
    }
  }

  function updateClock() {
    const now = new Date();
    const timeEl = document.getElementById("clock-time");
    const secEl = document.getElementById("clock-seconds");

    if (timeEl && secEl) {
      timeEl.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      secEl.textContent = String(now.getSeconds()).padStart(2, "0");
    }

    WORLD_CITIES.forEach((city, index) => {
      const el = document.getElementById(`world-clock-time-${index}`);
      if (el) {
        el.textContent = now.toLocaleTimeString("en-US", {
          timeZone: city.timeZone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }
    });
  }

  /* ==========================================================================
   * 8. THEME MANAGEMENT
   * ========================================================================== */

  function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.textContent = theme === "light" ? "☀️" : "🌙";
  }

  function toggleTheme() {
    setTheme(
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark",
    );
  }

  /* ==========================================================================
   * 9. STATS, BADGES & HEATMAP
   * ========================================================================== */

  function updateMonthlyStats() {
    const history = getHistory();

    const now = new Date();
    if (now.getHours() < RESET_HOUR) {
      now.setDate(now.getDate() - 1);
    }
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const currentMonthPrefix = `${y}-${m}`;

    let daysDrankThisMonth = 0;
    history.forEach(dateKey => {
      if (dateKey.startsWith(currentMonthPrefix)) {
        daysDrankThisMonth++;
      }
    });

    const daysInMonth = new Date(y, now.getMonth() + 1, 0).getDate();
    const percentage = Math.round((daysDrankThisMonth / daysInMonth) * 100) || 0;

    const statsTextEl = document.getElementById('monthly-stats-text');
    const progressFillEl = document.getElementById('monthly-progress-fill');

    const texts = translations[currentLang];
    let statsString = texts.monthlyStatsCompleted;
    statsString = statsString.replace("{days}", daysDrankThisMonth)
      .replace("{total}", daysInMonth)
      .replace("{percent}", percentage);

    if (statsTextEl) {
      statsTextEl.textContent = statsString;
    }

    if (progressFillEl) {
      progressFillEl.style.width = `${percentage}%`;
    }
  }

  function updateBadges() {
    const streak = getStreak();
    const historyLength = getHistory().length;

    const badges = [
      { name: 'First Sip', icon: '🌱', condition: historyLength >= 1 },
      { name: '3-Day Streak', icon: '🔥', condition: streak >= 3 },
      { name: 'Week Warrior', icon: '🥉', condition: streak >= 7 },
      { name: 'Consistency', icon: '🏆', condition: historyLength >= 30 },
      { name: 'Centurion', icon: '💯', condition: historyLength >= 100 }
    ];

    const container = document.getElementById('badges-container');
    if (!container) return;

    let html = '';
    badges.forEach(b => {
      const activeClass = b.condition ? 'unlocked' : '';
      html += `<div class="badge ${activeClass}" title="${b.name}\n${b.condition ? 'Unlocked!' : 'Keep going to unlock'}">${b.icon}</div>`;
    });
    container.innerHTML = html;
  }

  function updateHeatmap() {
    const grid = document.getElementById('heatmap-grid');
    if (!grid) return;

    const historySet = new Set(getHistory());
    const today = parseDateKey(getDateKey());

    let html = '';
    for (let i = 364; i >= 0; i--) {
      let d = new Date(today);
      d.setDate(d.getDate() - i);

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;

      const activeClass = historySet.has(key) ? 'active' : '';

      const displayDate = d.toLocaleDateString(currentLang, { month: 'short', day: 'numeric' });
      html += `<div class="heatmap-cell ${activeClass}" title="${displayDate}: ${activeClass ? 'Drank protein' : 'Missed'}"></div>`;
    }

    grid.innerHTML = html;

    const wrapper = document.querySelector('.heatmap-scroll-wrapper');
    if (wrapper) wrapper.scrollLeft = wrapper.scrollWidth;
  }

  /* ==========================================================================
   * 10. MOTIVATIONAL QUOTES
   * ========================================================================== */

  function getDailyQuote(texts) {
    const todayKey = getDateKey();
    const storageKey = "proteinDailyQuote";
    const storedData = localStorage.getItem(storageKey);

    let index;

    try {
      if (storedData) {
        const parsed = JSON.parse(storedData);
        if (parsed.date === todayKey && typeof parsed.index === "number") {
          index = parsed.index;
        }
      }
    } catch (e) {
      console.warn("Could not parse stored quote data, generating new quote.");
    }

    if (index === undefined) {
      index = Math.floor(Math.random() * texts.motivationalQuotes.length);
      localStorage.setItem(
        storageKey,
        JSON.stringify({ date: todayKey, index: index })
      );
    }

    if (index >= texts.motivationalQuotes.length || index < 0) {
      index = 0;
    }

    return texts.motivationalQuotes[index];
  }

  /* ==========================================================================
   * 11. UI RENDERING
   * ========================================================================== */

  function updateProgressRing(weeklyCount) {
    const fillEl = document.getElementById("progress-ring-fill");
    const countEl = document.getElementById("progress-ring-count");
    const labelEl = document.getElementById("progress-ring-label");
    const ringEl = document.querySelector(".progress-ring");
    if (!fillEl || !countEl) return;

    const ratio = Math.min(weeklyCount / 7, 1);
    const offset = RING_CIRCUMFERENCE * (1 - ratio);
    fillEl.style.strokeDashoffset = offset;
    countEl.textContent = weeklyCount;

    const texts = translations[currentLang];
    if (labelEl) labelEl.textContent = texts.progressLabel || "/7 days";

    if (ringEl) {
      ringEl.classList.toggle("complete", weeklyCount >= 7);
    }
  }

  function getWeeklyCount() {
    const history = getHistory();
    const historySet = new Set(history);
    let count = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      if (new Date().getHours() < RESET_HOUR) d.setDate(d.getDate() - 1);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = y + "-" + m + "-" + day;
      if (historySet.has(key)) count++;
    }
    if (!historySet.has(getDateKey()) && getCurrentDrank()) count++;
    return Math.min(count, 7);
  }

  function updateStreakBadge(streak) {
    const badge = document.getElementById("streak-badge");
    const iconEl = document.getElementById("streak-badge-icon");
    const textEl = document.getElementById("streak-badge-text");
    if (!badge || !iconEl || !textEl) return;

    const texts = translations[currentLang];
    let milestone = null;
    for (const m of STREAK_MILESTONES) {
      if (streak >= m.min) { milestone = m; break; }
    }

    badge.className = "streak-badge";
    if (milestone) {
      iconEl.textContent = milestone.icon;
      textEl.textContent = streak + " " + (texts.statusStreak || "day streak!");
      badge.classList.add(milestone.class);
    } else if (streak > 0) {
      iconEl.textContent = "\uD83D\uDCAA";
      textEl.textContent = streak + " " + (texts.statusStreak || "day streak!");
    } else {
      badge.classList.add("hidden");
    }
  }

  function updateUI(drank) {
    const dateKey = getDateKey();
    const stored = loadState();
    const flexed = document.getElementById("arm-flexed");
    const weak = document.getElementById("arm-weak");
    const btn = document.getElementById("toggle-btn");
    const status = document.getElementById("status-text");
    const dateEl = document.getElementById("date-text");
    const streakEl = document.getElementById("streak-text");
    const lastTimeEl = document.getElementById("last-time");
    const mainClockLabel = document.getElementById("main-clock-label");
    const proteinFoodListBtn = document.getElementById("protein-food-list-btn");
    const achievementsTitle = document.getElementById("achievements-title");
    const heatmapTitle = document.getElementById("heatmap-title");
    const statsBtn = document.getElementById("toggle-stats-btn");
    const texts = translations[currentLang];
    if (achievementsTitle) achievementsTitle.textContent = texts.achievementsTitle;
    if (heatmapTitle) heatmapTitle.textContent = texts.yearlyConsistencyTitle;
    const fullHistoryTitleEl = document.getElementById("full-history-title");
    if (fullHistoryTitleEl) fullHistoryTitleEl.textContent = texts.fullHistoryTitle;
    const exportCsvBtnEl = document.getElementById("export-csv-btn");
    if (exportCsvBtnEl) exportCsvBtnEl.textContent = texts.exportCsvBtn;
    const exportPdfBtnEl = document.getElementById("export-pdf-btn");
    if (exportPdfBtnEl) exportPdfBtnEl.textContent = texts.exportPdfBtn;
    const thDate = document.getElementById("history-th-date");
    if (thDate) thDate.textContent = texts.historyTableDate;
    const thDay = document.getElementById("history-th-day");
    if (thDay) thDay.textContent = texts.historyTableDay;
    const thTime = document.getElementById("history-th-time");
    if (thTime) thTime.textContent = texts.historyTableTimeLogged;
    const thStatus = document.getElementById("history-th-status");
    if (thStatus) thStatus.textContent = texts.historyTableStatus;
    const historyEmptyEl = document.getElementById("history-table-empty");
    if (historyEmptyEl) historyEmptyEl.textContent = texts.historyEmpty;

    if (statsBtn) {
      const statsSection = document.getElementById("monthly-stats-section");
      const isHidden = statsSection && statsSection.classList.contains("hidden");
      statsBtn.textContent = isHidden ? texts.showStatsBtn : texts.hideStatsBtn;
    }

    if (proteinFoodListBtn)
      proteinFoodListBtn.textContent = texts.proteinFoodListBtn;
    if (flexed) flexed.classList.toggle("hidden", !drank);
    if (weak) weak.classList.toggle("hidden", drank);
    if (btn) btn.textContent = drank ? texts.btnDrankUndo : texts.btnDrank;
    if (btn) btn.setAttribute("aria-pressed", String(drank));
    if (status)
      status.textContent = drank ? texts.statusDone : texts.statusNotDone;
    if (mainClockLabel) mainClockLabel.textContent = texts.localTime;
    if (dateEl) dateEl.textContent = formatDisplayDate(dateKey);

    const streak = getStreak();
    if (streakEl) {
      streakEl.textContent =
        streak > 0 ? `${streak} ${texts.statusStreak}` : "";
    }

    if (lastTimeEl) {
      const timestamps = stored.drinkTimestamps || [];
      if (timestamps.length) {
        const recent = timestamps[timestamps.length - 1];
        lastTimeEl.textContent = `${texts.lastDrankLabel} : ${recent.time}`;
      } else {
        lastTimeEl.textContent = "";
      }
    }
    updateHistoryLog();
    updateHistoryTable();
    updateMonthlyStats();
    updateBadges();
    updateHeatmap();
    updateProgressRing(getWeeklyCount());
    updateStreakBadge(streak);

    const quoteEl = document.getElementById("motivational-quote");
    if (quoteEl) quoteEl.textContent = getDailyQuote(texts);
  }

  function updateHistoryLog() {
    const logContainer = document.getElementById("history-log");
    if (!logContainer) return;

    const stored = loadState();
    const history = stored.history || [];
    const historySet = new Set(history);
    const todayKey = getDateKey();
    let html = "";

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      const currentHour = new Date().getHours();
      if (currentHour < RESET_HOUR) {
        d.setDate(d.getDate() - 1);
      }
      d.setDate(d.getDate() - i);

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = y + "-" + m + "-" + day;

      const isToday = key === todayKey;
      let status = "⚪";
      if (historySet.has(key)) {
        status = "✅";
      } else if (isToday && getCurrentDrank()) {
        status = "✅";
      }

      const dayName = d.toLocaleDateString(currentLang, { weekday: "narrow" });

      html += `
        <div class="history-day">
          <span class="day-label">${dayName}</span>
          <span class="day-status" title="${key}">${status}</span>
        </div>
      `;
    }
    logContainer.innerHTML = html;
  }

  /* ==========================================================================
   * 13. NOTIFICATION HELPERS
   * ========================================================================== */

  function handleToggle() {
    const drank = toggleDrank();
    updateUI(drank);
    navigator.vibrate?.(50);
    if (drank) {
      confetti.launch(100);

      const streak = getStreak();
      if (streak >= 7 && STREAK_MILESTONES.some(function (m) { return streak === m.min; })) {
        setTimeout(function () { confetti.launch(150); }, 400);
        setTimeout(function () { confetti.launch(100); }, 800);
      }

      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "SHOW_DRINK_NOTIFICATION",
          title: "\uD83E\uDD64 Protein Tracked!",
          body: "Great job! You've logged your protein drink today.",
        });
      }
      showNotificationAlert("\u2705 Good Job. Keep Going!");
    }
  }

  function showNotificationAlert(message) {
    const alert = document.createElement("div");
    alert.textContent = message;
    Object.assign(alert.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      background: "linear-gradient(135deg, #C6FF3D, #9FE000)",
      color: "#14150C",
      padding: "14px 24px",
      borderRadius: "10px",
      zIndex: "9998",
      fontWeight: "700",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "0.9rem",
      boxShadow: "0 8px 30px rgba(198, 255, 61, 0.35)",
      animation: "slideIn 0.3s ease-out",
      backdropFilter: "blur(10px)",
    });
    document.body.appendChild(alert);

    setTimeout(function () {
      alert.style.animation = "slideOut 0.3s ease-out";
      setTimeout(function () { alert.remove(); }, 300);
    }, 3000);
  }

  /* ==========================================================================
   * 12. HISTORY TABLE & EXPORT (CSV / PDF)
   * ========================================================================== */

  function updateHistoryTable() {
    const stored = loadState();
    const history = stored.history || [];
    const drinkTimestamps = stored.drinkTimestamps || [];
    const tbody = document.getElementById('history-table-body');
    const emptyMsg = document.getElementById('history-table-empty');
    if (!tbody) return;

    if (!history.length) {
      tbody.innerHTML = '';
      if (emptyMsg) emptyMsg.style.display = 'block';
      return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    const sorted = [...history].sort((a, b) => (a < b ? 1 : -1));
    tbody.innerHTML = sorted.map(function(dateKey) {
      const d = parseDateKey(dateKey);
      const dateStr = d.toLocaleDateString(currentLang, { day: '2-digit', month: 'short', year: 'numeric' });
      const dayStr = d.toLocaleDateString(currentLang, { weekday: 'long' });
      const ts = drinkTimestamps.find(function(t) { return t.date === dateKey; });
      const timeStr = ts ? ts.time : '—';
      return `<tr>
        <td class="td-date">${dateStr}</td>
        <td class="td-day">${dayStr}</td>
        <td class="td-time">${timeStr}</td>
        <td class="td-status">✅</td>
      </tr>`;
    }).join('');
  }

  function exportCSV() {
    const stored = loadState();
    const history = stored.history || [];
    const drinkTimestamps = stored.drinkTimestamps || [];
    const t = translations[currentLang];
    if (!history.length) { alert(t.alertNoHistoryExport); return; }
    const rows = [[t.historyTableDate, t.historyTableDay, t.historyTableTimeLogged, t.historyTableStatus]];
    const sorted = [...history].sort((a, b) => (a < b ? 1 : -1));
    sorted.forEach(function(dateKey) {
      const d = parseDateKey(dateKey);
      const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const dayStr = d.toLocaleDateString('en-GB', { weekday: 'long' });
      const ts = drinkTimestamps.find(function(t) { return t.date === dateKey; });
      rows.push([dateStr, dayStr, ts ? ts.time : '—', 'Drank ✓']);
    });

    const csv = rows.map(function(r) { return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'protein-history.csv';
    a.click();
  }

  function exportPDF() {
    const stored = loadState();
    const history = stored.history || [];
    const drinkTimestamps = stored.drinkTimestamps || [];
    const t = translations[currentLang];
    if (!history.length) { alert(t.alertNoHistoryExport); return; }
    if (!window.jspdf) { alert('PDF library not loaded yet, please try again.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, margin = 18, colW = pageW - margin * 2;
    let y = margin;

    // Full page dark background matching the app's palette
    doc.setFillColor(20, 21, 12);
    doc.rect(0, 0, pageW, pageH, 'F');

    doc.setFillColor(20, 21, 12);
    doc.rect(0, 0, pageW, 38, 'F');
    doc.setTextColor(245, 243, 231);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Protein.Log', margin, 22);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 154, 133);
    doc.text('History exported on ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), margin, 32);

    y = 50;

    doc.setFillColor(35, 38, 21);
    doc.roundedRect(margin, y, colW, 9, 2, 2, 'F');
    doc.setTextColor(198, 255, 61);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    const c = [margin + 3, margin + 48, margin + 90, margin + 130];
    doc.text(t.historyTableDate, c[0], y + 6);
    doc.text(t.historyTableDay, c[1], y + 6);
    doc.text(t.historyTableTimeLogged, c[2], y + 6);
    doc.text(t.historyTableStatus, c[3], y + 6);
    y += 12;

    const sorted = [...history].sort((a, b) => (a < b ? 1 : -1));
    sorted.forEach(function(dateKey, idx) {
      if (y > 278) { doc.addPage(); y = margin; }
      const d = parseDateKey(dateKey);
      const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const dayStr = d.toLocaleDateString('en-GB', { weekday: 'long' });
      const ts = drinkTimestamps.find(function(t) { return t.date === dateKey; });

      doc.setFillColor(35, 38, 21);
      doc.rect(margin, y - 1, colW, 9, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(198, 255, 61);
      doc.setFontSize(8.5);
      doc.text(dateStr, c[0], y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 198, 180);
      doc.text(dayStr, c[1], y + 5);
      doc.text(ts ? ts.time : '—', c[2], y + 5);

      doc.setTextColor(255, 122, 61);
      doc.text('Drank', c[3], y + 5);

      y += 10;
    });

    doc.setFontSize(7);
    doc.setTextColor(120, 118, 100);
    doc.text(history.length + ' days tracked in total', margin, 292);

    doc.save('protein-history.pdf');
  }

  /* ==========================================================================
   * 14. INITIALIZATION & EVENT BINDING
   * ========================================================================== */

  function init() {
    confetti.init();
    const drank = getCurrentDrank();

    const langSelect = document.getElementById("lang-select");
    if (langSelect) {
      langSelect.value = currentLang;
      langSelect.addEventListener("change", (e) => {
        currentLang = e.target.value;
        localStorage.setItem(LANG_KEY, currentLang);
        updateUI(getCurrentDrank());
      });
    }

    updateUI(drank);

    const btn = document.getElementById("toggle-btn");
    if (btn) {
      btn.addEventListener("click", handleToggle);
      btn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleToggle();
        }
      });
    }

    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
    setTheme(loadTheme());

    const csvBtn = document.getElementById('export-csv-btn');
    if (csvBtn) csvBtn.addEventListener('click', exportCSV);
    const pdfBtn = document.getElementById('export-pdf-btn');
    if (pdfBtn) pdfBtn.addEventListener('click', exportPDF);

    initLocation();
    initWorldClocks();
    updateClock();
    setInterval(updateClock, 1000);

    const statsBtn = document.getElementById('toggle-stats-btn');
    const statsSection = document.getElementById('monthly-stats-section');
    if (statsBtn && statsSection) {
      statsBtn.addEventListener('click', () => {
        const texts = translations[currentLang];
        const isHidden = statsSection.classList.contains('hidden');
        if (isHidden) {
          statsSection.classList.remove('hidden');
          statsSection.setAttribute('aria-hidden', 'false');
          statsBtn.textContent = texts.hideStatsBtn;
        } else {
          statsSection.classList.add('hidden');
          statsSection.setAttribute('aria-hidden', 'true');
          statsBtn.textContent = texts.showStatsBtn;
        }
      });
    }

    setInterval(function () {
      updateUI(getCurrentDrank());
    }, 60000);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("sw.js")
        .then(initReminder)
        .catch(function () { });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
