/* ═══════════════════════════════════════════════════════════════════════════
   BASIL & GRAPE - CHEF OPS BOARD
   Frontend Application
   46-48 George Street, Croydon CR0 1PB
   https://basilandgrape.com
   ═══════════════════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  const CONFIG = {
    API_BASE: '/api',
    REFRESH_INTERVAL: 30000,
    TOAST_DURATION: 4000,
    DATE_LOCALE: 'en-GB',
    TIMEZONE: 'Europe/London'
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // APPLICATION STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const state = {
    user: null,
    token: null,
    data: {
      out: [],
      low: [],
      maint: [],
      notes: [],
      shiftLog: [],
      settings: {},
      stats: { outCount: 0, lowCount: 0, maintCount: 0, notesCount: 0 }
    },
    filters: {
      search: '',
      severity: { none: true, low: true, maint: true }
    },
    socketInstance: null,
    connected: false,
    refreshTimer: null
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = Math.max(0, now - date.getTime());
    const mins = Math.floor(diff / 60000);
    
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString(CONFIG.DATE_LOCALE, { 
      day: 'numeric', 
      month: 'short' 
    });
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString(CONFIG.DATE_LOCALE, {
      timeZone: CONFIG.TIMEZONE,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOAST NOTIFICATION SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  const Toast = {
    container: null,

    init() {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.setAttribute('aria-live', 'polite');
      document.body.appendChild(this.container);
    },

    show(message, type = 'success') {
      const icons = {
        success: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>`,
        error: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>`,
        warning: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>`,
        info: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>`
      };

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `
        ${icons[type] || icons.info}
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Dismiss notification">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      `;

      this.container.appendChild(toast);

      const dismiss = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      };

      toast.querySelector('.toast-close').addEventListener('click', dismiss);
      setTimeout(dismiss, CONFIG.TOAST_DURATION);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // API CLIENT
  // ═══════════════════════════════════════════════════════════════════════════

  const API = {
    async request(endpoint, options = {}) {
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };

      if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
      }

      try {
        const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
          ...options,
          headers
        });

        if (response.status === 401) {
          this.handleUnauthorized();
          throw new Error('Session expired. Please log in again.');
        }

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Request failed');
        }

        return data;
      } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new Error('Network error. Please check your connection.');
        }
        throw error;
      }
    },

    handleUnauthorized() {
      localStorage.removeItem('bg-token');
      localStorage.removeItem('bg-user');
      state.token = null;
      state.user = null;
      window.location.href = '/login';
    },

    // Board
    getBoard() {
      return this.request('/board');
    },

    getStats() {
      return this.request('/stats');
    },

    getExport() {
      return this.request('/export');
    },

    // Stock
    addStock(category, item, detail, severity) {
      return this.request('/stock', {
        method: 'POST',
        body: JSON.stringify({ category, item, detail, severity })
      });
    },

    resolveStock(id) {
      return this.request(`/stock/${id}`, { method: 'DELETE' });
    },

    // Maintenance
    addMaintenance(item, detail, severity) {
      return this.request('/maintenance', {
        method: 'POST',
        body: JSON.stringify({ item, detail, severity })
      });
    },

    resolveMaintenance(id) {
      return this.request(`/maintenance/${id}`, { method: 'DELETE' });
    },

    // Notes
    addNote(text) {
      return this.request('/notes', {
        method: 'POST',
        body: JSON.stringify({ text })
      });
    },

    resolveNote(id) {
      return this.request(`/notes/${id}`, { method: 'DELETE' });
    },

    // Shift log
    addShiftEntry(shiftType, focus, eta, notes) {
      return this.request('/shift-log', {
        method: 'POST',
        body: JSON.stringify({ shiftType, focus, eta, notes })
      });
    },

    deleteShiftEntry(id) {
      return this.request(`/shift-log/${id}`, { method: 'DELETE' });
    },

    // Settings
    updateSetting(key, value) {
      return this.request(`/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value })
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  const Socket = {
    init() {
      if (typeof io === 'undefined') {
        console.warn('Socket.IO not available - real-time sync disabled');
        return;
      }

      try {
        state.socketInstance = io({
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });

        state.socketInstance.on('connect', () => {
          console.log('Connected to server');
          state.connected = true;
          this.updateIndicator();
          
          if (state.token) {
            state.socketInstance.emit('join-board', state.token);
          }
        });

        state.socketInstance.on('disconnect', () => {
          console.log('Disconnected from server');
          state.connected = false;
          this.updateIndicator();
        });

        state.socketInstance.on('reconnect', (attemptNumber) => {
          console.log(`Reconnected after ${attemptNumber} attempts`);
          Toast.success('Reconnected to server');
        });

        state.socketInstance.on('sync', (data) => {
          console.log('Sync event received:', data);
          if (data.type === 'refresh') {
            loadBoardData();
          }
        });

        state.socketInstance.on('user-joined', (data) => {
          if (data.name !== state.user?.name) {
            Toast.info(`${data.name} joined the board`);
          }
        });

        state.socketInstance.on('user-left', (data) => {
          Toast.info(`${data.name} left the board`);
        });

        state.socketInstance.on('auth-error', (msg) => {
          Toast.error('Authentication error');
          console.error('Socket auth error:', msg);
        });

      } catch (err) {
        console.error('Socket initialization failed:', err);
      }
    },

    updateIndicator() {
      const dot = $('.sync-dot');
      const text = $('.sync-text');
      
      if (dot) {
        dot.classList.toggle('disconnected', !state.connected);
      }
      if (text) {
        text.textContent = state.connected ? 'Live' : 'Offline';
      }
    },

    emit(event, data) {
      if (state.socketInstance && state.connected) {
        state.socketInstance.emit(event, data);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const Render = {
    // Update statistics counters
    stats() {
      const { stats } = state.data;
      
      const elements = {
        'count-out': stats.outCount || 0,
        'count-low': stats.lowCount || 0,
        'count-maint': stats.maintCount || 0
      };

      Object.entries(elements).forEach(([id, value]) => {
        const el = $(`#${id}`);
        if (el) {
          el.textContent = value;
          // Add animation
          el.classList.add('updated');
          setTimeout(() => el.classList.remove('updated'), 300);
        }
      });
    },

    // Update settings display
    settings() {
      const { settings } = state.data;
      
      const floorLead = $('#floor-lead');
      const contactPhone = $('#contact-phone');
      
      if (floorLead) {
        floorLead.textContent = settings.floor_lead || 'Update name';
      }
      if (contactPhone) {
        contactPhone.textContent = settings.phone || '020 8680 1801';
      }
    },

    // Update user display
    user() {
      const userBadge = $('#user-badge');
      if (userBadge && state.user) {
        userBadge.innerHTML = `
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
          </svg>
          <span>${escapeHtml(state.user.name)}</span>
        `;
        userBadge.classList.remove('hidden');
      }
    },

    // Check if item matches current filters
    matchesFilters(entry, type) {
      const search = state.filters.search.toLowerCase().trim();
      
      // Check severity filter (not for notes)
      if (type !== 'notes' && type !== 'shiftLog') {
        const sev = entry.severity || (type === 'maint' ? 'maint' : 'low');
        if (!state.filters.severity[sev]) {
          return false;
        }
      }

      // Check search filter
      if (search) {
        const searchFields = [
          entry.item,
          entry.text,
          entry.detail,
          entry.focus,
          entry.eta,
          entry.shift_type
        ].filter(Boolean).join(' ').toLowerCase();
        
        if (!searchFields.includes(search)) {
          return false;
        }
      }

      return true;
    },

    // Render stock list (out or low)
    stockList(category, containerId) {
      const container = $(`#${containerId}`);
      if (!container) return;

      const items = state.data[category] || [];
      const filtered = items.filter(item => this.matchesFilters(item, category));

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
            <p>No items</p>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map(item => {
        const severityLabel = item.severity === 'none' ? 'STOP' : 'LOW';
        const severityClass = item.severity || 'low';
        
        return `
          <div class="item" data-id="${item.id}">
            <div class="item-header">
              <div>
                <div class="item-title">${escapeHtml(item.item)}</div>
                ${item.detail ? `<div class="item-detail">${escapeHtml(item.detail)}</div>` : ''}
              </div>
              <span class="badge ${severityClass}">${severityLabel}</span>
            </div>
            <div class="item-meta">
              <span class="meta">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                </svg>
                ${timeAgo(item.created_at)}
              </span>
            </div>
            <div class="item-actions">
              <button class="ghost-btn btn-sm" data-action="resolve-stock" data-id="${item.id}">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                Clear
              </button>
            </div>
          </div>
        `;
      }).join('');
    },

    // Render maintenance list
    maintenanceList() {
      const container = $('#maint-list');
      if (!container) return;

      const items = state.data.maint || [];
      const filtered = items.filter(item => this.matchesFilters(item, 'maint'));

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"/>
            </svg>
            <p>No maintenance items</p>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map(item => {
        const severityLabel = item.severity === 'none' ? 'OUT' : 'FIX';
        const severityClass = item.severity || 'maint';
        
        return `
          <div class="item" data-id="${item.id}">
            <div class="item-header">
              <div>
                <div class="item-title">${escapeHtml(item.item)}</div>
                ${item.detail ? `<div class="item-detail">${escapeHtml(item.detail)}</div>` : ''}
              </div>
              <span class="badge ${severityClass}">${severityLabel}</span>
            </div>
            <div class="item-meta">
              <span class="meta">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                </svg>
                ${timeAgo(item.created_at)}
              </span>
            </div>
            <div class="item-actions">
              <button class="ghost-btn btn-sm" data-action="resolve-maint" data-id="${item.id}">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                Clear
              </button>
            </div>
          </div>
        `;
      }).join('');
    },

    // Render notes list
    notesList() {
      const container = $('#note-list');
      if (!container) return;

      const items = state.data.notes || [];
      const filtered = items.filter(item => this.matchesFilters(item, 'notes'));

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
            </svg>
            <p>No notes</p>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map(item => `
        <div class="item" data-id="${item.id}">
          <div class="item-header">
            <div class="item-title">${escapeHtml(item.text)}</div>
            <button class="ghost-btn btn-sm" data-action="resolve-note" data-id="${item.id}">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              Clear
            </button>
          </div>
          <div class="meta">${timeAgo(item.created_at)}</div>
        </div>
      `).join('');
    },

    // Render shift log
    shiftLog() {
      const container = $('#shift-list');
      if (!container) return;

      const items = state.data.shiftLog || [];

      if (items.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p>No shift handovers yet</p>
          </div>
        `;
        return;
      }

      container.innerHTML = items.map(item => `
        <div class="item" data-id="${item.id}">
          <div class="item-header">
            <div>
              <div class="item-title">
                <span class="badge info">${escapeHtml(item.shift_type)}</span>
                <span style="margin-left: 8px;">${escapeHtml(item.focus)}</span>
              </div>
              ${item.eta ? `<div class="item-detail">Next check: ${escapeHtml(item.eta)}</div>` : ''}
              ${item.notes ? `<div class="item-detail text-muted">${escapeHtml(item.notes)}</div>` : ''}
            </div>
            <button class="ghost-btn btn-sm" data-action="delete-shift" data-id="${item.id}">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
              Delete
            </button>
          </div>
          <div class="meta">
            <span>${timeAgo(item.created_at)}</span>
            ${item.created_by_name ? `<span>by ${escapeHtml(item.created_by_name)}</span>` : ''}
          </div>
        </div>
      `).join('');
    },

    // Render all components
    all() {
      this.stats();
      this.settings();
      this.user();
      this.stockList('out', 'out-list');
      this.stockList('low', 'low-list');
      this.maintenanceList();
      this.notesList();
      this.shiftLog();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadBoardData() {
    try {
      const data = await API.getBoard();
      state.data = data;
      Render.all();
      return true;
    } catch (error) {
      console.error('Failed to load board data:', error);
      if (error.message !== 'Session expired. Please log in again.') {
        Toast.error('Failed to load data. Retrying...');
      }
      return false;
    }
  }

  function startAutoRefresh() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
    }
    
    state.refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadBoardData();
      }
    }, CONFIG.REFRESH_INTERVAL);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORM HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const FormHandlers = {
    async handleOutStock(form) {
      const item = $('#out-item')?.value.trim();
      const detail = $('#out-detail')?.value.trim() || '';
      const severity = $('#out-sev')?.value || 'none';

      if (!item) {
        Toast.warning('Please enter an item name');
        $('#out-item')?.focus();
        return;
      }

      try {
        await API.addStock('out', item, detail, severity);
        Toast.success('Added to out of stock');
        form.reset();
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to add item');
      }
    },

    async handleLowStock(form) {
      const item = $('#low-item')?.value.trim();
      const detail = $('#low-detail')?.value.trim() || '';
      const severity = $('#low-sev')?.value || 'low';

      if (!item) {
        Toast.warning('Please enter an item name');
        $('#low-item')?.focus();
        return;
      }

      try {
        await API.addStock('low', item, detail, severity);
        Toast.success('Added to low stock watch');
        form.reset();
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to add item');
      }
    },

    async handleMaintenance(form) {
      const item = $('#maint-item')?.value.trim();
      const detail = $('#maint-detail')?.value.trim() || '';
      const severity = $('#maint-sev')?.value || 'maint';

      if (!item) {
        Toast.warning('Please enter an item name');
        $('#maint-item')?.focus();
        return;
      }

      try {
        await API.addMaintenance(item, detail, severity);
        Toast.success('Maintenance ticket added');
        form.reset();
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to add maintenance item');
      }
    },

    async handleNote(form) {
      const text = $('#note-text')?.value.trim();

      if (!text) {
        Toast.warning('Please enter a note');
        $('#note-text')?.focus();
        return;
      }

      try {
        await API.addNote(text);
        Toast.success('Note added');
        form.reset();
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to add note');
      }
    },

    async handleShiftEntry(form) {
      const shiftType = $('#shift-type')?.value;
      const focus = $('#shift-focus')?.value.trim();
      const eta = $('#shift-eta')?.value.trim() || '';

      if (!focus) {
        Toast.warning('Please enter a focus for the shift');
        $('#shift-focus')?.focus();
        return;
      }

      try {
        await API.addShiftEntry(shiftType, focus, eta, '');
        Toast.success('Shift handover logged');
        form.reset();
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to add shift entry');
      }
    },

    async handleContactUpdate(form) {
      const phone = $('#contact-input')?.value.trim();
      
      if (!phone) {
        Toast.warning('Please enter a phone number');
        return;
      }

      try {
        await API.updateSetting('phone', phone);
        Toast.success('Contact updated');
        form.reset();
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to update contact');
      }
    },

    async handleLeadUpdate(form) {
      const name = $('#lead-input')?.value.trim();
      
      if (!name) {
        Toast.warning('Please enter a name');
        return;
      }

      try {
        await API.updateSetting('floor_lead', name);
        Toast.success('Floor lead updated');
        form.reset();
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to update floor lead');
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const ActionHandlers = {
    async resolveStock(id) {
      try {
        await API.resolveStock(id);
        Toast.success('Item cleared');
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to clear item');
      }
    },

    async resolveMaintenance(id) {
      try {
        await API.resolveMaintenance(id);
        Toast.success('Maintenance item cleared');
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to clear item');
      }
    },

    async resolveNote(id) {
      try {
        await API.resolveNote(id);
        Toast.success('Note cleared');
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to clear note');
      }
    },

    async deleteShift(id) {
      try {
        await API.deleteShiftEntry(id);
        Toast.success('Shift entry deleted');
        await loadBoardData();
      } catch (error) {
        Toast.error(error.message || 'Failed to delete shift entry');
      }
    },

    copyBrief() {
      const { out, low, maint, notes, shiftLog, settings } = state.data;
      const now = new Date().toLocaleString(CONFIG.DATE_LOCALE, { 
        timeZone: CONFIG.TIMEZONE,
        dateStyle: 'full',
        timeStyle: 'short'
      });

      const divider = '─'.repeat(50);
      const doubleDivider = '═'.repeat(50);

      const lines = [
        doubleDivider,
        'BASIL & GRAPE · CHEF OPS BRIEF',
        settings.address || '46-48 George Street, Croydon, CR0 1PB',
        now,
        doubleDivider,
        '',
        `Floor Lead: ${settings.floor_lead || 'N/A'}`,
        `Contact: ${settings.phone || 'N/A'}`,
        '',
        divider,
        `OUT OF STOCK (${out.length})`,
        divider,
        ...(out.length > 0 
          ? out.map(i => `• ${i.item}${i.detail ? ': ' + i.detail : ''}`)
          : ['  No items']),
        '',
        divider,
        `RUNNING LOW (${low.length})`,
        divider,
        ...(low.length > 0 
          ? low.map(i => `• ${i.item}${i.detail ? ': ' + i.detail : ''}`)
          : ['  No items']),
        '',
        divider,
        `MAINTENANCE (${maint.length})`,
        divider,
        ...(maint.length > 0 
          ? maint.map(i => `• ${i.item}${i.detail ? ': ' + i.detail : ''}`)
          : ['  No items']),
        '',
        divider,
        'TEAM NOTES',
        divider,
        ...(notes.length > 0 
          ? notes.map(n => `• ${n.text}`)
          : ['  No notes']),
        '',
        divider,
        'RECENT SHIFT HANDOVERS',
        divider,
        ...(shiftLog.length > 0 
          ? shiftLog.slice(0, 5).map(h => `• ${h.shift_type}: ${h.focus}${h.eta ? ' → Next: ' + h.eta : ''}`)
          : ['  No handovers logged']),
        '',
        doubleDivider,
        'Generated from Basil & Grape Chef Ops Board',
        doubleDivider
      ];

      const text = lines.join('\n');

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => {
            Toast.success('Service brief copied to clipboard!');
            const btn = $('#copy-brief');
            if (btn) {
              const originalText = btn.textContent;
              btn.textContent = 'Copied!';
              setTimeout(() => { btn.textContent = originalText; }, 2000);
            }
          })
          .catch(() => {
            Toast.error('Failed to copy. Please try again.');
          });
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
          document.execCommand('copy');
          Toast.success('Service brief copied!');
        } catch (err) {
          Toast.error('Failed to copy');
        }
        
        document.body.removeChild(textarea);
      }
    },

    async resetBoard() {
      if (!confirm('Are you sure you want to reset the board? This will clear all items and restore defaults.')) {
        return;
      }

      Toast.info('Reset functionality requires admin access');
    },

    logout() {
      if (confirm('Are you sure you want to log out?')) {
        localStorage.removeItem('bg-token');
        localStorage.removeItem('bg-user');
        state.token = null;
        state.user = null;
        window.location.href = '/login';
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTER HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const FilterHandlers = {
    handleSearch: debounce((value) => {
      state.filters.search = value;
      Render.stockList('out', 'out-list');
      Render.stockList('low', 'low-list');
      Render.maintenanceList();
      Render.notesList();
    }, 200),

    clearSearch() {
      state.filters.search = '';
      const input = $('#search-input');
      if (input) input.value = '';
      Render.all();
    },

    toggleSeverity(severity) {
      state.filters.severity[severity] = !state.filters.severity[severity];
      Render.stockList('out', 'out-list');
      Render.stockList('low', 'low-list');
      Render.maintenanceList();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT BINDING
  // ═══════════════════════════════════════════════════════════════════════════

  function bindEvents() {
    // Form submissions
    const forms = {
      'out-form': FormHandlers.handleOutStock,
      'low-form': FormHandlers.handleLowStock,
      'maint-form': FormHandlers.handleMaintenance,
      'note-form': FormHandlers.handleNote,
      'shift-form': FormHandlers.handleShiftEntry,
      'contact-form': FormHandlers.handleContactUpdate,
      'lead-form': FormHandlers.handleLeadUpdate
    };

    Object.entries(forms).forEach(([formId, handler]) => {
      const form = $(`#${formId}`);
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const submitBtn = form.querySelector('button[type="submit"]');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('loading');
          }
          
          try {
            await handler.call(FormHandlers, form);
          } finally {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.classList.remove('loading');
            }
          }
        });
      }
    });

    // Delegated click handlers for dynamic elements
    document.body.addEventListener('click', async (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const id = parseInt(button.dataset.id, 10);

      button.disabled = true;

      try {
        switch (action) {
          case 'resolve-stock':
            await ActionHandlers.resolveStock(id);
            break;
          case 'resolve-maint':
            await ActionHandlers.resolveMaintenance(id);
            break;
          case 'resolve-note':
            await ActionHandlers.resolveNote(id);
            break;
          case 'delete-shift':
            await ActionHandlers.deleteShift(id);
            break;
        }
      } finally {
        button.disabled = false;
      }
    });

    // Toolbar buttons
    $('#copy-brief')?.addEventListener('click', () => ActionHandlers.copyBrief());
    $('#reset-board')?.addEventListener('click', () => ActionHandlers.resetBoard());
    $('#logout-btn')?.addEventListener('click', () => ActionHandlers.logout());

    // Search
    const searchInput = $('#search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        FilterHandlers.handleSearch(e.target.value);
      });
    }

    const searchForm = $('#search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        FilterHandlers.clearSearch();
      });
    }

    // Severity filter chips
    $$('.chip[data-sev]').forEach(chip => {
      chip.addEventListener('click', () => {
        const sev = chip.dataset.sev;
        FilterHandlers.toggleSeverity(sev);
        chip.classList.toggle('active', state.filters.severity[sev]);
      });
    });

    // Visibility change - refresh when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadBoardData();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K - Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        $('#search-input')?.focus();
      }
      
      // Escape - Clear search
      if (e.key === 'Escape') {
        FilterHandlers.clearSearch();
        document.activeElement?.blur();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  async function checkAuth() {
    state.token = localStorage.getItem('bg-token');
    const userJson = localStorage.getItem('bg-user');
    
    if (!state.token) {
      window.location.href = '/login';
      return false;
    }

    try {
      state.user = userJson ? JSON.parse(userJson) : null;
    } catch (e) {
      state.user = null;
    }

    // Verify token is still valid
    try {
      const response = await fetch('/api/auth/verify', {
        headers: {
          'Authorization': `Bearer ${state.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Token invalid');
      }
      
      const data = await response.json();
      state.user = data.user;
      localStorage.setItem('bg-user', JSON.stringify(data.user));
      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('bg-token');
      localStorage.removeItem('bg-user');
      window.location.href = '/login';
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING SCREEN
  // ═══════════════════════════════════════════════════════════════════════════

  function hideLoadingScreen() {
    const loadingScreen = $('.loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
      document.body.classList.remove('loading');
    }
  }

  function showLoadingScreen() {
    const loadingScreen = $('.loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.remove('hidden');
      document.body.classList.add('loading');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async function init() {
    console.log('🍕 Basil & Grape Chef Ops Board initializing...');
    
    // Initialize toast system
    Toast.init();
    
    // Check authentication
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
      return;
    }


    // Load initial data
    const dataLoaded = await loadBoardData();
    
    if (!dataLoaded) {
      Toast.error('Failed to load initial data. Please refresh the page.');
    }

    // Initialize WebSocket connection
    Socket.init();

    // Bind all event handlers
    bindEvents();

    // Start auto-refresh
    startAutoRefresh();

    // Hide loading screen
    hideLoadingScreen();

    // Log successful initialization
    console.log('✅ Basil & Grape Chef Ops Board ready!');
    console.log(`👤 Logged in as: ${state.user?.name || 'Unknown'}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // START APPLICATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose some functions globally for debugging (optional)
  window.BasilGrapeOps = {
    getState: () => ({ ...state }),
    refresh: loadBoardData,
    toast: Toast
  };

})();


