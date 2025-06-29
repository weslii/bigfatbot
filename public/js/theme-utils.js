/**
 * Theme Utilities - Centralized theme management
 * Handles theme switching, favicon updates, and localStorage management
 */

class ThemeManager {
    constructor() {
        this.currentTheme = this.getSavedTheme();
        this.favicon = null;
        this.init();
    }

    /**
     * Initialize theme manager
     */
    init() {
        this.setupFavicon();
        this.applyTheme(this.currentTheme);
        this.setupThemeToggle();
        this.setupSystemThemeListener();
    }

    /**
     * Get saved theme from localStorage or default to 'light'
     */
    getSavedTheme() {
        return localStorage.getItem('theme') || 'light';
    }

    /**
     * Setup favicon element reference
     */
    setupFavicon() {
        // Find existing favicon link or create one
        this.favicon = document.querySelector('link[rel="icon"]') || 
                      document.querySelector('link[rel="shortcut icon"]');
        
        if (!this.favicon) {
            this.favicon = document.createElement('link');
            this.favicon.rel = 'icon';
            document.head.appendChild(this.favicon);
        }
    }

    /**
     * Update favicon based on current theme
     */
    updateFavicon() {
        const faviconPath = this.currentTheme === 'dark' 
            ? '/logo-icon copy white.svg' 
            : '/logo-icon copy.svg';
        
        this.favicon.href = faviconPath;
    }

    /**
     * Update logo based on current theme
     */
    updateLogo() {
        const logos = document.querySelectorAll('.theme-logo');
        logos.forEach(logo => {
            // Determine which logo variant to use based on the original src
            if (logo.src.includes('logo-animated')) {
                logo.src = this.currentTheme === 'dark'
                    ? '/logo-animated-dark.svg'
                    : '/logo-animated.svg';
            } else if (logo.src.includes('logo-dark') || logo.src.includes('logo.svg')) {
                logo.src = this.currentTheme === 'dark'
                    ? '/logo-dark.svg'
                    : '/logo.svg';
            }
        });
    }

    /**
     * Apply theme to document
     */
    applyTheme(theme) {
        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('dark-mode', theme === 'dark');
        this.updateFavicon();
        this.updateLogo();
        localStorage.setItem('theme', theme);
    }

    /**
     * Toggle between light and dark themes
     */
    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
        this.updateThemeToggleUI();
        return newTheme;
    }

    /**
     * Update theme toggle button UI
     */
    updateThemeToggleUI() {
        const themeToggle = document.getElementById('theme-toggle') || 
                           document.getElementById('themeToggle');
        
        if (!themeToggle) return;

        // Find both sun and moon icons
        const sunIcon = themeToggle.querySelector('.fa-sun');
        const moonIcon = themeToggle.querySelector('.fa-moon');

        if (sunIcon && moonIcon) {
            // Dual icon setup - toggle visibility
            if (this.currentTheme === 'light') {
                sunIcon.style.display = 'none';
                moonIcon.style.display = 'inline-block';
            } else {
                sunIcon.style.display = 'inline-block';
                moonIcon.style.display = 'none';
            }
        } else if (sunIcon || moonIcon) {
            // Single icon setup - change the class
            const icon = sunIcon || moonIcon;
            icon.className = this.currentTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }

        // Update aria-label
        themeToggle.setAttribute('aria-label', 
            `Switch to ${this.currentTheme === 'light' ? 'dark' : 'light'} mode`);
    }

    /**
     * Setup theme toggle button event listener
     */
    setupThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle') || 
                           document.getElementById('themeToggle');
        
        if (themeToggle) {
            // Remove existing listeners to prevent duplicates
            themeToggle.replaceWith(themeToggle.cloneNode(true));
            const newThemeToggle = document.getElementById('theme-toggle') || 
                                  document.getElementById('themeToggle');
            
            newThemeToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleTheme();
            });

            this.updateThemeToggleUI();
        }
    }

    /**
     * Listen for system theme changes
     */
    setupSystemThemeListener() {
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            mediaQuery.addEventListener('change', (e) => {
                // Only auto-switch if user hasn't manually set a preference
                if (!localStorage.getItem('theme')) {
                    const systemTheme = e.matches ? 'dark' : 'light';
                    this.applyTheme(systemTheme);
                    this.updateThemeToggleUI();
                }
            });
        }
    }

    /**
     * Get current theme
     */
    getCurrentTheme() {
        return this.currentTheme;
    }

    /**
     * Check if current theme is dark
     */
    isDarkMode() {
        return this.currentTheme === 'dark';
    }

    /**
     * Check if current theme is light
     */
    isLightMode() {
        return this.currentTheme === 'light';
    }
}

// Initialize theme manager when DOM is loaded
let themeManager;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        themeManager = new ThemeManager();
    });
} else {
    themeManager = new ThemeManager();
}

// Export for use in other scripts
window.ThemeManager = ThemeManager;
window.themeManager = themeManager; 