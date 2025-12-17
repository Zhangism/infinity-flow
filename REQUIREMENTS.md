# 心流白板 (Flow Whiteboard) - Project Documentation

## 1. Project Overview
* **Product**: 心流白板 (Flow Whiteboard) - A pure frontend, local-first, minimalist productivity whiteboard.
* **Core Concept**: Eisenhower Matrix (Daily) + Weekly Planning + Long-term Goals + Focus Mode + Recommended Tasks + Daily Templates.
* **Tech Stack**: HTML5, CSS3, Vanilla JS. No Backend.
* **Storage**: Local File System Access API (Origin Private File System concept).
    * Root: User-selected local folder.
    * Handle Persistence: Uses IndexedDB to remember handles (silent auto-load).
    * "Persistence Strategy: Atomic Writes (write to `.tmp` -> rename) to prevent corruption. Rotational Backups (keep last 5 versions in `/backups` folder)."

## 2. Data Structure
* `long_term_goals.json`: Stores goals and sub-goal progress.
* `recurring_tasks.json` (NEW): Stores daily template tasks ("日常任务").
    * `recurring`: Array of `{id, title}`.
* `inbox.json`: Storage for Inbox items. Structure: `{ items: [{id, content, createdAt, status}] }`. `status` can be 'active' or 'archived'.
* `snippets.json`: Storage for Snippets. Structure: `{ snippets: [{id, type, description, content}] }`. Types: 'linux', 'ai', 'shortcut'.
* `YYYY_Www.json` (e.g., `2025_W50.json`):
    * `weeklyTasks`: Array of objects `{id, content, deadline, completed, migratedFrom?: string}`.
    * `dailyData`: Object keyed by date string (YYYY-MM-DD).
        * `tasks`: Array of objects. Each task has `id`, `content`, `quadrant`, `progress`, `timer`, and **`subtasks` (Array of `{id, content, completed}`)**.
        * `recommendations`: Array of objects cloned from prior day unfinished tasks `{id, content, quadrant, progress, timer}`.
        * `summary`: String.
    * `importedFrom`: String weekId indicating rollover source.

## 3. Core Features Logic
* **Global Interaction**:
    * **No native alerts/prompts**. Use inline inputs or custom modals.
    * **Workspace**: Auto-load last used handle. Button available to switch.
* **Long-term Goals**: Goals with sub-goals.
* **GTD Inbox**:
    * Placed below Long Term Goals.
    * **Folding Logic**: 'Archive' button moves all active items to a hidden state (smooth transition). 'Expand' button restores them. New items are active by default.
    * **Drag-and-Drop**: 
        * Active items can be dragged to Daily Quadrants (converting to Task and deleting from Inbox).
        * Fix logic to allow dragging Inbox items directly into Daily Quadrants. Upon drop, the item creates a Task in the quadrant and is removed from the Inbox.
* **Snippet Library**:
    * Placed below Inbox.
    * **UI**: Cards with Description (max 50 chars) and Content.
    * **UI update**: Copy feedback should appear as a floating animation near the cursor (green text, transparent background, floating up and fading out).
    * **Content Rendering**: 
        * Snippets of type `'linux'` will be rendered as syntax-highlighted code blocks using Highlight.js. The font for these code blocks must be explicitly set to **'Consolas'**, falling back to monospace.
        * Snippets of type `'ai'` and `'shortcut'` will be rendered as plain text, using the default UI font and background, and will not be enclosed in code block styling.
    * **AI Refine**: Button opens a modal -> User input -> AI modifies content -> Saves as **NEW** snippet with AI-generated description.
    * **Edit/Delete**: Inline editing via modal/prompt.
* **Weekly Tasks**:
    * Display DDL as "Remaining Days" (e.g., "3 days left").
    * Auto-carry unfinished tasks from previous week into new week (copy), without mutating historical weeks.
