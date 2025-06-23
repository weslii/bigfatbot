// Tab switching logic
window.addEventListener('DOMContentLoaded', function() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabContents.forEach(tab => tab.style.display = 'none');
      const tabId = btn.dataset.tab + '-tab';
      const tabToShow = document.getElementById(tabId);
      if (tabToShow) tabToShow.style.display = 'block';
    });
  });
  if (tabContents.length) tabContents[0].style.display = 'block';

  // 3-dot action menu logic
  const actionMenuBtns = document.querySelectorAll('.action-menu-btn');
  actionMenuBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Close all other dropdowns
      document.querySelectorAll('.dropdown.active').forEach(dropdown => {
        if (dropdown !== this.parentElement) {
          dropdown.classList.remove('active');
        }
      });
      // Toggle current dropdown
      this.parentElement.classList.toggle('active');
    });
  });
  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown.active').forEach(dropdown => {
      dropdown.classList.remove('active');
    });
  });

  // Theme toggle logic
  const themeToggle = document.getElementById('themeToggle');
  const body = document.body;
  if (themeToggle) {
    // Set initial theme from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      body.classList.add('dark-theme');
      themeToggle.querySelector('i').className = 'fas fa-sun';
    } else {
      body.classList.remove('dark-theme');
      themeToggle.querySelector('i').className = 'fas fa-moon';
    }
    themeToggle.addEventListener('click', function() {
      body.classList.toggle('dark-theme');
      const isDark = body.classList.contains('dark-theme');
      themeToggle.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  }

  // Notification button logic
  const notificationBtn = document.getElementById('notificationBtn');
  if (notificationBtn) {
    notificationBtn.addEventListener('click', function() {
      alert('Notifications feature coming soon!');
    });
  }

  // Profile dropdown logic
  const profileDropdown = document.getElementById('profileDropdown');
  const profileMenu = document.getElementById('profileMenu');
  if (profileDropdown && profileMenu) {
    profileDropdown.addEventListener('click', function(e) {
      e.stopPropagation();
      profileMenu.parentElement.classList.toggle('active');
    });
    document.addEventListener('click', function() {
      profileMenu.parentElement.classList.remove('active');
    });
  }
}); 