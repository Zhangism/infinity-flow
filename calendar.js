class CalendarModule {
    constructor() {
        console.log('CalendarModule initialized');
        this.currentViewDate = new Date();
        this.modal = null;
        this.grid = null;
        this.title = null;
        this.monthCache = {}; 
    }

    init() {
        console.log('CalendarModule.init() called');
        this.modal = document.getElementById('calendar-modal-overlay');
        this.grid = document.getElementById('calendar-grid');
        this.title = document.getElementById('calendar-title');
        
        if (!this.modal) {
            console.error('Calendar modal overlay not found!');
            return;
        }

        // Close modal when clicking outside
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
    }

    open() {
        console.log('CalendarModule.open() called');
        if (!this.modal) {
            console.error('Calendar modal not initialized');
            return;
        }
        
        // Reset to current viewing date or default to today if not set
        if (!this.currentViewDate) this.currentViewDate = new Date();
        
        this.modal.style.display = 'flex';
        this.render(this.currentViewDate.getFullYear(), this.currentViewDate.getMonth());
    }

    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }

    prevMonth() {
        this.currentViewDate.setMonth(this.currentViewDate.getMonth() - 1);
        this.render(this.currentViewDate.getFullYear(), this.currentViewDate.getMonth());
    }

    nextMonth() {
        this.currentViewDate.setMonth(this.currentViewDate.getMonth() + 1);
        this.render(this.currentViewDate.getFullYear(), this.currentViewDate.getMonth());
    }

    async render(year, month) {
        if (!this.grid || !this.title) return;

        // Update Title
        const date = new Date(year, month, 1);
        this.title.textContent = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });

        // Clear Grid
        this.grid.innerHTML = '';

        // Calculate Days
        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Adjust for Monday start (0=Sun, 1=Mon...6=Sat) -> (0=Mon...6=Sun)
        // Standard JS Day: 0(Sun) 1(Mon) 2(Tue) 3(Wed) 4(Thu) 5(Fri) 6(Sat)
        // We want: 0(Mon) 1(Tue) 2(Wed) 3(Thu) 4(Fri) 5(Sat) 6(Sun)
        let startDay = firstDayOfMonth.getDay(); 
        startDay = startDay === 0 ? 6 : startDay - 1; 

        // Previous Month Padding
        const prevMonthDays = new Date(year, month, 0).getDate();
        for (let i = 0; i < startDay; i++) {
            const dayNum = prevMonthDays - startDay + 1 + i;
            const cell = document.createElement('div');
            cell.className = 'calendar-day padding-day';
            cell.textContent = dayNum;
            this.grid.appendChild(cell);
        }

        // Current Month Days
        const monthData = await this.fetchMonthData(year, month);
        
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            cell.textContent = i;
            
            // Add Heatmap Class
            if (monthData[dateStr]) {
                const { completionRate, hasOverdue } = monthData[dateStr];
                const level = this.getHeatmapLevel(completionRate);
                cell.classList.add(`level-${level}`);
                
                if (hasOverdue) {
                    cell.classList.add('has-overdue');
                }
                
                // Tooltip logic could go here
                cell.title = `完成率：${completionRate}%`;
            } else {
                cell.classList.add('level-0');
            }

            // Highlight Today
            const todayStr = new Date().toISOString().split('T')[0];
            if (dateStr === todayStr) {
                cell.classList.add('is-today');
            }

            cell.onclick = () => this.selectDate(dateStr);
            this.grid.appendChild(cell);
        }

        // Next Month Padding
        const totalCells = startDay + daysInMonth;
        const remainingCells = (7 * 6) - totalCells; // Fixed 6 rows
        // Or just fill until the end of the last row
        // const remainingCells = 7 - (totalCells % 7);
        // if (remainingCells < 7) { ... }
        
        // Let's stick to filling the grid to look nice, usually 35 or 42 cells.
        // We will just fill the rest of the last row
        const rows = Math.ceil(totalCells / 7);
        const cellsToFill = (rows * 7) - totalCells;

        for (let i = 1; i <= cellsToFill; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day padding-day';
            cell.textContent = i;
            this.grid.appendChild(cell);
        }
    }

    getHeatmapLevel(rate) {
        if (rate === 0) return 0;
        if (rate <= 25) return 1;
        if (rate <= 50) return 2;
        if (rate <= 75) return 3;
        return 4;
    }

    async fetchMonthData(year, month) {
        // Check Cache
        const cacheKey = `${year}-${month}`;
        if (this.monthCache[cacheKey]) {
            return this.monthCache[cacheKey];
        }

        // Return object: { "YYYY-MM-DD": { completionRate: 0-100, hasOverdue: bool } }
        const result = {};
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // 1. Identify involved weeks
        // We can't easily guess file names without computing week IDs for every day
        // Optimization: Compute unique week IDs for the month
        const weekFiles = new Set();
        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i);
            const dateStr = d.toISOString().split('T')[0];
            // Access global getWeekFileName if available
            if (typeof window.getWeekFileName === 'function') {
                weekFiles.add(window.getWeekFileName(dateStr));
            }
        }

        // 2. Fetch and aggregate
        for (const fileName of weekFiles) {
            try {
                // Access global readJson if available
                if (typeof window.readJson === 'function' && window.dirHandle) {
                    const data = await window.readJson(fileName);
                    if (data && data.dailyData) {
                        for (const dateStr in data.dailyData) {
                            // Filter only for current requested month (handling overlap weeks)
                            const [dYear, dMonth] = dateStr.split('-').map(Number);
                            if (dYear === year && dMonth === (month + 1)) {
                                const dayData = data.dailyData[dateStr];
                                if (dayData.tasks && dayData.tasks.length > 0) {
                                    const total = dayData.tasks.length;
                                    const completed = dayData.tasks.filter(t => t.progress >= 100).length;
                                    const rate = Math.round((completed / total) * 100);
                                    
                                    let hasOverdue = false;
                                    const todayStr = new Date().toISOString().split('T')[0];
                                    if (dateStr < todayStr && completed < total) {
                                        hasOverdue = true;
                                    }

                                    result[dateStr] = { completionRate: rate, hasOverdue };
                                } else {
                                     result[dateStr] = { completionRate: 0, hasOverdue: false };
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn(`Failed to read week file: ${fileName}`, e);
            }
        }
        
        // Save to Cache
        this.monthCache[cacheKey] = result;
        return result;
    }

    invalidateCache(dateStr) {
        if (!dateStr) {
            this.monthCache = {};
            return;
        }
        try {
            const d = new Date(dateStr);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (this.monthCache[key]) {
                delete this.monthCache[key];
            }
            // Also invalidate next/prev month if the week overlaps? 
            // For simplicity and correctness with the current Week ID system, 
            // a single date modification usually mostly affects its own month view.
            // If a week spans months, the other month's view will re-read the file 
            // only if its cache is also invalidated. 
            // Since we don't easily know if the *week* spans months here without calculation,
            // we'll stick to invalidating the target date's month. 
            // This covers 95% of UX. The edge case (modifying Jan 31 affects Feb 1 view if we switch immediately)
            // is acceptable to be eventually consistent or require a refresh if not critical.
        } catch (e) {
            console.warn('Failed to invalidate calendar cache', e);
        }
    }

    selectDate(dateStr) {
        if (typeof window.goToDate === 'function') {
            window.goToDate(dateStr);
            this.close();
        }
    }
}
// Expose to window
window.CalendarModule = CalendarModule;
