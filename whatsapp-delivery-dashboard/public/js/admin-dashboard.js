// Admin Dashboard JavaScript
document.addEventListener("DOMContentLoaded", () => {
  // Theme Toggle
  const themeToggle = document.getElementById("themeToggle")
  const body = document.body

  // Check for saved theme preference or default to light mode
  const currentTheme = localStorage.getItem("theme") || "light"
  body.setAttribute("data-theme", currentTheme)
  updateThemeIcon(currentTheme)

  themeToggle.addEventListener("click", () => {
    const currentTheme = body.getAttribute("data-theme")
    const newTheme = currentTheme === "dark" ? "light" : "dark"

    body.setAttribute("data-theme", newTheme)
    localStorage.setItem("theme", newTheme)
    updateThemeIcon(newTheme)
  })

  function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector("i")
    if (theme === "dark") {
      icon.className = "fas fa-sun"
    } else {
      icon.className = "fas fa-moon"
    }
  }

  // Profile Dropdown
  const profileDropdown = document.getElementById("profileDropdown")
  const profileMenu = document.getElementById("profileMenu")

  profileDropdown.addEventListener("click", (e) => {
    e.stopPropagation()
    profileDropdown.parentElement.classList.toggle("active")
  })

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    profileDropdown.parentElement.classList.remove("active")
  })

  // Tab Navigation
  const tabButtons = document.querySelectorAll(".tab-btn")
  const tabContents = document.querySelectorAll(".tab-content")

  tabButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const targetTab = this.getAttribute("data-tab")

      // Remove active class from all tabs and contents
      tabButtons.forEach((btn) => btn.classList.remove("active"))
      tabContents.forEach((content) => content.classList.remove("active"))

      // Add active class to clicked tab and corresponding content
      this.classList.add("active")
      document.getElementById(targetTab).classList.add("active")
    })
  })

  // Action Menu Dropdowns
  const actionMenuBtns = document.querySelectorAll(".action-menu-btn")

  actionMenuBtns.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation()

      // Close all other dropdowns
      document.querySelectorAll(".dropdown.active").forEach((dropdown) => {
        if (dropdown !== this.parentElement) {
          dropdown.classList.remove("active")
        }
      })

      // Toggle current dropdown
      this.parentElement.classList.toggle("active")
    })
  })

  // Search Functionality
  const searchInput = document.getElementById("searchInput")

  searchInput.addEventListener("input", function () {
    const searchTerm = this.value.toLowerCase()
    const tableRows = document.querySelectorAll(".data-table tbody tr")

    tableRows.forEach((row) => {
      const businessName = row.querySelector(".business-name")
      const ownerName = row.querySelector(".owner-name")

      if (businessName && ownerName) {
        const businessText = businessName.textContent.toLowerCase()
        const ownerText = ownerName.textContent.toLowerCase()

        if (businessText.includes(searchTerm) || ownerText.includes(searchTerm)) {
          row.style.display = ""
        } else {
          row.style.display = "none"
        }
      }
    })
  })

  // Notification Badge Click
  const notificationBtn = document.getElementById("notificationBtn")

  notificationBtn.addEventListener("click", () => {
    // Here you would typically show a notifications panel
    alert("Notifications feature coming soon!")
  })

  // Auto-refresh data every 30 seconds
  setInterval(() => {
    // Here you would typically fetch updated data from your server
    console.log("Auto-refreshing dashboard data...")
    updateLastActivity()
  }, 30000)

  function updateLastActivity() {
    // Update "Last Activity" timestamp in bot status
    const lastActivityElement = document.querySelector(".status-item:last-child .status-value")
    if (lastActivityElement && lastActivityElement.textContent.includes("minutes ago")) {
      const currentMinutes = Number.parseInt(lastActivityElement.textContent)
      lastActivityElement.textContent = `${currentMinutes + 1} minutes ago`
    }
  }

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault()
      const target = document.querySelector(this.getAttribute("href"))
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }
    })
  })

  // Add loading states for buttons
  document.querySelectorAll(".primary-btn, .secondary-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      if (!this.classList.contains("loading")) {
        this.classList.add("loading")
        const originalText = this.innerHTML
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...'

        // Remove loading state after 2 seconds (simulate API call)
        setTimeout(() => {
          this.classList.remove("loading")
          this.innerHTML = originalText
        }, 2000)
      }
    })
  })

  // Initialize tooltips (if you want to add them)
  function initTooltips() {
    const tooltipElements = document.querySelectorAll("[data-tooltip]")

    tooltipElements.forEach((element) => {
      element.addEventListener("mouseenter", function () {
        const tooltip = document.createElement("div")
        tooltip.className = "tooltip"
        tooltip.textContent = this.getAttribute("data-tooltip")
        document.body.appendChild(tooltip)

        const rect = this.getBoundingClientRect()
        tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + "px"
        tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + "px"
      })

      element.addEventListener("mouseleave", () => {
        const tooltip = document.querySelector(".tooltip")
        if (tooltip) {
          tooltip.remove()
        }
      })
    })
  }

  initTooltips()
})

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date))
}

function showNotification(message, type = "info") {
  const notification = document.createElement("div")
  notification.className = `notification notification-${type}`
  notification.textContent = message

  document.body.appendChild(notification)

  // Auto remove after 5 seconds
  setTimeout(() => {
    notification.remove()
  }, 5000)
}

// Export functions for use in other scripts
window.AdminDashboard = {
  formatCurrency,
  formatDate,
  showNotification,
}
