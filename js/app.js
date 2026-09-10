/**
 * TIME NOTE V1 - Main Application Controller
 */

import { db, DEFAULT_CATEGORIES } from './db.js';

class TimeNoteApp {
  constructor() {
    this.activeRecord = null;
    this.categories = [];
    this.selectedDate = this.getTodayString(); // 'YYYY-MM-DD'
    this.timerInterval = null;
    this.selectedSegmentData = null; // for detail modal

    // DOM Elements
    this.elHeaderDate = document.getElementById('header-date');
    this.elHeaderTime = document.getElementById('header-time');
    this.elActiveBanner = document.getElementById('active-banner');
    this.elActiveCatName = document.getElementById('active-category-name');
    this.elActiveDuration = document.getElementById('active-duration');
    this.elHomeCatButtons = document.getElementById('home-category-buttons');
    this.elBtnStopActive = document.getElementById('btn-stop-active');
    this.elHomeSummaryList = document.getElementById('home-summary-list');
    this.elHomeTodayDate = document.getElementById('home-today-date');
    this.elHomeMiniTimeline = document.getElementById('home-mini-timeline-bar');

    // Timeline elements
    this.elDailyTimeline = document.getElementById('daily-timeline-bar');
    this.elDailySummaryList = document.getElementById('daily-summary-list');
    this.elDailySessionList = document.getElementById('daily-session-list');
    this.elTimelineDatePicker = document.getElementById('timeline-date-picker');
    this.elTimelineDateDisplay = document.getElementById('timeline-date-display');
    this.elTimelineLegend = document.getElementById('timeline-legend');

    // History elements
    this.elHistoryDaysList = document.getElementById('history-days-list');

    // Modals
    this.modalSegment = document.getElementById('modal-segment');
    this.modalEdit = document.getElementById('modal-edit');
    this.formEditRecord = document.getElementById('form-edit-record');
    this.editErrorMsg = document.getElementById('edit-error-msg');
    this.toastEl = document.getElementById('toast');
  }

  async init() {
    try {
      await db.init();
      this.categories = await db.getCategories();
      if (!this.categories || this.categories.length === 0) {
        this.categories = DEFAULT_CATEGORIES;
      }

      this.renderHomeCategoryButtons();
      this.renderTimelineLegend();
      this.populateEditCategoryOptions();
      this.bindEvents();

      // Set initial timeline date picker
      this.elTimelineDatePicker.value = this.selectedDate;
      this.updateDateDisplay();

      // Register PWA Service Worker
      this.registerServiceWorker();

      // Load active session
      await this.refreshActiveState();

      // Start clock & diff timer
      this.startClockAndTimer();

      // Initial renders
      await this.refreshHomeView();
      await this.refreshTimelineView();
      await this.refreshHistoryView();

    } catch (err) {
      console.error('Initialization error:', err);
      this.showToast('初期化に失敗しました: ' + err.message);
    }
  }

  // =========================================================================
  // Date & Time Utilities
  // =========================================================================
  getTodayString() {
    const d = new Date();
    return this.formatDateISO(d);
  }

  formatDateISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  formatTime(ms) {
    if (ms < 0 || isNaN(ms)) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  formatDurationShort(ms) {
    if (ms < 0 || isNaN(ms)) ms = 0;
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours === 0) {
      return `${mins}分`;
    }
    return `${hours}時間${String(mins).padStart(2, '0')}分`;
  }

