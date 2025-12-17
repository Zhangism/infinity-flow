# Flow Whiteboard Refactoring Plan: Time Blocking & Layout Overhaul

## 1. Objective

### A. `presets.json` (New File)
Create a new file structure to store user-defined time block presets.
```json
{
  "presets": [
    { "id": "uuid_1", "title": "Lunch", "defaultDuration": 30 },
    { "id": "uuid_2", "title": "Gym", "defaultDuration": 60 }
  ]
}
```

### B. `YYYY_Www.json` (Update `dailyData`)
Extend `dailyData[date]` to include a `schedule` array. Note the "Group" and "Segment" structure.
```json
"schedule": [
  {
    "id": "group_uuid",
    "type": "task", // or 'preset'
    "refId": "task_id_or_preset_id",
    "title": "Task Name",
    "colorHue": 0, // Q1=0(Red), Q2=40(Orange), Q3=210(Blue), Q4=0(Gray/Low Sat)
    "segments": [
      { "start": 600, "duration": 45 }, // Minutes from 00:00. 10:00 AM
      { "start": 650, "duration": 30 }  // 10:50 AM (5 min gap simulated)
    ]
  }
]
```

## 2. File: `index.html`

### A. Layout Restructuring
1.  **Modify `aside#sidebar`**: Keep as is (Left Sidebar).
2.  **Modify `main`**:
    * Change container style to allow **Flex Column** layout.
    * Add `<div id="bottom-summary-dock" class="summary-dock collapsed">` at the bottom of `<main>`.
    * **Action**: Move the existing Summary/Review logic (Textarea, "Auto Summary" button, "Finalize Day" button) from the old right sidebar into this new `#bottom-summary-dock`.
    * Add a toggle button (e.g., `^` or `v`) in the dock header to expand/collapse it.
3.  **Modify `aside#summary-sidebar` -> `aside#schedule-sidebar`**:
    * **Rename ID**: Change `summary-sidebar` to `schedule-sidebar`.
    * **Section 1 (Top)**: Add `<div id="preset-zone">` (Collapsible). Contains "Add Preset" input and a list of preset chips.
    * **Section 2 (Bottom)**: Add `<div id="timeline-container">`. This will contain the time ruler (07:00 - 02:00+1).

## 3. File: `styles.css`

### A. Layout & Main
* `main`: Set to `display: flex; flex-direction: column; overflow: hidden; height: 100vh;`.
* `.quadrant-container`: Set `flex: 1; min-height: 0; transition: flex-grow 0.3s ease;`.
* `.summary-dock`:
    * `height: 40px` (collapsed) / `200px` (expanded).
    * `background: var(--card-bg); border-top: 1px solid var(--border);`.
    * `transition: height 0.3s ease;`.
    * `z-index: 100;`
    * Ensure internal inputs stretch horizontally for better writing experience.

### B. Schedule Sidebar
* `#schedule-sidebar`: Flex column layout. Width should be consistent (e.g., 300px-360px).
* `#preset-zone`: Padding, border-bottom.
* `#timeline-container`: `flex: 1; overflow-y: auto; position: relative;`.
* **Grid Background**: Use `repeating-linear-gradient` to draw lines:
    * Solid line every 60px (1 hour).
    * Dashed line every 30px (30 min).
    * **Scale**: 1 pixel = 1 minute.
* **Time Range**: 07:00 (420px) to 02:00 next day (1560px). Total height approx 1140px.

### C. Time Blocks
* `.time-block-segment`: `position: absolute; left: 50px; right: 10px;`.
* **Styling**: Rounded corners, left-border colored by quadrant hue (4px width). **Font size increased**.
* **Interaction**: Cursor styles for `grab` (move). **No resize handle**.
* **Visuals**: Use CSS variables for colors.

## 4. File: `script.js` & `ui-renderer.js`

### A. Initialization
* Load `presets.json` on startup (create if missing).
* Render `preset-zone` (list of presets).
* Render `timeline` background and labels (07:00 - 02:00).

### B. Drag & Drop Logic (`dropToSchedule`)
* **Source**: Allow dragging from `quadrant` (dragSrcType='daily') or `preset-zone` (dragSrcType='preset').
* **Drop Target**: `#timeline-container`.
* **Calculation**:
    * `time = (offsetY / pixelPerMin) + 420`.
    * Snap to nearest 5 minutes.
* **Constraints (New)**:
    * **One Block Per Task**: A task can only have one time block per day. If it already exists, prevent drop.
    * **Inherit Duration**: Time block inherits the task's assigned duration (if available) or default.
    * **No Resizing**: Time blocks cannot be stretched/resized after creation.
    * **Anti-Collision**: Blocks cannot overlap. Drop/Move is rejected if it causes collision.
* **Data Creation**:
    * Create a new Schedule Group object.
    * **Constraints**: Default duration is 30 min (or inherited).
    * **Color**: Assign Hue based on Source (Task Quadrant vs Preset).
    * **Start Time**: Must be >= 07:00 and End Time <= 02:00 (+1).

### C. Block Operations
1.  **Modification**:
    * Disable renaming/content editing for blocks (they reflect the task or preset).
    * Allow changing `start` and `duration` via mouse interaction.
2.  **Split (Double Click)**:
    * **Condition**: If duration > 10 min.
    * **Action**: Split the current segment into two segments at the click point.
    * **Gap**: Insert a **5-minute gap**.
    * **Constraint**: Both resulting segments must be >= 5 min.
3.  **Merge (Drag)**:
    * **Condition**: If a segment is dragged/resized to touch another segment of the **SAME Group ID**.
    * **Action**: Merge them into one continuous segment.
4.  **Delete**:
    * **Action**: Deleting ANY segment removes the **Entire Group** (all segments of that task/preset).

### D. End-of-Day Check (`finalizeDayAndWeek`)
* Before the existing migration logic:
    1.  Get list of "Completed Tasks" (Progress 100%).
    2.  Get list of "Scheduled Tasks" (IDs present in `dailyData.schedule` referencing tasks).
    3.  **Intersection**: If a task is Completed but NOT in the Schedule, show a `confirm()` dialog: "Task X is completed but not scheduled. Continue?"

## 5. Color System Specs (HSLA)
* **Base Saturation**: Random between 60% - 90%.
* **Base Lightness**: Random between 80% - 95% (Pastel/Low contrast).
* **Hues**:
    * **Q1**: 0 (Red)
    * **Q2**: 40 (Orange/Yellow)
    * **Q3**: 210 (Blue)
    * **Q4**: 0 (Gray/Desaturated - Saturation 0%)
    * **Presets**: Random Hue (Avoid Red/Orange urgency colors), Low Saturation (30-50%).