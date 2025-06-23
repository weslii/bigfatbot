"use client"
import { useEffect, useState } from "react"
import {
  BarChart3,
  Building2,
  MessageSquare,
  Package,
  Settings,
  Shield,
  TrendingUp,
  Users,
  LogOut,
  Bell,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Plus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const navigationItems = [
  {
    title: "Dashboard",
    icon: BarChart3,
    isActive: true,
  },
  {
    title: "Businesses",
    icon: Building2,
    isActive: false,
  },
  {
    title: "Orders",
    icon: Package,
    isActive: false,
  },
  {
    title: "Users",
    icon: Users,
    isActive: false,
  },
  {
    title: "Admins",
    icon: Shield,
    isActive: false,
  },
]

const recentOrders = [
  {
    id: "ORD-001",
    business: "Gourmet Delights",
    customer: "Sarah Johnson",
    status: "delivered",
    date: "2025-01-23",
    amount: "$45.99",
  },
  {
    id: "ORD-002",
    business: "Tech Solutions",
    customer: "Michael Chen",
    status: "pending",
    date: "2025-01-23",
    amount: "$129.50",
  },
  {
    id: "ORD-003",
    business: "Fashion Hub",
    customer: "Emma Davis",
    status: "processing",
    date: "2025-01-22",
    amount: "$89.99",
  },
]

const activeBusinesses = [
  {
    name: "Gourmet Delights",
    owner: "Alex Rodriguez",
    groups: 12,
    status: "active",
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    name: "Tech Solutions",
    owner: "Maria Garcia",
    groups: 8,
    status: "active",
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    name: "Fashion Hub",
    owner: "David Kim",
    groups: 15,
    status: "pending",
    avatar: "/placeholder.svg?height=32&width=32",
  },
]

function AppSidebar() {
  return (
    <Sidebar variant="inset" className="border-r-0">
      <SidebarHeader className="border-b border-border/40 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              WhatsApp Bot
            </span>
            <span className="text-xs text-muted-foreground">Delivery Platform</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-gradient-to-b from-background to-muted/20">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider px-3">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={item.isActive}
                    className="h-11 px-3 rounded-xl transition-all duration-200 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50 dark:hover:from-emerald-950/20 dark:hover:to-teal-950/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-emerald-100 data-[active=true]:to-teal-100 dark:data-[active=true]:from-emerald-900/30 dark:data-[active=true]:to-teal-900/30 data-[active=true]:shadow-sm"
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="font-medium">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border/40 bg-gradient-to-r from-muted/30 to-muted/10">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-12 px-3 rounded-xl hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30">
                  <Avatar className="h-8 w-8 border-2 border-emerald-200 dark:border-emerald-800">
                    <AvatarImage src="/placeholder.svg?height=32&width=32" />
                    <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-semibold">
                      AD
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-semibold">Admin User</span>
                    <span className="text-xs text-muted-foreground">admin@company.com</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-56 rounded-xl shadow-xl border-0 bg-white/95 backdrop-blur-sm dark:bg-gray-950/95"
              >
                <DropdownMenuItem className="rounded-lg">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg text-red-600 dark:text-red-400">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      setError(null);
      try {
        // Try to fetch all dashboard data from /admin/dashboard API (custom endpoint)
        const res = await fetch(`${API_BASE_URL}/admin/dashboard`, {
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats || {});
          setOrders(data.orders || []);
          setBusinesses(data.businesses || []);
        } else {
          // fallback: try separate endpoints
          const [statsRes, ordersRes, businessesRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/admin/stats`, { credentials: "include" }),
            fetch(`${API_BASE_URL}/api/admin/orders?limit=5`, { credentials: "include" }),
            fetch(`${API_BASE_URL}/api/admin/businesses?active=true`, { credentials: "include" })
          ]);
          setStats(statsRes.ok ? await statsRes.json() : {});
          setOrders(ordersRes.ok ? await ordersRes.json() : []);
          setBusinesses(businessesRes.ok ? await businessesRes.json() : []);
        }
      } catch (err: any) {
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  if (loading) return <div className="p-8 text-lg">Loading dashboard...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  // Fallbacks for stats
  const totalBusinesses = stats?.totalBusinesses || stats?.businesses || 0;
  const activeOrders = stats?.activeOrders || stats?.orders || 0;
  const totalUsers = stats?.totalUsers || stats?.users || 0;
  const revenue = stats?.revenue || "$0";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
          {/* Header */}
          <header className="sticky top-0 z-40 border-b border-border/40 bg-white/80 backdrop-blur-xl dark:bg-slate-950/80">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-muted/50" />
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent dark:from-slate-100 dark:to-slate-300">
                    Dashboard Overview
                  </h1>
                  <p className="text-sm text-muted-foreground">Welcome back, Admin</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      className="w-64 pl-9 rounded-xl border-0 bg-muted/50 focus:bg-white dark:focus:bg-slate-800 transition-colors"
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-muted/50">
                    <Bell className="h-4 w-4" />
                  </Button>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="p-6 space-y-8">
            {/* Stats Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-emerald-50/50 dark:from-slate-900 dark:to-emerald-950/20 hover:shadow-xl transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Total Businesses</CardTitle>
                  <Building2 className="h-5 w-5 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                    {totalBusinesses}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    {/* Example: +12% from last month */}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-blue-50/50 dark:from-slate-900 dark:to-blue-950/20 hover:shadow-xl transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Active Orders</CardTitle>
                  <Package className="h-5 w-5 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    {activeOrders}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-blue-500" />
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-purple-50/50 dark:from-slate-900 dark:to-purple-950/20 hover:shadow-xl transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Total Users</CardTitle>
                  <Users className="h-5 w-5 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    {totalUsers}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-purple-500" />
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-orange-50/50 dark:from-slate-900 dark:to-orange-950/20 hover:shadow-xl transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Revenue</CardTitle>
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                    {revenue}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-orange-500" />
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Orders */}
            <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm dark:bg-slate-900/70 hover:shadow-xl transition-all duration-300">
              <CardHeader className="border-b border-border/40 bg-gradient-to-r from-muted/30 to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold">Recent Orders</CardTitle>
                    <CardDescription>Latest delivery requests from your businesses</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="rounded-lg border-0 bg-muted/50 hover:bg-muted">
                      <Filter className="h-4 w-4 mr-2" />
                      Filter
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New Order
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-muted/30">
                      <TableHead className="font-semibold text-foreground">Order ID</TableHead>
                      <TableHead className="font-semibold text-foreground">Business</TableHead>
                      <TableHead className="font-semibold text-foreground">Customer</TableHead>
                      <TableHead className="font-semibold text-foreground">Amount</TableHead>
                      <TableHead className="font-semibold text-foreground">Status</TableHead>
                      <TableHead className="font-semibold text-foreground">Date</TableHead>
                      <TableHead className="font-semibold text-foreground w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order: any) => (
                      <TableRow key={order.id || order.order_id} className="border-border/40 hover:bg-muted/20 transition-colors">
                        <TableCell className="font-mono text-sm font-medium">{order.order_id || order.id}</TableCell>
                        <TableCell className="font-medium">{order.business_name || order.business}</TableCell>
                        <TableCell>{order.customer_name || order.customer}</TableCell>
                        <TableCell className="font-semibold">{order.amount || order.total || "$0"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              order.status === "delivered"
                                ? "default"
                                : order.status === "pending"
                                  ? "secondary"
                                  : "outline"
                            }
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              order.status === "delivered"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : order.status === "pending"
                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{order.date || (order.created_at ? new Date(order.created_at).toLocaleDateString() : "")}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted/50">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="rounded-xl shadow-xl border-0 bg-white/95 backdrop-blur-sm dark:bg-gray-950/95"
                            >
                              <DropdownMenuItem className="rounded-lg">
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem className="rounded-lg">
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Order
                              </DropdownMenuItem>
                              <DropdownMenuItem className="rounded-lg text-red-600 dark:text-red-400">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Cancel Order
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Active Businesses */}
            <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm dark:bg-slate-900/70 hover:shadow-xl transition-all duration-300">
              <CardHeader className="border-b border-border/40 bg-gradient-to-r from-muted/30 to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold">Active Businesses</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-muted/30">
                      <TableHead className="font-semibold text-foreground">Business Name</TableHead>
                      <TableHead className="font-semibold text-foreground">Owner</TableHead>
                      <TableHead className="font-semibold text-foreground">Groups</TableHead>
                      <TableHead className="font-semibold text-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {businesses.map((business: any) => (
                      <TableRow key={business.id || business.business_id} className="border-border/40 hover:bg-muted/20 transition-colors">
                        <TableCell>{business.business_name || business.name}</TableCell>
                        <TableCell>{business.owner_name || business.owner}</TableCell>
                        <TableCell>{business.total_groups || business.groups}</TableCell>
                        <TableCell>
                          <Badge className="rounded-full px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            Active
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
