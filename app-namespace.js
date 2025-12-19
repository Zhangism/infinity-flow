// app-namespace.js - Unified Application Namespace
// This file creates the central App namespace for module registration

window.App = window.App || {
    // Core module references (will be populated by respective modules)
    Storage: null,
    UI: null,
    Schedule: null,
    Calendar: null,

    // Controllers namespace
    Controllers: {},

    // Shared application state
    state: {
        currentWeekFile: null,
        weekId: null,
        weekData: null,
        longTermData: null,
        recurringData: null,
        currentDateStr: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
        timerInterval: null,
        currentTimerTaskId: null,
        undoState: null,
        undoTimeout: null
    },

    // Shared drag & drop state
    drag: {
        srcType: null,
        payload: null
    },

    // Helper to get current date string
    getCurrentDateStr: function () {
        return this.state.currentDateStr || window.getLocalTodayStr?.() || new Date().toISOString().split('T')[0];
    },

    // Helper to get current day data
    getCurrentDayData: function () {
        const dateStr = this.getCurrentDateStr();
        return this.state.weekData?.dailyData?.[dateStr] || null;
    }
};

// Backward compatibility: expose appData on window
// This getter/setter pattern ensures both window.appData and App.state stay in sync
if (!window.appData) {
    Object.defineProperty(window, 'appData', {
        get: () => window.App.state,
        set: (val) => { window.App.state = val; },
        configurable: true
    });
}

// Backward compatibility: expose drag state on window
Object.defineProperty(window, 'dragSrcType', {
    get: () => window.App.drag.srcType,
    set: (val) => { window.App.drag.srcType = val; },
    configurable: true
});

Object.defineProperty(window, 'dragPayload', {
    get: () => window.App.drag.payload,
    set: (val) => { window.App.drag.payload = val; },
    configurable: true
});

console.log('[App] Namespace initialized');
