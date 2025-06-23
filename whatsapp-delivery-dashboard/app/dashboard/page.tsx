"use client"
import {
  BarChart3,
  Bell,
  Building2,
  DollarSign,
  Download,
  Filter,
  MessageSquare,
  MoreHorizontal,
  Package,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Users,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeToggle } from "@/components/theme-toggle"

const recentBusinesses = [
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

const systemStats = [
  {
    title: "Total Revenue",
    value: "$45,231.89",
    change: "+20.1%",
    icon: DollarSign,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
  },
  {
    title: "Active Businesses",
    value: "2,350",
    change: "+180.1%",
    icon: Building2,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
  },
  {
    title: "Total Orders",
    value: "+12,234",
    change: "+19%",
    icon: Package,
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/20",
  },
  {
    title: "Bot Uptime",
    value: "99.9%",
    change: "+0.1%",
    icon: Zap,
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/20",
  },
]

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-white/80 backdrop-blur-xl dark:bg-slate-950/80">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                Admin Dashboard
              </span>
              <span className="text-xs text-muted-foreground">WhatsApp Delivery Bot</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search businesses..."
                className="w-64 rounded-xl border-0 bg-muted/50 pl-10 focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
            <Button variant="outline" size="sm" className="rounded-xl border-0 bg-muted/50 hover:bg-muted">
              <Bell className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-xl">
                  <Shield className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 rounded-xl" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Admin User</p>
                    <p className="text-xs leading-none text-muted-foreground">admin@whatsappbot.com</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-lg">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg">
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Overview */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {systemStats.map((stat, index) => (
            <Card key={index} className="border-0 shadow-lg bg-white/70 backdrop-blur-sm dark:bg-slate-900/70">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <div className={`rounded-xl p-2 ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-emerald-600">{stat.change}</span> from last month
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-7">
          {/* Main Content */}
          <div className="lg:col-span-5">
            <Tabs defaultValue="businesses" className="space-y-6">
              <div className="flex items-center justify-between">
                <TabsList className="grid w-full grid-cols-4 lg:w-[400px] rounded-xl bg-muted/50">
                  <TabsTrigger value="businesses" className="rounded-lg">
                    Businesses
                  </TabsTrigger>
                  <TabsTrigger value="orders" className="rounded-lg">
                    Orders
                  </TabsTrigger>
                  <TabsTrigger value="analytics" className="rounded-lg">
                    Analytics
                  </TabsTrigger>
                  <TabsTrigger value="bot" className="rounded-lg">
                    Bot Management
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl border-0 bg-muted/50">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-xl border-0 bg-muted/50">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>

              <TabsContent value="businesses" className="space-y-6">
                <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm dark:bg-slate-900/70">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-semibold">Business Management</CardTitle>
                        <CardDescription>Manage all registered businesses and their status</CardDescription>
                      </div>
                      <Button className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Business
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Business</TableHead>
                          <TableHead>Owner</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Orders</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Join Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentBusinesses.map((business) => (
                          <TableRow key={business.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-semibold">
                                  {business.name.charAt(0)}
                                </div>
                                <div>
                                  <div className="font-medium">{business.name}</div>
                                  <div className="text-sm text-muted-foreground">{business.id}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{business.owner}</div>
                                <div className="text-sm text-muted-foreground">{business.phone}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={business.status === "Active" ? "default" : "secondary"}
                                className={
                                  business.status === "Active"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : ""
                                }
                              >
                                {business.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{business.orders}</TableCell>
                            <TableCell className="font-medium">{business.revenue}</TableCell>
                            <TableCell>{business.joinDate}</TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-xl">
                                  <DropdownMenuItem className="rounded-lg">View Details</DropdownMenuItem>
                                  <DropdownMenuItem className="rounded-lg">Edit Business</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="rounded-lg text-red-600">
                                    Suspend Business
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
              </TabsContent>

              <TabsContent value="bot" className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm dark:bg-slate-900/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-emerald-600" />
                        WhatsApp Bot Status
                      </CardTitle>
                      <CardDescription>Monitor and manage your WhatsApp bot connection</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Connection Status</span>
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Connected
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Phone Number</span>
                        <span className="text-sm text-muted-foreground">+1 (555) 123-4567</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Last Activity</span>
                        <span className="text-sm text-muted-foreground">2 minutes ago</span>
                      </div>
                      <Separator />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 rounded-xl">
                          <QrCode className="h-4 w-4 mr-2" />
                          Show QR
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 rounded-xl">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Restart
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm dark:bg-slate-900/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-blue-600" />
                        Bot Performance
                      </CardTitle>
                      <CardDescription>Real-time bot performance metrics</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Message Success Rate</span>
                          <span className="text-sm font-medium">98.5%</span>
                        </div>
                        <Progress value={98.5} className="h-2" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Response Time</span>
                          <span className="text-sm font-medium">1.2s avg</span>
                        </div>
                        <Progress value={85} className="h-2" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Daily Messages</span>
                          <span className="text-sm font-medium">2,847</span>
                        </div>
                        <Progress value={75} className="h-2" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm dark:bg-slate-900/70">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start rounded-xl border-0 bg-muted/50">
                  <Users className="h-4 w-4 mr-2" />
                  View All Businesses
                </Button>
                <Button variant="outline" className="w-full justify-start rounded-xl border-0 bg-muted/50">
                  <Package className="h-4 w-4 mr-2" />
                  Monitor Orders
                </Button>
                <Button variant="outline" className="w-full justify-start rounded-xl border-0 bg-muted/50">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Generate Reports
                </Button>
                <Button variant="outline" className="w-full justify-start rounded-xl border-0 bg-muted/50">
                  <Settings className="h-4 w-4 mr-2" />
                  System Settings
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm dark:bg-slate-900/70">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <Building2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">New business registered</p>
                    <p className="text-xs text-muted-foreground">Pizza Palace joined the platform</p>
                    <p className="text-xs text-muted-foreground">2 hours ago</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <Package className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">High order volume</p>
                    <p className="text-xs text-muted-foreground">500+ orders processed today</p>
                    <p className="text-xs text-muted-foreground">4 hours ago</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                    <Zap className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Bot maintenance</p>
                    <p className="text-xs text-muted-foreground">System updated successfully</p>
                    <p className="text-xs text-muted-foreground">6 hours ago</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