  // Compact clock format (e.g. 7:42, 1:00, 0:45, 0)
  formatDurationClock(ms) {
    if (ms <= 0 || isNaN(ms)) return '0';
    const totalMinutes = Math.floor(ms / (1000 * 60));
    if (totalMinutes === 0) return '0';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}:${String(mins).padStart(2, '0')}`;
  }

  // Short category names for compact timeline display
  getCategoryShortName(cat) {
    const shortNames = {
      sleep: '睡',
      ai: 'AI',
      sns: 'SN',
      uber: 'UB',
      walk: 'WK',
      other: '他'
    };
    if (!cat) return '';
    const id = typeof cat === 'string' ? cat : cat.id;
    return shortNames[id] || (cat.name ? cat.name.slice(0, 2) : id);
  }

  formatDateTimeLocalInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
  }

  formatDateTimeDisplay(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${m}月${d}日 ${hh}:${mm}`;
  }

  // =========================================================================
  // Clock & Realtime Diff Timer
  // =========================================================================
  startClockAndTimer() {
    this.updateClockAndDuration();
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.updateClockAndDuration();
    }, 1000);
  }

  updateClockAndDuration() {
    const now = new Date();
    
    // Header clock
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} (${days[now.getDay()]})`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    if (this.elHeaderDate) this.elHeaderDate.textContent = dateStr;
    if (this.elHeaderTime) this.elHeaderTime.textContent = timeStr;

    // Diff timer for active tracking
    if (this.activeRecord && this.activeRecord.startAt) {
      const startMs = new Date(this.activeRecord.startAt).getTime();
      const diffMs = now.getTime() - startMs;
      this.elActiveDuration.textContent = this.formatTime(diffMs);
    } else {
      this.elActiveDuration.textContent = '00:00:00';
    }
  }

  // =========================================================================
  // State Refresh & Active Session
  // =========================================================================
  async refreshActiveState() {
    this.activeRecord = await db.getActiveRecord();
    this.updateActiveBannerUI();
    this.updateCategoryButtonsRunningState();
  }

  updateActiveBannerUI() {
    if (this.activeRecord) {
      const cat = this.categories.find(c => c.id === this.activeRecord.categoryId) || { name: '記録中', icon: '⏱️', color: '#38bdf8' };
      this.elActiveBanner.className = 'active-banner running';
      this.elActiveCatName.textContent = `${cat.icon} ${cat.name} 稼働中`;
      this.elBtnStopActive.style.display = 'block';
    } else {
      this.elActiveBanner.className = 'active-banner stopped';
      this.elActiveCatName.textContent = '未記録（停止中）';
      this.elActiveDuration.textContent = '00:00:00';
      this.elBtnStopActive.style.display = 'none';
    }
  }

  updateCategoryButtonsRunningState() {
    const activeCatId = this.activeRecord ? this.activeRecord.categoryId : null;
    const buttons = this.elHomeCatButtons.querySelectorAll('.cat-btn');
    buttons.forEach(btn => {
      const catId = btn.getAttribute('data-cat');
      if (catId === activeCatId) {
        btn.classList.add('is-running');
      } else {
        btn.classList.remove('is-running');
      }
    });
  }

  // =========================================================================
  // Category Handling & One-Tap Actions
  // =========================================================================
  renderHomeCategoryButtons() {
    this.elHomeCatButtons.innerHTML = '';
    this.categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-btn';
      btn.setAttribute('data-cat', cat.id);
      btn.innerHTML = `
        <span class="cat-btn-icon">${cat.icon}</span>
        <span class="cat-btn-name">${cat.name}</span>
      `;
      btn.addEventListener('click', () => this.handleCategoryClick(cat.id));
      this.elHomeCatButtons.appendChild(btn);
    });
  }

  async handleCategoryClick(categoryId) {
    try {
      const res = await db.switchOrStopCategory(categoryId);
      if (res.action === 'stopped') {
        this.showToast(`⏹ ${this.getCategoryName(categoryId)} を停止しました`);
      } else if (res.action === 'switched') {
        this.showToast(`🔄 ${this.getCategoryName(categoryId)} に切り替えました`);
      } else if (res.action === 'started') {
        this.showToast(`▶️ ${this.getCategoryName(categoryId)} を開始しました`);
      }

      await this.refreshActiveState();
      this.updateClockAndDuration();
      await this.refreshHomeView();
      await this.refreshTimelineView();
      await this.refreshHistoryView();
    } catch (err) {
      console.error('Error switching category:', err);
      this.showToast('エラー: ' + err.message);
    }
  }

  async handleStopActiveClick() {
    if (!this.activeRecord) return;
    try {
      const catName = this.getCategoryName(this.activeRecord.categoryId);
      await db.stopActive();
      this.showToast(`⏹ ${catName} を停止しました`);
      await this.refreshActiveState();
      this.updateClockAndDuration();
      await this.refreshHomeView();
      await this.refreshTimelineView();
      await this.refreshHistoryView();
    } catch (err) {
      console.error('Error stopping active session:', err);
      this.showToast('エラー: ' + err.message);
    }
  }

  getCategoryName(id) {
    const cat = this.categories.find(c => c.id === id);
    return cat ? `${cat.icon} ${cat.name}` : id;
  }

  // =========================================================================
  // Timeline Calculation & Midnight Splitting (Core Logic)
  // =========================================================================
  /**
   * Calculates clipped day slices and unrecorded segments for a given 'YYYY-MM-DD'
   */
  async computeDaySegments(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
    const dayEnd = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayEnd.getTime();
    const totalDayMs = dayEndMs - dayStartMs; // 86,400,000 ms

    const now = new Date();
    const nowMs = now.getTime();
    const isToday = dateStr === this.getTodayString();
    const isFutureDay = dayStartMs > nowMs;

    // Fetch all records
    const allRecords = await db.getAllRecords();

    // Clip records for the selected day
    const segments = [];
    const categoryTotals = {};
    this.categories.forEach(c => {
      categoryTotals[c.id] = 0;
    });

    for (const rec of allRecords) {
      const recStartMs = new Date(rec.startAt).getTime();
      const recEndMs = rec.endAt ? new Date(rec.endAt).getTime() : nowMs;

      // Overlap with [dayStartMs, dayEndMs]
      const clipStartMs = Math.max(recStartMs, dayStartMs);
      const clipEndMs = Math.min(recEndMs, dayEndMs);

      if (clipEndMs > clipStartMs) {
        const durationMs = clipEndMs - clipStartMs;
        const totalSessionMs = recEndMs - recStartMs;
        const isSpanningMidnight = recStartMs < dayStartMs || recEndMs > dayEndMs;

        const cat = this.categories.find(c => c.id === rec.categoryId) || {
          id: rec.categoryId,
          name: '不明',
          icon: '❓',
          color: '#64748b'
        };

        if (categoryTotals[cat.id] !== undefined) {
          categoryTotals[cat.id] += durationMs;
        } else {
          categoryTotals[cat.id] = durationMs;
        }

        const leftPercent = ((clipStartMs - dayStartMs) / totalDayMs) * 100;
        const widthPercent = ((clipEndMs - clipStartMs) / totalDayMs) * 100;

        segments.push({
          type: 'record',
          record: rec,
          category: cat,
          clipStartMs,
          clipEndMs,
          durationMs,
          totalSessionMs,
          isSpanningMidnight,
          leftPercent,
          widthPercent
        });
      }
    }

    // Sort segments chronologically
    segments.sort((a, b) => a.clipStartMs - b.clipStartMs);

    // Calculate unrecorded and future slices
    const timelineSlices = [];
    let currentCursorMs = dayStartMs;

    const maxRecordedLimitMs = isToday ? Math.min(nowMs, dayEndMs) : (isFutureDay ? dayStartMs : dayEndMs);

    for (const seg of segments) {
      if (seg.clipStartMs > currentCursorMs) {
        // Gap before this segment
        const gapEndMs = Math.min(seg.clipStartMs, maxRecordedLimitMs);
        if (gapEndMs > currentCursorMs) {
          const unrecDuration = gapEndMs - currentCursorMs;
          timelineSlices.push({
            type: 'unrecorded',
            clipStartMs: currentCursorMs,
            clipEndMs: gapEndMs,
            durationMs: unrecDuration,
            leftPercent: ((currentCursorMs - dayStartMs) / totalDayMs) * 100,
            widthPercent: ((gapEndMs - currentCursorMs) / totalDayMs) * 100
          });
        }
      }
      timelineSlices.push(seg);
      currentCursorMs = Math.max(currentCursorMs, seg.clipEndMs);
    }

    // Gap after last segment up to maxRecordedLimitMs
    if (currentCursorMs < maxRecordedLimitMs) {
      const unrecDuration = maxRecordedLimitMs - currentCursorMs;
      timelineSlices.push({
        type: 'unrecorded',
        clipStartMs: currentCursorMs,
        clipEndMs: maxRecordedLimitMs,
        durationMs: unrecDuration,
        leftPercent: ((currentCursorMs - dayStartMs) / totalDayMs) * 100,
        widthPercent: ((unrecDuration) / totalDayMs) * 100
      });
      currentCursorMs = maxRecordedLimitMs;
    }

    // Future slice (from maxRecordedLimitMs to dayEndMs if today or future)
    if (currentCursorMs < dayEndMs) {
      timelineSlices.push({
        type: 'future',
        clipStartMs: currentCursorMs,
        clipEndMs: dayEndMs,
        durationMs: dayEndMs - currentCursorMs,
        leftPercent: ((currentCursorMs - dayStartMs) / totalDayMs) * 100,
        widthPercent: ((dayEndMs - currentCursorMs) / totalDayMs) * 100
      });
    }

    // Total unrecorded duration
    let totalUnrecordedMs = 0;
    timelineSlices.forEach(s => {
      if (s.type === 'unrecorded') {
        totalUnrecordedMs += s.durationMs;
      }
    });

    return {
      dateStr,
      dayStartMs,
      dayEndMs,
      totalDayMs,
      timelineSlices,
      categoryTotals,
      totalUnrecordedMs,
      isToday,
      isFutureDay
    };
  }

  // =========================================================================
  // Rendering Views
  // =========================================================================

  // Home View (Today's Mini-timeline & Summary)
  async refreshHomeView() {
    const todayStr = this.getTodayString();
    const data = await this.computeDaySegments(todayStr);

    if (this.elHomeTodayDate) {
      this.elHomeTodayDate.textContent = `${todayStr.replace(/-/g, '/')}`;
    }

    // Render Mini Timeline
    this.renderTimelineBar(this.elHomeMiniTimeline, data.timelineSlices, true);

    // Render Home Summary List
    this.renderSummaryList(this.elHomeSummaryList, data.categoryTotals, data.totalUnrecordedMs, data.totalDayMs);
  }

  // Timeline / Daily View
  async refreshTimelineView() {
    const data = await this.computeDaySegments(this.selectedDate);

    // Render 3-hour grid guidelines (03, 06, 09, 12, 15, 18, 21)
    const gridLinesContainer = document.getElementById('timeline-grid-lines');
    if (gridLinesContainer) {
      gridLinesContainer.innerHTML = '';
      const gridHours = [3, 6, 9, 12, 15, 18, 21];
      gridHours.forEach(h => {
        const line = document.createElement('div');
        line.className = 'timeline-grid-line';
        line.style.left = `${(h / 24) * 100}%`;
        gridLinesContainer.appendChild(line);
      });
    }

    // Render current time vertical red line if looking at today
    const nowLine = document.getElementById('timeline-now-line');
    if (nowLine) {
      if (data.isToday) {
        const now = new Date();
        const elapsedTodayMs = now.getTime() - data.dayStartMs;
        const nowPercent = Math.min(Math.max((elapsedTodayMs / data.totalDayMs) * 100, 0), 100);
        nowLine.style.left = `${nowPercent}%`;
        nowLine.style.display = 'block';
      } else {
        nowLine.style.display = 'none';
      }
    }

    // Render full interactive timeline
    this.renderTimelineBar(this.elDailyTimeline, data.timelineSlices, false, data);

    // Render Daily Summary Stats
    this.renderSummaryList(this.elDailySummaryList, data.categoryTotals, data.totalUnrecordedMs, data.totalDayMs);

    // Render Daily Session Logs
    this.renderDailySessionLogs(data.timelineSlices);
  }

  // Render 0:00〜24:00 timeline bar (Height 84px on daily view)
  renderTimelineBar(container, slices, isMini = false, dayData = null) {
    container.innerHTML = '';
    slices.forEach((slice) => {
      const segEl = document.createElement('div');
      segEl.className = 'timeline-segment';
      segEl.style.left = `${slice.leftPercent}%`;
      segEl.style.width = `${Math.max(slice.widthPercent, 0.2)}%`;

      if (slice.type === 'record') {
        segEl.style.backgroundColor = slice.category.color;
        segEl.title = `${slice.category.name}: ${this.formatDurationShort(slice.durationMs)}`;

        if (isMini) {
          if (slice.widthPercent >= 8) {
            const label = document.createElement('span');
            label.className = 'segment-label';
            label.textContent = `${slice.category.icon}`;
            segEl.appendChild(label);
          }
        } else {
          // Prominent tall timeline segment (Height 84px)
          if (slice.isSpanningMidnight && dayData && slice.clipStartMs === dayData.dayStartMs && slice.widthPercent >= 8) {
            const badge = document.createElement('span');
            badge.className = 'seg-spanning-badge';
            badge.textContent = '◀ 継続';
            segEl.appendChild(badge);
          }

          const shortName = this.getCategoryShortName(slice.category);
          const clockTime = this.formatDurationClock(slice.durationMs);

          // Thresholds with short names (睡, AI, SN, UB, WK, 他) and clock format (7:42)
          // Prevents any ellipsis like "U..."
          if (slice.widthPercent >= 11) {
            // Sufficient width: Icon + Short Name + Clock Duration
            const icon = document.createElement('span');
            icon.className = 'seg-icon';
            icon.textContent = slice.category.icon;

            const name = document.createElement('span');
            name.className = 'seg-name';
            name.textContent = shortName;

            const time = document.createElement('span');
            time.className = 'seg-time';
            time.textContent = clockTime;

            segEl.appendChild(icon);
            segEl.appendChild(name);
            segEl.appendChild(time);
          } else if (slice.widthPercent >= 6) {
            // Medium width: Icon + Short Name only
            const icon = document.createElement('span');
            icon.className = 'seg-icon';
            icon.textContent = slice.category.icon;

            const name = document.createElement('span');
            name.className = 'seg-name';
            name.textContent = shortName;

            segEl.appendChild(icon);
            segEl.appendChild(name);
          } else if (slice.widthPercent >= 3.5) {
            // Narrow width: Icon only
            const icon = document.createElement('span');
            icon.className = 'seg-icon';
            icon.style.fontSize = '15px';
            icon.textContent = slice.category.icon;
            segEl.appendChild(icon);
          }
          // Below 3.5%: Clean solid color block without text (accessible via tap modal)
        }

        // Click to open details
        segEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openSegmentDetailModal(slice);
        });
      } else if (slice.type === 'unrecorded') {
        segEl.classList.add('unrecorded');
        segEl.title = `未記録: ${this.formatDurationShort(slice.durationMs)}`;

        if (!isMini) {
          const clockTime = this.formatDurationClock(slice.durationMs);
          if (slice.widthPercent >= 11) {
            const icon = document.createElement('span');
            icon.className = 'seg-icon';
            icon.style.fontSize = '14px';
            icon.style.opacity = '0.7';
            icon.textContent = '⏳';

            const name = document.createElement('span');
            name.className = 'seg-name';
            name.textContent = '未';

            const time = document.createElement('span');
            time.className = 'seg-time';
            time.textContent = clockTime;

            segEl.appendChild(icon);
            segEl.appendChild(name);
            segEl.appendChild(time);
          } else if (slice.widthPercent >= 6) {
            const icon = document.createElement('span');
            icon.className = 'seg-icon';
            icon.style.fontSize = '14px';
            icon.style.opacity = '0.7';
            icon.textContent = '⏳';

            const name = document.createElement('span');
            name.className = 'seg-name';
            name.textContent = '未';

            segEl.appendChild(icon);
            segEl.appendChild(name);
          } else if (slice.widthPercent >= 3.5) {
            const icon = document.createElement('span');
            icon.className = 'seg-icon';
            icon.style.fontSize = '14px';
            icon.style.opacity = '0.7';
            icon.textContent = '⏳';
            segEl.appendChild(icon);
          }
          // Below 3.5%: Clean striped pattern only
        }

        segEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openUnrecordedDetailModal(slice);
        });
      } else if (slice.type === 'future') {
        segEl.classList.add('future');
        // Keep future clean with diagonal pattern, no text or icon
      }

      container.appendChild(segEl);
    });
  }

  // Render Summary Stats List
  renderSummaryList(container, categoryTotals, totalUnrecordedMs, totalDayMs) {
    container.innerHTML = '';

    // Category rows
    this.categories.forEach(cat => {
      const durationMs = categoryTotals[cat.id] || 0;
      const percent = ((durationMs / totalDayMs) * 100).toFixed(1);

      const row = document.createElement('div');
      row.className = 'summary-row';
      row.style.borderLeftColor = cat.color;
      row.innerHTML = `
        <div class="summary-row-left">
          <span class="summary-cat-icon">${cat.icon}</span>
          <span class="summary-cat-name">${cat.name}</span>
        </div>
        <div class="summary-row-right">
          <span class="summary-duration">${this.formatDurationShort(durationMs)}</span>
          <span class="summary-percent">${percent}%</span>
        </div>
      `;
      container.appendChild(row);
    });

    // Unrecorded row
    const unrecPercent = ((totalUnrecordedMs / totalDayMs) * 100).toFixed(1);
    const unrecRow = document.createElement('div');
    unrecRow.className = 'summary-row';
    unrecRow.style.borderLeftColor = 'var(--text-muted)';
    unrecRow.innerHTML = `
      <div class="summary-row-left">
        <span class="summary-cat-icon">⏳</span>
        <span class="summary-cat-name">未記録</span>
      </div>
      <div class="summary-row-right">
        <span class="summary-duration">${this.formatDurationShort(totalUnrecordedMs)}</span>
        <span class="summary-percent">${unrecPercent}%</span>
      </div>
    `;
    container.appendChild(unrecRow);
  }

  // Render Daily Session Logs (Recorded items with Edit button)
  renderDailySessionLogs(slices) {
    this.elDailySessionList.innerHTML = '';
    const recordSlices = slices.filter(s => s.type === 'record');

    if (recordSlices.length === 0) {
      this.elDailySessionList.innerHTML = '<p class="section-desc" style="text-align:center; padding: 12px;">この日の記録はありません</p>';
      return;
    }

    recordSlices.forEach(slice => {
      const rec = slice.record;
      const startD = new Date(rec.startAt);
      const endD = rec.endAt ? new Date(rec.endAt) : new Date();
      const isRunning = !rec.endAt;

      const item = document.createElement('div');
      item.className = 'session-item';
      item.style.borderLeftColor = slice.category.color;

      const timeRangeText = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')} 〜 ` +
        (isRunning ? '現在' : `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`);

      item.innerHTML = `
        <div class="session-main-info">
          <div class="session-cat-title">
            <span>${slice.category.icon}</span>
            <span>${slice.category.name}</span>
            ${slice.isSpanningMidnight ? '<span style="font-size:10px; color:#38bdf8; border:1px solid #0284c7; padding:1px 4px; border-radius:3px;">日またぎ</span>' : ''}
          </div>
          <div class="session-time-range">${timeRangeText}</div>
        </div>
        <div class="session-right-side">
          <div class="session-duration">${this.formatDurationShort(slice.durationMs)}</div>
          <button class="btn-edit-session" data-id="${rec.id}">編集</button>
        </div>
      `;

      item.querySelector('.btn-edit-session').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditModal(rec);
      });

      item.addEventListener('click', () => {
        this.openSegmentDetailModal(slice);
      });

      this.elDailySessionList.appendChild(item);
    });
  }

  // Render Timeline Legend (Without Future)
  renderTimelineLegend() {
    this.elTimelineLegend.innerHTML = '';
    this.categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-color" style="background-color: ${cat.color};"></span>
        <span>${cat.icon} ${cat.name}</span>
      `;
      this.elTimelineLegend.appendChild(item);
    });

    // Unrecorded
    const unrecItem = document.createElement('div');
    unrecItem.className = 'legend-item';
    unrecItem.innerHTML = `
      <span class="legend-color" style="background-color: #334155;"></span>
      <span>⏳ 未記録</span>
    `;
    this.elTimelineLegend.appendChild(unrecItem);
  }

  // Render History List (Days Overview)
  async refreshHistoryView() {
    this.elHistoryDaysList.innerHTML = '';
    const allRecords = await db.getAllRecords();

    // Group dates that have records or last 7 days
    const dateSet = new Set();
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dateSet.add(this.formatDateISO(d));
    }

    allRecords.forEach(r => {
      const d1 = this.formatDateISO(new Date(r.startAt));
      dateSet.add(d1);
      if (r.endAt) {
        const d2 = this.formatDateISO(new Date(r.endAt));
        dateSet.add(d2);
      }
    });

    const dates = Array.from(dateSet).sort().reverse();

    for (const dateStr of dates) {
      const data = await this.computeDaySegments(dateStr);
      const card = document.createElement('div');
      card.className = 'history-day-card';

      // Sleep, AI, and WALK highlights (compact short names + 7:42 format)
      const sleepMs = data.categoryTotals['sleep'] || 0;
      const aiMs = data.categoryTotals['ai'] || 0;
      const walkMs = data.categoryTotals['walk'] || 0;

      const [y, m, d] = dateStr.split('-');
      const dObj = new Date(Number(y), Number(m) - 1, Number(d));
      const days = ['日', '月', '火', '水', '木', '金', '土'];
      const displayDateStr = `${Number(m)}月${Number(d)}日 (${days[dObj.getDay()]})` + (dateStr === this.getTodayString() ? ' [今日]' : '');

      let pillsHtml = `
        <span class="history-pill" style="background: rgba(34, 197, 94, 0.2); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.4);">
          😴 睡 ${this.formatDurationClock(sleepMs)}
        </span>
        <span class="history-pill" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);">
          🤖 AI ${this.formatDurationClock(aiMs)}
        </span>
      `;

      if (walkMs > 0) {
        pillsHtml += `
          <span class="history-pill" style="background: rgba(6, 182, 212, 0.2); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.4);">
            🚶 WK ${this.formatDurationClock(walkMs)}
          </span>
        `;
      }

      card.innerHTML = `
        <div style="min-width: 0; overflow: hidden;">
          <div class="history-day-date">${displayDateStr}</div>
          <div class="history-day-pills">
            ${pillsHtml}
          </div>
        </div>
        <div style="color: var(--text-secondary); font-size: 20px; margin-left: 8px;">›</div>
      `;

      card.addEventListener('click', () => {
        this.selectedDate = dateStr;
        this.elTimelineDatePicker.value = dateStr;
        this.updateDateDisplay();
        this.switchTab('tab-timeline');
      });

      this.elHistoryDaysList.appendChild(card);
    }
  }

  // =========================================================================
  // Modals (Detail & Edit)
  // =========================================================================
  openSegmentDetailModal(slice) {
    this.selectedSegmentData = slice;
    const cat = slice.category;
    const rec = slice.record;
    const startD = new Date(rec.startAt);
    const endD = rec.endAt ? new Date(rec.endAt) : new Date();
    const isRunning = !rec.endAt;

    document.getElementById('modal-segment-title').textContent = `${cat.icon} ${cat.name}`;
    const body = document.getElementById('modal-segment-body');

    let html = `
      <div class="modal-detail-row">
        <span class="modal-detail-label">カテゴリ</span>
        <span class="modal-detail-val" style="color: ${cat.color}; font-weight:700;">${cat.icon} ${cat.name}</span>
      </div>
      <div class="modal-detail-row">
        <span class="modal-detail-label">開始日時</span>
        <span class="modal-detail-val">${this.formatDateTimeDisplay(startD)} (${String(startD.getSeconds()).padStart(2, '0')}秒)</span>
      </div>
      <div class="modal-detail-row">
        <span class="modal-detail-label">終了日時</span>
        <span class="modal-detail-val">${isRunning ? '<span style="color:#38bdf8;">計測中</span>' : `${this.formatDateTimeDisplay(endD)} (${String(endD.getSeconds()).padStart(2, '0')}秒)`}</span>
      </div>
      <div class="modal-detail-row">
        <span class="modal-detail-label">当日の継続時間</span>
        <span class="modal-detail-val" style="font-size:16px; color:#38bdf8;">${this.formatDurationShort(slice.durationMs)}</span>
      </div>
    `;

    if (slice.isSpanningMidnight) {
      html += `
        <div class="modal-detail-row" style="background: rgba(56, 189, 248, 0.1); padding: 8px 6px; border-radius: 4px;">
          <span class="modal-detail-label" style="color: #38bdf8;">セッション全体</span>
          <span class="modal-detail-val" style="color: #38bdf8;">${this.formatDurationShort(slice.totalSessionMs)} (日またぎ分割)</span>
        </div>
      `;
    }

    body.innerHTML = html;
    document.getElementById('btn-edit-from-detail').style.display = 'block';
    this.modalSegment.style.display = 'flex';
  }

  openUnrecordedDetailModal(slice) {
    const startD = new Date(slice.clipStartMs);
    const endD = new Date(slice.clipEndMs);

    document.getElementById('modal-segment-title').textContent = '⏳ 未記録区間';
    const body = document.getElementById('modal-segment-body');

    body.innerHTML = `
      <div class="modal-detail-row">
        <span class="modal-detail-label">区分</span>
        <span class="modal-detail-val" style="color: var(--text-secondary);">未記録時間</span>
      </div>
      <div class="modal-detail-row">
        <span class="modal-detail-label">開始</span>
        <span class="modal-detail-val">${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}</span>
      </div>
      <div class="modal-detail-row">
        <span class="modal-detail-label">終了</span>
        <span class="modal-detail-val">${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}</span>
      </div>
      <div class="modal-detail-row">
        <span class="modal-detail-label">継続時間</span>
        <span class="modal-detail-val" style="font-size:16px;">${this.formatDurationShort(slice.durationMs)}</span>
      </div>
    `;

    document.getElementById('btn-edit-from-detail').style.display = 'none';
    this.modalSegment.style.display = 'flex';
  }

  closeSegmentDetailModal() {
    this.modalSegment.style.display = 'none';
    this.selectedSegmentData = null;
  }

  populateEditCategoryOptions() {
    const sel = document.getElementById('edit-category');
    sel.innerHTML = '';
    this.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = `${cat.icon} ${cat.name}`;
      sel.appendChild(opt);
    });
  }

  openEditModal(record) {
    this.closeSegmentDetailModal();
    this.editErrorMsg.style.display = 'none';
    this.editErrorMsg.textContent = '';

    document.getElementById('edit-record-id').value = record.id;
    document.getElementById('edit-category').value = record.categoryId;

    const startD = new Date(record.startAt);
    document.getElementById('edit-start-time').value = this.formatDateTimeLocalInput(startD);

    if (record.endAt) {
      const endD = new Date(record.endAt);
      document.getElementById('edit-end-time').value = this.formatDateTimeLocalInput(endD);
    } else {
      document.getElementById('edit-end-time').value = '';
    }

    this.modalEdit.style.display = 'flex';
  }

  closeEditModal() {
    this.modalEdit.style.display = 'none';
    this.editErrorMsg.style.display = 'none';
  }

  async handleSaveEditRecord(e) {
    e.preventDefault();
    this.editErrorMsg.style.display = 'none';

    const id = document.getElementById('edit-record-id').value;
    const categoryId = document.getElementById('edit-category').value;
    const startVal = document.getElementById('edit-start-time').value;
    const endVal = document.getElementById('edit-end-time').value;

    if (!startVal) {
      this.showEditError('開始日時を入力してください。');
      return;
    }

    const startDate = new Date(startVal);
    const endDate = endVal ? new Date(endVal) : null;

    if (endDate && endDate.getTime() <= startDate.getTime()) {
      this.showEditError('終了日時は開始日時より後である必要があります。');
      return;
    }

    // Existing record fetch for created/updated timestamps
    const oldRec = await db.getRecordById(id);
    const newRecord = {
      id,
      categoryId,
      startAt: startDate.toISOString(),
      endAt: endDate ? endDate.toISOString() : null,
      createdAt: oldRec ? oldRec.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await db.saveRecord(newRecord);
      this.closeEditModal();
      this.showToast('✅ 記録を更新しました');
      await this.refreshActiveState();
      await this.refreshHomeView();
      await this.refreshTimelineView();
      await this.refreshHistoryView();
    } catch (err) {
      this.showEditError(err.message);
    }
  }

  async handleDeleteRecord() {
    const id = document.getElementById('edit-record-id').value;
    if (!id) return;
    if (!confirm('この記録を削除しますか？')) return;

    try {
      await db.deleteRecord(id);
      this.closeEditModal();
      this.showToast('🗑️ 記録を削除しました');
      await this.refreshActiveState();
      await this.refreshHomeView();
      await this.refreshTimelineView();
      await this.refreshHistoryView();
    } catch (err) {
      this.showEditError('削除失敗: ' + err.message);
    }
  }

  showEditError(msg) {
    this.editErrorMsg.textContent = msg;
    this.editErrorMsg.style.display = 'block';
  }

  // =========================================================================
  // Date Navigation
  // =========================================================================
  changeTimelineDate(deltaDays) {
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + deltaDays);
    this.selectedDate = this.formatDateISO(dateObj);
    this.elTimelineDatePicker.value = this.selectedDate;
    this.updateDateDisplay();
    this.refreshTimelineView();
  }

  updateDateDisplay() {
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const dObj = new Date(y, m - 1, d);
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const isToday = this.selectedDate === this.getTodayString();
    this.elTimelineDateDisplay.textContent = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')} (${days[dObj.getDay()]})${isToday ? ' [今日]' : ''}`;
  }

  // =========================================================================
  // Tab Navigation
  // =========================================================================
  switchTab(targetTabId) {
    document.querySelectorAll('.tab-pane').forEach(el => {
      el.classList.toggle('active', el.id === targetTabId);
    });

    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === targetTabId);
    });

    if (targetTabId === 'tab-timeline') {
      this.refreshTimelineView();
    } else if (targetTabId === 'tab-home') {
      this.refreshHomeView();
    } else if (targetTabId === 'tab-history') {
      this.refreshHistoryView();
    }
  }

  // =========================================================================
  // Temporary Demo Data for UI Review (Not permanently stored)
  // =========================================================================
  async loadDemoData() {
    try {
      // First clean up any previous demo records
      await this._removeDemoRecords();

      const [y, m, d] = this.selectedDate.split('-').map(Number);
      const prevD = new Date(y, m - 1, d - 1);
      const prevDateStr = this.formatDateISO(prevD);
      const targetDate = this.selectedDate;

      // Sample 1-day timeline showcasing:
      // 1. Spanning midnight sleep (23:00 - 06:30)
      // 2. Morning routine (other)
      // 3. Morning AI work
      // 4. Lunch SNS
      // 5. Afternoon AI deep work
      // 6. Evening Uber delivery
      // 7. Night SNS
      const demoList = [
        {
          id: 'demo_sleep_' + Date.now(),
          categoryId: 'sleep',
          startAt: `${prevDateStr}T23:00:00+09:00`,
          endAt: `${targetDate}T06:30:00+09:00`,
          isDemo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'demo_other_' + (Date.now() + 1),
          categoryId: 'other',
          startAt: `${targetDate}T07:15:00+09:00`,
          endAt: `${targetDate}T08:00:00+09:00`,
          isDemo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'demo_ai1_' + (Date.now() + 2),
          categoryId: 'ai',
          startAt: `${targetDate}T08:30:00+09:00`,
          endAt: `${targetDate}T12:00:00+09:00`,
          isDemo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'demo_sns1_' + (Date.now() + 3),
          categoryId: 'sns',
          startAt: `${targetDate}T12:00:00+09:00`,
          endAt: `${targetDate}T12:45:00+09:00`,
          isDemo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'demo_ai2_' + (Date.now() + 4),
          categoryId: 'ai',
          startAt: `${targetDate}T13:30:00+09:00`,
          endAt: `${targetDate}T17:00:00+09:00`,
          isDemo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'demo_walk_' + (Date.now() + 5),
          categoryId: 'walk',
          startAt: `${targetDate}T17:15:00+09:00`,
          endAt: `${targetDate}T18:00:00+09:00`,
          isDemo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'demo_uber_' + (Date.now() + 6),
          categoryId: 'uber',
          startAt: `${targetDate}T18:15:00+09:00`,
          endAt: `${targetDate}T19:45:00+09:00`,
          isDemo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'demo_sns2_' + (Date.now() + 7),
          categoryId: 'sns',
          startAt: `${targetDate}T20:15:00+09:00`,
          endAt: `${targetDate}T21:30:00+09:00`,
          isDemo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      for (const item of demoList) {
        await db._putRecordDirect(item);
      }

      await this.refreshTimelineView();
      await this.refreshHomeView();
      await this.refreshHistoryView();

      this.showToast('🧪 1日分のデモデータを表示しました（「🗑️ デモクリア」で戻せます）');
    } catch (err) {
      console.error('Error loading demo data:', err);
      this.showToast('デモデータの投入に失敗しました: ' + err.message);
    }
  }

  async clearDemoData() {
    try {
      const count = await this._removeDemoRecords();
      await this.refreshTimelineView();
      await this.refreshHomeView();
      await this.refreshHistoryView();
      this.showToast(`🗑️ デモデータを消去しました (${count}件)`);
    } catch (err) {
      console.error('Error clearing demo data:', err);
      this.showToast('デモデータ消去エラー: ' + err.message);
    }
  }

  async _removeDemoRecords() {
    const all = await db.getAllRecords();
    const demoRecords = all.filter(r => r.isDemo || (r.id && r.id.startsWith('demo_')));
    for (const r of demoRecords) {
      await db.deleteRecord(r.id);
    }
    return demoRecords.length;
  }

  // =========================================================================
  // CSV Export & Backup/Restore
  // =========================================================================
  async exportCSV() {
    try {
      const records = await db.getAllRecords();
      if (records.length === 0) {
        this.showToast('出力する記録がありません');
        return;
      }

      // Headers: date, category, start_datetime, end_datetime, duration_minutes
      const rows = [
        ['date', 'category', 'start_datetime', 'end_datetime', 'duration_minutes']
      ];

      records.forEach(rec => {
        const startD = new Date(rec.startAt);
        const endD = rec.endAt ? new Date(rec.endAt) : new Date();
        const durationMin = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60));
        const cat = this.categories.find(c => c.id === rec.categoryId) || { name: rec.categoryId };

        rows.push([
          this.formatDateISO(startD),
          cat.name,
          rec.startAt,
          rec.endAt || '',
          durationMin
        ]);
      });

      const csvString = rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      // UTF-8 BOM for Excel
      const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
      this.downloadBlob(blob, `timenote_export_${this.getTodayString()}.csv`);
      this.showToast('📥 CSVを出力しました');
    } catch (err) {
      console.error('CSV Export Error:', err);
      this.showToast('CSV出力に失敗しました');
    }
  }

  async exportJSONBackup() {
    try {
      const backupData = await db.exportBackup();
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      this.downloadBlob(blob, `timenote_backup_${this.getTodayString()}.json`);
      this.showToast('💾 JSONバックアップを保存しました');
    } catch (err) {
      console.error('JSON Export Error:', err);
      this.showToast('バックアップ保存に失敗しました');
    }
  }

  async importJSONBackup(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!confirm(`バックアップデータ（記録 ${data.records ? data.records.length : 0} 件）を復元しますか？現在のデータは上書きされます。`)) {
        return;
      }

      await db.importBackup(data);
      this.categories = await db.getCategories();
      this.renderHomeCategoryButtons();
      this.renderTimelineLegend();
      this.populateEditCategoryOptions();

      await this.refreshActiveState();
      await this.refreshHomeView();
      await this.refreshTimelineView();
      await this.refreshHistoryView();

      this.showToast('🎉 バックアップを復元しました');
    } catch (err) {
      console.error('Import Error:', err);
      this.showToast('復元エラー: ' + err.message);
    }
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showToast(message) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 2800);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
          console.log('ServiceWorker registration ignored/failed:', err);
        });
      });
    }
  }

  // =========================================================================
  // Event Bindings
  // =========================================================================
  bindEvents() {
    // Bottom Nav Tabs
    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        this.switchTab(tabId);
      });
    });

    // Explicit Stop active button
    this.elBtnStopActive.addEventListener('click', () => this.handleStopActiveClick());

    // Timeline Date Nav
    document.getElementById('btn-prev-day').addEventListener('click', () => this.changeTimelineDate(-1));
    document.getElementById('btn-next-day').addEventListener('click', () => this.changeTimelineDate(1));
    document.getElementById('btn-today-day').addEventListener('click', () => {
      this.selectedDate = this.getTodayString();
      this.elTimelineDatePicker.value = this.selectedDate;
      this.updateDateDisplay();
      this.refreshTimelineView();
    });

    this.elTimelineDatePicker.addEventListener('change', (e) => {
      if (e.target.value) {
        this.selectedDate = e.target.value;
        this.updateDateDisplay();
        this.refreshTimelineView();
      }
    });

    // Modals
    document.getElementById('btn-close-segment-modal').addEventListener('click', () => this.closeSegmentDetailModal());
    document.getElementById('btn-close-detail').addEventListener('click', () => this.closeSegmentDetailModal());
    this.modalSegment.addEventListener('click', (e) => {
      if (e.target === this.modalSegment) this.closeSegmentDetailModal();
    });

    document.getElementById('btn-edit-from-detail').addEventListener('click', () => {
      if (this.selectedSegmentData && this.selectedSegmentData.record) {
        this.openEditModal(this.selectedSegmentData.record);
      }
    });

    document.getElementById('btn-close-edit-modal').addEventListener('click', () => this.closeEditModal());
    document.getElementById('btn-cancel-edit').addEventListener('click', () => this.closeEditModal());
    this.modalEdit.addEventListener('click', (e) => {
      if (e.target === this.modalEdit) this.closeEditModal();
    });

    this.formEditRecord.addEventListener('submit', (e) => this.handleSaveEditRecord(e));
    document.getElementById('btn-delete-record').addEventListener('click', () => this.handleDeleteRecord());

    // Demo Data Actions
    const btnLoadDemo = document.getElementById('btn-load-demo');
    if (btnLoadDemo) {
      btnLoadDemo.addEventListener('click', () => this.loadDemoData());
    }
    const btnClearDemo = document.getElementById('btn-clear-demo');
    if (btnClearDemo) {
      btnClearDemo.addEventListener('click', () => this.clearDemoData());
    }

    // Settings actions
    document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCSV());
    document.getElementById('btn-export-json').addEventListener('click', () => this.exportJSONBackup());
    document.getElementById('input-import-json').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.importJSONBackup(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Screen Resume & Visibility sync (when browser is reopened or unlocked)
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        await this.refreshActiveState();
        this.updateClockAndDuration();
        await this.refreshHomeView();
        await this.refreshTimelineView();
      }
    });

    window.addEventListener('pageshow', async () => {
      await this.refreshActiveState();
      this.updateClockAndDuration();
      await this.refreshHomeView();
      await this.refreshTimelineView();
    });

    window.addEventListener('focus', async () => {
      await this.refreshActiveState();
      this.updateClockAndDuration();
    });
  }
}

// Instantiate and start
const app = new TimeNoteApp();
window.addEventListener('DOMContentLoaded', () => {
  app.init();
});