* **Daily Matrix (Quadrants)**:
    * **Input**: Inline text input at the bottom of each quadrant + "Enter" or "Add" button.
    * **Drag-and-Drop**:
        * Weekly -> Daily: Copy task (One-way sync).
        * Daily -> Daily: Move task (Change quadrant).
        * Recommendations -> Daily: Move task (One-way; once moved/deleted it is removed from recommendations persistently).
        * Recurring (日常任务) -> Daily: Copy task (one-way template; daily instances share name linkage).
        * Dragging sliders/inputs must NOT trigger row drag.
    * **Subtasks**: Daily tasks support nested checklists. Progress slider can be manual or auto-calculated based on subtask completion.
    * **Subtask Sorting**: Users can reorder subtasks within a task via drag-and-drop.
    * **Progress**: 
        * Slider showing numeric %. 
        * At 100%, visual state changes to "Completed".
    * **Timer System**: Supports both Count-up (Stopwatch) and Count-down (Pomodoro, default 25m).
        * **Data Structure**: Stopwatch time is stored in `timer.totalWork`. Pomodoro time is stored separately in `timer.totalPomodoro`.
        * **Badge Logic**: The task list badge displays the combined total of `totalWork` + `totalPomodoro` + `current elapsed time`.
        * **Mutual Exclusivity**: Only one timer type (Stopwatch or Pomodoro) can run at a time. Starting the Pomodoro timer must automatically pause the Stopwatch, and vice versa.
        * **Visual State**: The timer badge must have the `.active` class (Blue) if *either* the Stopwatch or Pomodoro is running.
    * **Manual Correction**: Users can manually edit the recorded time (in case they forgot to stop/start).
    * **Notification**: Audio beep or visual alert when Pomodoro ends.
    * **Recommendations (推荐任务)**:
        * Each day auto-loads unfinished tasks from previous day into `recommendations` list.
        * **Strict filtering**: Only tasks with `progress < 100` AND not marked as completed are imported from the previous day. **Completed tasks must never appear in recommendations**.
        * Moving/deleting a recommendation removes it from that day's list and persists; refresh will not re-import the same item.
        * Prior-day data is immutable; modifying a recommendation instance never writes back to the previous day.
        * Clicking "完成今天/这周的工作" moves today's unfinished tasks into tomorrow's recommendations; if today is Sunday, unfinished weekly tasks also land in next week's Monday recommendations. Duplicate recommendation content is auto-deduped.
        * On Mondays, unfinished weekly tasks from the previous week auto-appear in recommendations (deduped) without mutating historical files.
* **Recurring Daily Tasks (日常任务)**:
    * Listed in sidebar; cannot be completed or deleted directly.
    * Can be dragged to daily quadrants to create a task instance for the selected date.
    * Renaming a recurring template updates all daily tasks created from it (name linkage maintained via template id).
    * **Immutability**: Daily task instances created from Recurring templates are **read-only** (cannot be renamed in the daily view). Renaming must be done in the sidebar template list.
    * **Independence**: Deleting a Recurring template from the sidebar does **not** delete or affect any daily task instances already created from it.
* **Calendar Module (New)**:
    * **Positioning**: Modal-based view, triggered by clicking the date header in the top bar.
    * **Core Function**: Display a monthly view with support for switching months (Previous/Next).
    * **Heatmap Logic**:
        * System must asynchronously read all weekly data files (`YYYY_Www.json`) corresponding to the currently viewed month.
        * Calculate daily "Task Completion Rate" (`completedTasks / totalTasks`).
        * **Visual Feedback**: Render different shades of green background based on completion rate (similar to GitHub Contributions, defining Levels 0-4).
        * **Overdue Alert**: If a specific day has unfinished AND overdue tasks, display a red dot marker on that date cell.
    * **Interaction**: Clicking a specific date -> Closes modal -> Calls the main program's `goToDate()` to load that day's data.
* **Content Rendering**:
    * **Markdown Support**: Introduce a lightweight Markdown parser (e.g., `marked.js` via CDN).
    * **Scope**: Apply to **Daily Summary** and **Task Content**.
    * **Interaction**: Implement a "Click-to-Edit, Blur-to-Render" pattern.
        * **View Mode**: Render parsed HTML (lists, bolding, links).
        * **Edit Mode**: Show raw text in a textarea/input.
* **Focus Mode**:
    * Toggle fullscreen for quadrant.
    * Ensure "Exit" button is always accessible.
* **Export**:
    * Scans directory for existing `YYYY_Www.json` files.
    * Dropdown selection for export range.

## 4. Search & Navigation
* **Global Search**: Scans all `YYYY_Www.json` files in the root directory.
* **Indexing**: Matches keywords in Task Content, Subtasks, and Daily Summaries.
* **UI**: Search results must display the **Quadrant tag** (e.g., Q1, Q2) for each task to provide context.
* **Action**: Clicking a result loads the historical date context.

