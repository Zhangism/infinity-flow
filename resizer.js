// resizer.js - Panel Resizer Logic
// Handles draggable resizers for sidebars

(function () {
    'use strict';

    const Resizer = {};

    Resizer.setup = function () {
        // Left sidebar resizer
        const resizer = document.getElementById('resizer');
        const sidebar = document.getElementById('sidebar');

        if (resizer && sidebar) {
            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                document.body.style.cursor = 'col-resize';
                const startX = e.clientX;
                const startWidth = parseInt(window.getComputedStyle(sidebar).width, 10);

                const doDrag = (e) => {
                    const newWidth = startWidth + e.clientX - startX;
                    if (newWidth > 200 && newWidth < 600) {
                        sidebar.style.width = newWidth + 'px';
                    }
                };

                const stopDrag = () => {
                    document.body.style.cursor = 'default';
                    document.removeEventListener('mousemove', doDrag);
                    document.removeEventListener('mouseup', stopDrag);
                };

                document.addEventListener('mousemove', doDrag);
                document.addEventListener('mouseup', stopDrag);
            });
        }

        // Right resizer for schedule sidebar
        const resizerRight = document.getElementById('resizer-right');
        const scheduleSidebar = document.getElementById('schedule-sidebar');

        if (resizerRight && scheduleSidebar) {
            resizerRight.addEventListener('mousedown', (e) => {
                e.preventDefault();
                document.body.style.cursor = 'col-resize';
                resizerRight.classList.add('resizing');
                const startX = e.clientX;
                const startWidth = parseInt(window.getComputedStyle(scheduleSidebar).width, 10);

                const doDrag = (e) => {
                    const newWidth = startWidth - (e.clientX - startX);
                    if (newWidth > 280 && newWidth < 450) {
                        scheduleSidebar.style.width = newWidth + 'px';
                    }
                };

                const stopDrag = () => {
                    document.body.style.cursor = 'default';
                    resizerRight.classList.remove('resizing');
                    document.removeEventListener('mousemove', doDrag);
                    document.removeEventListener('mouseup', stopDrag);
                };

                document.addEventListener('mousemove', doDrag);
                document.addEventListener('mouseup', stopDrag);
            });
        }
    };

    // ============ Register & Expose ============

    if (window.App) {
        window.App.Resizer = Resizer;
    }

    window.setupResizer = Resizer.setup;

})();
