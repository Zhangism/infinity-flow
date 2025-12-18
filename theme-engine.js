// theme-engine.js - Modularized Theme Management for Infinity Flow

window.setupThemeSwitcher = function () {
    const themeSwitcher = document.getElementById('theme-switcher');
    const themeToggle = document.getElementById('theme-toggle');
    const themeMenu = document.getElementById('theme-menu');
    const themeLabel = document.getElementById('theme-label');
    const themeOptions = document.querySelectorAll('.theme-option');

    if (!themeSwitcher || !themeToggle) return;

    // Load saved theme
    const savedTheme = localStorage.getItem('app-theme') || 'minimal';
    applyTheme(savedTheme);

    // Toggle menu
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        themeSwitcher.classList.toggle('open');
        themeToggle.setAttribute('aria-expanded', themeSwitcher.classList.contains('open'));
    });

    // Theme option click
    themeOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const theme = option.dataset.theme;
            applyTheme(theme);
            localStorage.setItem('app-theme', theme);
            themeSwitcher.classList.remove('open');
            themeToggle.setAttribute('aria-expanded', 'false');
        });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!themeSwitcher.contains(e.target)) {
            themeSwitcher.classList.remove('open');
            themeToggle.setAttribute('aria-expanded', 'false');
        }
    });

    function applyTheme(theme) {
        // Remove all theme classes
        document.body.classList.remove('theme-dark', 'theme-paper');

        // Apply new theme
        if (theme === 'dark') {
            document.body.classList.add('theme-dark');
        } else if (theme === 'paper') {
            document.body.classList.add('theme-paper');
        }
        // 'minimal' is the default, no class needed

        // Update label
        const labels = { minimal: '极简', dark: '暗色', paper: '纸感' };
        if (themeLabel) themeLabel.textContent = labels[theme] || '极简';

        // Update active state
        themeOptions.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === theme);
        });
    }
};