## 5. Analytics
* **Analytics Dashboard**: Visualizes productivity metrics.
* **Views**: Daily, Weekly, Monthly.
* **Metrics**: Time Distribution (by Quadrant), Focus Hours (Total), Completion Rate.

## 6. AI Integration (Experimental)
* **Provider**: OpenAI-Compatible API (e.g., Open WebUI, Ollama via /v1).
* **Protocol**: OpenAI-Compatible API (`/chat/completions`) with SSE stream parsing.
* **Auth**: Bearer Token (JWT).
* **Stream Format**: Server-Sent Events (SSE) standard (parsing `data:` prefixes and `delta.content`).
* **Features**:
    * **Smart Summary**: Uses structured 'Chain of Thought' prompting to output Markdown (Achievements 🌟, Analysis ⏱️, Suggestions 💡).
    * **Insight**: Provides trend analysis in the Analytics Dashboard.
    * **Custom Prompts**: Users can override the default system prompt in Settings. However, the system ensures the instruction '根据数据对用户今天的工作进行复盘' is always appended to the final prompt to maintain core functionality.
    * **Context-Aware Summary**:
        * **Long-Term Memory**: The daily summary prompt must now include the user's Long-Term Goals (`long_term_goals.json`). The AI should explicitly analyze if today's tasks contributed to these goals.
        * **Stress/Sentiment Analysis**: If the data shows high pressure (e.g., > 4 tasks in Q1) or excessive work hours (e.g., > 8 hours focus time), the system prompt should dynamically adjust to prioritize "Stress Management & Recovery" advice over standard productivity optimization.
    * **AI Task Breakdown**:
        * Add a "✨" (Magic Wand) button to every Daily Task card.
        * **Function**: Clicking this triggers an AI request to break the specific task title into 3-5 actionable subtasks.
        * **Output**: The AI must return a strict JSON array of strings, which are then automatically appended to the task's `subtasks` list.
* **Config**: User-defined Base URL, Model Name, and API Key/JWT.

## 7. UX & Polish
* **3-Column Layout**: Left Sidebar (Navigation) | Center (Quadrants) | Right Sidebar (Daily Summary). Both sidebars are resizable.
* **Gamification**: Triggers Confetti visual effects and a subtle Sound FX when a task is completed (100% progress or checked).
* **Empty States**: Quadrants and lists display contextual illustrations or text (e.g., 'No Urgent Tasks') when empty to improve visual appeal.
* **Micro-interactions**: Implements smooth fade-out and scale-down transitions when deleting tasks to avoid abrupt DOM removals.
* **Modal Usability**: Close buttons must be positioned inside the modal header (Flexbox), adjacent to the title, rather than absolutely positioned in the far corner.
* **Theme Switcher**: Styled as a custom UI element (minimalist pill) instead of a default browser select box.
* **Timer UI Flexibility**: Users can toggle the Timer Modal between two distinct styles ('Zen Minimalist' vs 'Dashboard Console') via a button. The preference is persisted in `localStorage`.
* **Resizable Layout**: The Sidebar width is adjustable (draggable handle). Default Sidebar width is increased to 360px for better visibility, effectively reducing the main task column width.
* **Confirm Modal**: The 'Cancel' and 'Confirm' buttons must be styled elegantly (no default browser styles), matching the theme's button system.
* **Styled Inputs**: Refactor the 'Manual Time Adjustment' input to blend seamlessly with the Timer UI (remove default borders, use custom styling).
* **Calendar Module Styling**:
    * **Styling**: Use a 7-column CSS Grid layout. **The week must start on Monday**.
    * **Animation**: The modal should have a subtle zoom-in/fade-in effect when opening.
    * **Theme Support**: Colors must use CSS variables (`--accent`, `--bg-color`, etc.) to support Dark/Paper themes.
* **Interaction**:
    * **Visual Insertion Indicator**: When dragging tasks, instead of highlighting the entire container, calculate the mouse position relative to other items to display a **horizontal line** indicating exactly where the task will be dropped.
    * **Undo System**: Implement a "Safety Net". When a task is **Deleted** or **Moved between quadrants**, store a temporary snapshot of the previous state.
        * Display a **Toast Notification** at the bottom center for 5 seconds (e.g., "Task Deleted. Undo?").
        * Clicking "Undo" restores the data and re-renders.
