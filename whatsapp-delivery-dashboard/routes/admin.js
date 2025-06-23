// Example Express.js route for the admin dashboard
const express = require("express")
const router = express.Router()

// Sample data - replace with your actual database queries
const sampleBusinesses = [
  {
    id: "BIZ001",
    name: "Pizza Palace",
    owner: "John Smith",
    phone: "+1234567890",
    status: "Active",
    orders: 156,
    revenue: "$12,450",
    joinDate: "2024-01-15",
  },
  {
    id: "BIZ002",
    name: "Fresh Groceries",
    owner: "Sarah Johnson",
    phone: "+1234567891",
    status: "Active",
    orders: 89,
    revenue: "$8,920",
    joinDate: "2024-01-20",
  },
  {
    id: "BIZ003",
    name: "Tech Repairs",
    owner: "Mike Wilson",
    phone: "+1234567892",
    status: "Pending",
    orders: 0,
    revenue: "$0",
    joinDate: "2024-01-25",
  },
  {
    id: "BIZ004",
    name: "Flower Shop",
    owner: "Emma Davis",
    phone: "+1234567893",
    status: "Active",
    orders: 234,
    revenue: "$18,670",
    joinDate: "2024-01-10",
  },
]

// Admin Dashboard Route
router.get("/dashboard", (req, res) => {
  // In a real application, you would:
  // 1. Check if user is authenticated and has admin privileges
  // 2. Fetch actual data from your database
  // 3. Calculate real statistics

  const dashboardData = {
    businesses: sampleBusinesses,
    stats: {
      totalRevenue: 45231.89,
      activeBusinesses: 2350,
      totalOrders: 12234,
      botUptime: 99.9,
    },
    botStatus: {
      connected: true,
      phoneNumber: "+1 (555) 123-4567",
      lastActivity: "2 minutes ago",
      messageSuccessRate: 98.5,
      responseTime: "1.2s",
      dailyMessages: 2847,
    },
  }

  res.render("admin/dashboard", dashboardData)
})

// API endpoint for real-time data updates
router.get("/api/dashboard-stats", (req, res) => {
  // Return JSON data for AJAX updates
  res.json({
    stats: {
      totalRevenue: 45231.89,
      activeBusinesses: 2350,
      totalOrders: 12234,
      botUptime: 99.9,
    },
    botStatus: {
      connected: true,
      lastActivity: new Date().toISOString(),
      messageSuccessRate: 98.5,
      responseTime: "1.2s",
      dailyMessages: 2847,
    },
  })
})

// Business management routes
router.get("/business/:id", (req, res) => {
  const businessId = req.params.id
  const business = sampleBusinesses.find((b) => b.id === businessId)

  if (!business) {
    return res.status(404).render("error", { message: "Business not found" })
  }

  res.render("admin/business-detail", { business })
})

router.get("/business/:id/edit", (req, res) => {
  const businessId = req.params.id
  const business = sampleBusinesses.find((b) => b.id === businessId)

  if (!business) {
    return res.status(404).render("error", { message: "Business not found" })
  }

  res.render("admin/business-edit", { business })
})

module.exports = router
