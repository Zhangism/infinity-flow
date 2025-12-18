// schedule.js - Time Blocking Module for Flow Whiteboard

window.ScheduleModule = window.ScheduleModule || {};
(function () {

    // ============ Constants ============
    const TIMELINE_START = 420;  // 07:00 in minutes from midnight
    const TIMELINE_END = 1560;   // 02:00 next day (26 hours * 60)
    const PIXEL_PER_MIN = 1;     // 1 pixel = 1 minute
    const SNAP_INTERVAL = 5;     // Snap to 5-minute intervals
    const MIN_DURATION = 15;     // Minimum block duration
    const DEFAULT_DURATION = 30; // Default duration for tasks
    const SPLIT_GAP = 5;         // Gap inserted when splitting (minutes)

    // ============ State ============
    window.ScheduleModule.presets = [];
    window.ScheduleModule.isDragging = false;
    window.ScheduleModule.dragTarget = null;
    window.ScheduleModule.resizeTarget = null;

    // ============ Initialization ============

    window.ScheduleModule.init = async function () {
        await this.loadPresets();
        this.renderPresetZone();
        this.renderTimeline();
        this.renderScheduleBlocks();
        this.setupEventListeners();
    };

    window.ScheduleModule.loadPresets = async function () {
        try {
            const data = await window.StorageModule.readJson('presets.json');
            this.presets = data?.presets || [];
        } catch (e) {
            this.presets = [];
            await this.savePresets();
        }
    };

    window.ScheduleModule.savePresets = async function () {
        await window.StorageModule.writeJson('presets.json', { presets: this.presets });
    };

    // ============ Preset Zone ============

    window.ScheduleModule.renderPresetZone = function () {
        const container = document.getElementById('preset-zone');
        if (!container) return;

        const presetsHtml = this.presets.map(preset => `
        <div class="preset-chip" 
             draggable="true" 
             data-preset-id="${preset.id}"
             data-drag-type="preset"
             title="拖动到时间轴添加">
            <span class="preset-title">${preset.title}</span>
            <span class="preset-duration">${preset.defaultDuration}m</span>
            <button class="preset-delete" onclick="event.stopPropagation(); ScheduleModule.deletePreset('${preset.id}')" title="删除">×</button>
        </div>
    `).join('');

        container.innerHTML = `
        <div class="preset-header">
            <span>预设时间块</span>
            <button class="btn-icon btn-collapse-preset" onclick="ScheduleModule.togglePresetZone()" title="折叠/展开">▲</button>
        </div>
        <div class="preset-list" id="preset-list">
            ${presetsHtml || '<span class="small-hint">暂无预设，在下方添加</span>'}
        </div>
        <div class="preset-add-row">
            <input type="text" id="preset-title-input" class="inline-input" placeholder="预设名称..." onkeydown="if(event.key==='Enter') ScheduleModule.addPreset()">
            <input type="number" id="preset-duration-input" class="inline-input" placeholder="分钟" min="5" max="480" style="width:60px;" onkeydown="if(event.key==='Enter') ScheduleModule.addPreset()">
            <button class="btn-small" onclick="ScheduleModule.addPreset()">添加</button>
        </div>
    `;

        // Setup drag listeners for presets
        container.querySelectorAll('.preset-chip').forEach(chip => {
            chip.addEventListener('dragstart', (e) => {
                const presetId = chip.dataset.presetId;
                const preset = this.presets.find(p => p.id === presetId);
                if (!preset) return;

                window.dragSrcType = 'preset';
                window.dragPayload = preset;
                e.dataTransfer.effectAllowed = 'copy';
                chip.classList.add('dragging');
            });

            chip.addEventListener('dragend', () => {
                chip.classList.remove('dragging');
            });
        });

        // Set initial state of collapse button icon
        const list = document.getElementById('preset-list');
        const btn = document.querySelector('.btn-collapse-preset');
        if (list && btn) {
            if (list.classList.contains('collapsed')) {
                btn.classList.add('rotated');
            } else {
                btn.classList.remove('rotated');
            }
        }
    };

    window.ScheduleModule.togglePresetZone = function () {
        const list = document.getElementById('preset-list');
        const btn = document.querySelector('.btn-collapse-preset');
        if (list && btn) {
            list.classList.toggle('collapsed');
            btn.classList.toggle('rotated', list.classList.contains('collapsed'));
        }
    };

    window.ScheduleModule.addPreset = function () {
        const titleInput = document.getElementById('preset-title-input');
        const durationInput = document.getElementById('preset-duration-input');

        const title = titleInput.value.trim();
        const duration = parseInt(durationInput.value) || DEFAULT_DURATION;

        if (!title) return;

        this.presets.push({
            id: window.uuid(),
            title: title,
            defaultDuration: Math.max(MIN_DURATION, Math.min(480, duration))
        });

        titleInput.value = '';
        durationInput.value = '';

        this.savePresets();
        this.renderPresetZone();
    };

    window.ScheduleModule.deletePreset = function (id) {
        this.presets = this.presets.filter(p => p.id !== id);
        this.savePresets();
        this.renderPresetZone();
    };

    // ============ Timeline Rendering ============

    window.ScheduleModule.renderTimeline = function () {
        const container = document.getElementById('timeline-container');
        if (!container) return;

        const totalMinutes = TIMELINE_END - TIMELINE_START;
        const totalHeight = totalMinutes * PIXEL_PER_MIN;

        // Generate time labels for each hour
        let labelsHtml = '';
        for (let mins = TIMELINE_START; mins <= TIMELINE_END; mins += 60) {
            const hour = Math.floor(mins / 60) % 24;
            const displayHour = hour.toString().padStart(2, '0');
            const top = (mins - TIMELINE_START) * PIXEL_PER_MIN;
            const isNextDay = mins >= 1440;
            labelsHtml += `
            <div class="time-label" style="top: ${top}px;">
                ${displayHour}:00${isNextDay ? '<sup>+1</sup>' : ''}
            </div>
        `;
        }

        container.innerHTML = `
        <div class="timeline-labels">${labelsHtml}</div>
        <div class="timeline-grid" id="timeline-grid" style="height: ${totalHeight}px;">
            <div class="timeline-blocks" id="timeline-blocks"></div>
            <div class="timeline-drop-indicator" id="timeline-drop-indicator" style="display:none;"></div>
            <div class="timeline-current-time" id="timeline-current-time"></div>
        </div>
    `;

        // Setup drop zone
        const grid = document.getElementById('timeline-grid');
        if (grid) {
            grid.addEventListener('dragover', this.handleTimelineDragOver.bind(this));
            grid.addEventListener('drop', this.handleTimelineDrop.bind(this));
            grid.addEventListener('dragleave', this.handleTimelineDragLeave.bind(this));
        }

        this.updateCurrentTimeIndicator();
        // Update every minute
        if (this._timeUpdateInterval) clearInterval(this._timeUpdateInterval);
        this._timeUpdateInterval = setInterval(() => this.updateCurrentTimeIndicator(), 60000);
    };

    window.ScheduleModule.updateCurrentTimeIndicator = function () {
        const indicator = document.getElementById('timeline-current-time');
        if (!indicator) return;

        const now = new Date();
        let currentMinutes = now.getHours() * 60 + now.getMinutes();

        // Handle next day (after midnight but before 02:00)
        if (currentMinutes < TIMELINE_START && currentMinutes < 120) {
            currentMinutes += 1440;
        }

        if (currentMinutes >= TIMELINE_START && currentMinutes <= TIMELINE_END) {
            const top = (currentMinutes - TIMELINE_START) * PIXEL_PER_MIN;
            indicator.style.top = `${top}px`;
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    };

    // ============ Schedule Block Rendering ============

    window.ScheduleModule.renderScheduleBlocks = function () {
        const container = document.getElementById('timeline-blocks');
        if (!container) return;

        const schedule = this.getCurrentSchedule();

        container.innerHTML = schedule.map(group => this.renderGroup(group)).join('');

        // Setup block interactions
        container.querySelectorAll('.time-block-segment').forEach(segment => {
            segment.addEventListener('mousedown', (e) => {
                const groupId = segment.dataset.groupId;
                const segmentIndex = parseInt(segment.dataset.segmentIndex);
                this.handleSegmentMouseDown(e, groupId, segmentIndex);
            });

            segment.addEventListener('dblclick', (e) => {
                const groupId = segment.dataset.groupId;
                const segmentIndex = parseInt(segment.dataset.segmentIndex);
                this.splitSegment(groupId, segmentIndex, e);
            });
        });
    };

    window.ScheduleModule.getCurrentSchedule = function () {
        const currentDateStr = window.appData?.currentDateStr;
        if (!currentDateStr || !window.appData?.weekData?.dailyData?.[currentDateStr]) {
            return [];
        }
        // Ensure schedule array exists
        if (!window.appData.weekData.dailyData[currentDateStr].schedule) {
            window.appData.weekData.dailyData[currentDateStr].schedule = [];
        }
        return window.appData.weekData.dailyData[currentDateStr].schedule;
    };

    window.ScheduleModule.setCurrentSchedule = function (schedule) {
        const currentDateStr = window.appData?.currentDateStr;
        if (!currentDateStr || !window.appData?.weekData?.dailyData?.[currentDateStr]) {
            return;
        }
        window.appData.weekData.dailyData[currentDateStr].schedule = schedule;
    };

    window.ScheduleModule.renderGroup = function (group) {
        const hsl = this.getColorFromHue(group.colorHue, group.type === 'preset');

        return group.segments.map((segment, segIndex) => {
            const top = (segment.start - TIMELINE_START) * PIXEL_PER_MIN;
            const height = segment.duration * PIXEL_PER_MIN; // Removed min height for accuracy
            const isShort = segment.duration <= 30; // Check if block is short

            return `
            <div class="time-block-segment ${isShort ? 'short-block' : ''}" 
                 id="segment-${group.id}-${segIndex}"
                 data-group-id="${group.id}"
                 data-segment-index="${segIndex}"
                 style="top: ${top}px; height: ${height}px; --block-bg: ${hsl.bg}; --block-border: ${hsl.border};">
                <div class="block-content">
                    <span class="block-title">${this.escapeHtml(group.title)}</span>
                    <span class="block-time">${this.formatTimeRange(segment.start, segment.duration)}</span>
                </div>
                <button class="block-delete" onclick="event.stopPropagation(); ScheduleModule.deleteGroup('${group.id}')" title="删除整组">×</button>
            </div>
        `;
        }).join('');
    };

    window.ScheduleModule.escapeHtml = function (text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    window.ScheduleModule.getColorFromHue = function (hue, isPreset = false) {
        const saturation = isPreset ? '40%' : '65%';
        const lightness = '85%';
        const borderLightness = '55%';

        return {
            bg: `hsla(${hue}, ${saturation}, ${lightness}, 0.92)`,
            border: `hsl(${hue}, ${saturation}, ${borderLightness})`
        };
    };

    window.ScheduleModule.formatTimeRange = function (startMins, duration) {
        const startHour = Math.floor(startMins / 60) % 24;
        const startMin = startMins % 60;
        const endMins = startMins + duration;
        const endHour = Math.floor(endMins / 60) % 24;
        const endMin = endMins % 60;

        return `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')} - ${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
    };

    // ============ Collision Detection ============

    window.ScheduleModule.checkCollision = function (start, duration, ignoreGroupId = null, ignoreSegmentIndex = null) {
        const schedule = this.getCurrentSchedule();
        const end = start + duration;

        for (const group of schedule) {
            if (ignoreGroupId && group.id === ignoreGroupId) {
                // If we're ignoring this group entirely OR specific segment
                if (ignoreSegmentIndex === null) continue;

                // Check segments but skip the ignored one
                for (let i = 0; i < group.segments.length; i++) {
                    if (i === ignoreSegmentIndex) continue;
                    const segment = group.segments[i];
                    const segEnd = segment.start + segment.duration;
                    if (start < segEnd && end > segment.start) {
                        return true;
                    }
                }
                continue;
            }

            for (const segment of group.segments) {
                const segEnd = segment.start + segment.duration;

                // Check overlap
                // Overlap if (StartA < EndB) and (EndA > StartB)
                if (start < segEnd && end > segment.start) {
                    return true;
                }
            }
        }
        return false;
    };

    // ============ Drag & Drop from Sources ============

    window.ScheduleModule.handleTimelineDragOver = function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (!window.dragSrcType || !['daily', 'preset'].includes(window.dragSrcType)) return;

        const grid = document.getElementById('timeline-grid');
        const indicator = document.getElementById('timeline-drop-indicator');
        if (!grid || !indicator) return;

        const rect = grid.getBoundingClientRect();
        const offsetY = e.clientY - rect.top + grid.scrollTop;
        const minutes = Math.round((offsetY / PIXEL_PER_MIN + TIMELINE_START) / SNAP_INTERVAL) * SNAP_INTERVAL;
        const snappedTop = (minutes - TIMELINE_START) * PIXEL_PER_MIN;

        // Determine duration
        let duration = DEFAULT_DURATION;
        if (window.dragSrcType === 'preset' && window.dragPayload?.defaultDuration) {
            duration = window.dragPayload.defaultDuration;
        } else if (window.dragSrcType === 'daily' && window.dragPayload) {
            // Inherit duration logic for preview
            if (window.dragPayload.duration) {
                duration = window.dragPayload.duration;
            } else if (window.dragPayload.timer?.totalWork > 5 * 60000) {
                // If accumulated work > 5 mins, use it? Optional. 
                // For now, let's just stick to default or property.
                // duration = Math.round(window.dragPayload.timer.totalWork / 60000 / SNAP_INTERVAL) * SNAP_INTERVAL;
            }
        }

        // Check collision for indicator color
        const isColliding = this.checkCollision(minutes, duration);
        indicator.style.backgroundColor = isColliding ? 'rgba(231, 76, 60, 0.3)' : 'rgba(0, 113, 227, 0.3)';

        indicator.style.display = 'flex';
        indicator.style.top = `${snappedTop}px`;
        indicator.style.height = `${duration * PIXEL_PER_MIN}px`;
        indicator.textContent = this.formatTimeRange(Math.max(TIMELINE_START, minutes), duration);
    };

    window.ScheduleModule.handleTimelineDragLeave = function (e) {
        // Only hide if leaving the grid entirely
        const grid = document.getElementById('timeline-grid');
        if (grid && !grid.contains(e.relatedTarget)) {
            const indicator = document.getElementById('timeline-drop-indicator');
            if (indicator) indicator.style.display = 'none';
        }
    };

    window.ScheduleModule.handleTimelineDrop = function (e) {
        e.preventDefault();
        e.stopPropagation();

        const indicator = document.getElementById('timeline-drop-indicator');
        if (indicator) indicator.style.display = 'none';

        document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));

        if (!window.dragSrcType || !['daily', 'preset'].includes(window.dragSrcType)) return;

        const grid = document.getElementById('timeline-grid');
        if (!grid) return;

        const rect = grid.getBoundingClientRect();
        const offsetY = e.clientY - rect.top + grid.scrollTop;
        let startMinutes = Math.round((offsetY / PIXEL_PER_MIN + TIMELINE_START) / SNAP_INTERVAL) * SNAP_INTERVAL;

        // Clamp to valid range
        startMinutes = Math.max(TIMELINE_START, startMinutes);

        let groupData;
        let duration = DEFAULT_DURATION;

        if (window.dragSrcType === 'daily') {
            const task = window.dragPayload;
            if (!task) return;

            // One block per task check
            const schedule = this.getCurrentSchedule();
            if (schedule.some(g => g.type === 'task' && g.refId === task.id)) {
                if (window.UIModule?.showToast) {
                    window.UIModule.showToast('该任务今日已安排时间块', { type: 'info' });
                }
                return;
            }

            // Inherit duration from task TIMER (Primary)
            let totalTime = (task.timer?.totalWork || 0);
            if (task.timer?.pomodoro && typeof task.timer.pomodoro.totalPomodoro === 'number') {
                totalTime += task.timer.pomodoro.totalPomodoro;
            } else if (task.timer?.totalPomodoro) {
                // Legacy/alternate structure check
                totalTime += task.timer.totalPomodoro;
            }

            if (totalTime > 0) {
                // Convert ms to minutes (round to nearest)
                const timerMins = Math.round(totalTime / 60000);
                // Round to nearest SNAP_INTERVAL, but ensure at least MIN_DURATION
                duration = Math.max(MIN_DURATION, Math.round(timerMins / SNAP_INTERVAL) * SNAP_INTERVAL);
            } else if (task.duration) {
                // Fallback to previously saved duration
                duration = task.duration;
            }

            // Ensure duration is never 0 and at least MIN_DURATION
            if (!duration || duration < MIN_DURATION) duration = Math.max(DEFAULT_DURATION, MIN_DURATION);

            const endMinutes = Math.min(startMinutes + duration, TIMELINE_END);
            const actualDuration = endMinutes - startMinutes;

            if (actualDuration < MIN_DURATION) return;

            // Collision Check
            if (this.checkCollision(startMinutes, actualDuration)) {
                if (window.UIModule?.showToast) {
                    window.UIModule.showToast('时间块重叠，请选择空闲时间', { type: 'error' });
                }
                return;
            }

            // Update task duration for persistence
            const dayData = window.appData.weekData.dailyData[window.appData.currentDateStr];
            const realTask = dayData.tasks.find(t => t.id === task.id);
            if (realTask) {
                realTask.duration = actualDuration;
            }

            groupData = {
                id: window.uuid(),
                type: 'task',
                refId: task.id,
                title: task.content,
                colorHue: this.getQuadrantHue(task.quadrant),
                segments: [{ start: startMinutes, duration: actualDuration }]
            };
        } else if (window.dragSrcType === 'preset') {
            const preset = window.dragPayload;
            if (!preset) return;

            duration = preset.defaultDuration || DEFAULT_DURATION;
            const endMinutes = Math.min(startMinutes + duration, TIMELINE_END);
            const actualDuration = endMinutes - startMinutes;

            if (actualDuration < MIN_DURATION) return;

            // Collision Check
            if (this.checkCollision(startMinutes, actualDuration)) {
                if (window.UIModule?.showToast) {
                    window.UIModule.showToast('时间块重叠，请选择空闲时间', { type: 'error' });
                }
                return;
            }

            const presetHue = Math.floor(Math.random() * 200) + 100;

            groupData = {
                id: window.uuid(),
                type: 'preset',
                refId: preset.id,
                title: preset.title,
                colorHue: presetHue,
                segments: [{ start: startMinutes, duration: actualDuration }]
            };
        }

        if (groupData) {
            const schedule = this.getCurrentSchedule();
            schedule.push(groupData);
            this.setCurrentSchedule(schedule);
            this.renderScheduleBlocks();
            window.debouncedSave();

            if (window.UIModule?.showToast) {
                window.UIModule.showToast(`已添加: ${groupData.title}`, { type: 'success', duration: 2000 });
            }
        }

        window.dragSrcType = null;
        window.dragPayload = null;
    };

    window.ScheduleModule.getQuadrantHue = function (quadrant) {
        switch (quadrant) {
            case 1: return 0;    // Red - urgent & important
            case 2: return 45;   // Orange/Yellow - important
            case 3: return 200;  // Blue - urgent
            case 4: return 120;  // Green - neither
            default: return 210;
        }
    };

    // ============ Block Interactions (Drag Only) ============

    window.ScheduleModule.handleSegmentMouseDown = function (e, groupId, segmentIndex) {
        // Ignore if clicking delete button
        if (e.target.classList.contains('block-delete')) return;

        e.stopPropagation();

        // No resize check anymore
        const segment = e.target.closest('.time-block-segment');
        this.startDrag(e, groupId, segmentIndex, segment);
    };

    window.ScheduleModule.startDrag = function (e, groupId, segmentIndex, element) {
        this.isDragging = true;
        this.hasMoved = false; // Initialize hasMoved flag
        this.dragTarget = { groupId, segmentIndex, element, startY: e.clientY };

        const schedule = this.getCurrentSchedule();
        const group = schedule.find(g => g.id === groupId);
        if (group && group.segments[segmentIndex]) {
            this.dragTarget.originalStart = group.segments[segmentIndex].start;
        }

        element.classList.add('dragging-block');

        this._boundBlockDrag = this.handleBlockDrag.bind(this);
        this._boundBlockDragEnd = this.handleBlockDragEnd.bind(this);

        document.addEventListener('mousemove', this._boundBlockDrag);
        document.addEventListener('mouseup', this._boundBlockDragEnd);
    };

    window.ScheduleModule.handleBlockDrag = function (e) {
        if (!this.isDragging || !this.dragTarget) return;

        const deltaY = e.clientY - this.dragTarget.startY;
        const deltaMinutes = Math.round(deltaY / PIXEL_PER_MIN / SNAP_INTERVAL) * SNAP_INTERVAL;

        if (deltaMinutes === 0) return;

        this.hasMoved = true; // Mark as moved

        const schedule = this.getCurrentSchedule();
        const group = schedule.find(g => g.id === this.dragTarget.groupId);
        if (!group) return;

        const segment = group.segments[this.dragTarget.segmentIndex];
        if (!segment) return;

        let newStart = this.dragTarget.originalStart + deltaMinutes;

        // Clamp to valid range
        newStart = Math.max(TIMELINE_START, newStart);
        newStart = Math.min(TIMELINE_END - segment.duration, newStart);

        // Collision Check during drag
        if (this.checkCollision(newStart, segment.duration, group.id)) {
            return;
        }

        segment.start = newStart;

        this.setCurrentSchedule(schedule);
        this.renderScheduleBlocks();
    };

    window.ScheduleModule.handleBlockDragEnd = function (e) {
        this.isDragging = false;

        if (this.dragTarget?.element) {
            this.dragTarget.element.classList.remove('dragging-block');
        }

        let needsRender = false;

        // Check for merge before clearing dragTarget
        if (this.dragTarget && this.dragTarget.groupId) {
            const schedule = this.getCurrentSchedule();
            const group = schedule.find(g => g.id === this.dragTarget.groupId);
            if (group) {
                const merged = this.checkMergeOpportunity(group);
                if (merged || this.hasMoved) {
                    this.setCurrentSchedule(schedule);
                    needsRender = true;
                }
            }
        }

        this.dragTarget = null;

        document.removeEventListener('mousemove', this._boundBlockDrag);
        document.removeEventListener('mouseup', this._boundBlockDragEnd);

        if (needsRender) {
            this.renderScheduleBlocks();
            window.debouncedSave();
        }
    };


    // ============ Merge Operation ============

    window.ScheduleModule.checkMergeOpportunity = function (group) {
        if (!group || group.segments.length < 2) return false;

        // Sort segments by start time
        group.segments.sort((a, b) => a.start - b.start);

        // Check for touching/overlapping segments and merge them
        let merged = false;
        let didMerge = false;

        // Loop until no more merges occur (to handle multi-segment chain reaction)
        do {
            merged = false;
            for (let i = 0; i < group.segments.length - 1; i++) {
                const current = group.segments[i];
                const next = group.segments[i + 1];

                // Check if they touch or overlap (current end >= next start)
                if (current.start + current.duration >= next.start) {
                    // Merge: conserve total duration (Sum of parts)
                    // This ensures that if they touch, we just combine them.
                    // If they theoretically overlapped (despite collision check), this expands the block to honor the total time.
                    current.duration = current.duration + next.duration;

                    // Remove next segment
                    group.segments.splice(i + 1, 1);
                    merged = true;
                    didMerge = true;

                    if (window.UIModule?.showToast) {
                        window.UIModule.showToast('时间块已合并', { type: 'success', duration: 1500 });
                    }
                    break; // Restart loop after modification
                }
            }
        } while (merged);

        return didMerge;
    };

    // ============ Split Operation ============

    window.ScheduleModule.splitSegment = function (groupId, segmentIndex, event) {
        const schedule = this.getCurrentSchedule();
        const group = schedule.find(g => g.id === groupId);
        if (!group) return;

        const segment = group.segments[segmentIndex];
        if (!segment) return;

        const originalDuration = segment.duration;

        // Calculate split point from click position
        const element = event.target.closest('.time-block-segment');
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const clickOffset = event.clientY - rect.top;
        let proposedFirstDuration = Math.round(clickOffset / PIXEL_PER_MIN / SNAP_INTERVAL) * SNAP_INTERVAL;

        // Ensure both resulting segments are at least MIN_DURATION
        // and their sum equals originalDuration
        proposedFirstDuration = Math.max(MIN_DURATION, proposedFirstDuration);
        proposedFirstDuration = Math.min(originalDuration - MIN_DURATION, proposedFirstDuration);

        // If proposedFirstDuration is not valid (e.g., would make second segment too small)
        if (proposedFirstDuration < MIN_DURATION || (originalDuration - proposedFirstDuration) < MIN_DURATION) {
            if (window.UIModule?.showToast) {
                window.UIModule.showToast('拆分位置无效，每个时间块至少需要 ' + MIN_DURATION + ' 分钟', { type: 'info' });
            }
            return;
        }

        const firstDuration = proposedFirstDuration;
        const secondDuration = originalDuration - firstDuration; // Sum of durations equals original

        // Calculate the start time of the second segment, including the gap
        const secondStart = segment.start + firstDuration + SPLIT_GAP;

        // Collision check for the *new* second segment's position against other blocks
        // We ignore the segment that is being replaced (which means this check will effectively check against other groups' blocks)
        if (this.checkCollision(secondStart, secondDuration, group.id, segmentIndex)) {
            if (window.UIModule?.showToast) {
                window.UIModule.showToast('拆分后第二个时间块与现有时间块重叠，请选择其他拆分位置', { type: 'error' });
            }
            return;
        }

        const newSegments = [
            { start: segment.start, duration: firstDuration },
            { start: secondStart, duration: secondDuration }
        ];

        // Replace the old segment with new ones
        group.segments.splice(segmentIndex, 1, ...newSegments);

        this.setCurrentSchedule(schedule);
        this.renderScheduleBlocks();
        window.debouncedSave();

        if (window.UIModule?.showToast) {
            window.UIModule.showToast('时间块已拆分', { type: 'success' });
        }
    };

    // ============ Delete Operation ============

    window.ScheduleModule.deleteGroup = function (groupId) {
        const schedule = this.getCurrentSchedule();
        const newSchedule = schedule.filter(g => g.id !== groupId);
        this.setCurrentSchedule(newSchedule);
        this.renderScheduleBlocks();
        window.debouncedSave();

        if (window.UIModule?.showToast) {
            window.UIModule.showToast('时间块已删除', { type: 'info' });
        }
    };

    // ============ End of Day Check ============

    window.ScheduleModule.checkCompletedButUnscheduled = function () {
        const currentDateStr = window.appData?.currentDateStr;
        if (!currentDateStr || !window.appData?.weekData?.dailyData?.[currentDateStr]) {
            return { hasIssues: false, tasks: [] };
        }

        const dayData = window.appData.weekData.dailyData[currentDateStr];
        const tasks = dayData.tasks || [];
        const schedule = dayData.schedule || [];

        // Get completed tasks (progress >= 100)
        const completedTasks = tasks.filter(t => t.progress >= 100);

        // Get scheduled task IDs
        const scheduledTaskIds = new Set(
            schedule
                .filter(g => g.type === 'task')
                .map(g => g.refId)
        );

        // Find completed but unscheduled tasks
        const unscheduledCompleted = completedTasks.filter(t => !scheduledTaskIds.has(t.id));

        return {
            hasIssues: unscheduledCompleted.length > 0,
            tasks: unscheduledCompleted
        };
    };

    window.ScheduleModule.promptUnscheduledTasks = function () {
        const check = this.checkCompletedButUnscheduled();

        if (!check.hasIssues) {
            return Promise.resolve(true);
        }

        const taskNames = check.tasks.map(t => `• ${t.content}`).join('\n');

        return new Promise((resolve) => {
            if (typeof window.showConfirm === 'function') {
                window.showConfirm(
                    `以下任务已完成但未排入时间轴：\n${taskNames}\n\n是否继续完成今天的工作？`,
                    () => resolve(true),
                    '未排程任务提醒'
                );

                // Handle cancel
                const overlay = document.getElementById('confirm-modal-overlay');
                if (overlay) {
                    const handler = (e) => {
                        if (e.target === overlay || e.target.classList.contains('btn-cancel')) {
                            resolve(false);
                            overlay.removeEventListener('click', handler);
                        }
                    };
                    overlay.addEventListener('click', handler);
                }
            } else {
                resolve(true);
            }
        });
    };

    // ============ Event Listeners Setup ============

    window.ScheduleModule.setupEventListeners = function () {
        // Re-render on date change (hook into existing goToDate)
        const originalGoToDate = window.goToDate;
        if (originalGoToDate) {
            window.goToDate = function (val) {
                originalGoToDate(val);
                setTimeout(() => {
                    window.ScheduleModule.renderScheduleBlocks();
                }, 100);
            };
        }
    };

    // ============ Public API ============

    window.renderSchedule = function () {
        window.ScheduleModule.renderScheduleBlocks();
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Will be initialized after loadAllData
        });
    }
})();
