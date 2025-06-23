"use client"
import { ArrowRight, BarChart3, Bell, Building2, CheckCircle, MessageSquare, Package, Shield, Zap } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"

const features = [
  {
    icon: Package,
    title: "Order Management",
    description:
      "Track and manage all your delivery orders efficiently with real-time updates and automated workflows.",
    color: "from-emerald-500 to-teal-600",
  },
  {
    icon: Bell,
    title: "Automated Updates",
    description:
      "Keep customers informed with automated WhatsApp notifications about order status and delivery updates.",
    color: "from-blue-500 to-indigo-600",
  },
  {
    icon: BarChart3,
    title: "Business Analytics",
    description: "Get insights into your delivery performance with comprehensive analytics and reporting tools.",
    color: "from-purple-500 to-pink-600",
  },
]

const benefits = [
  "Seamless WhatsApp integration",
  "Real-time order tracking",
  "Automated customer notifications",
  "Multi-business management",
  "Advanced analytics dashboard",
  "24/7 customer support",
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-white/80 backdrop-blur-xl dark:bg-slate-950/80">
        <div className="container mx-auto px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  WhatsApp Delivery Bot
                </span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              <Link
                href="#features"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </Link>
              <Link
                href="#pricing"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="#contact"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Contact
              </Link>
              <ThemeToggle />
              <Button variant="outline" size="sm" className="rounded-xl border-0 bg-muted/50 hover:bg-muted">
                Admin Login
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 lg:py-32">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-6 bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700 border-emerald-200 dark:from-emerald-900/30 dark:to-teal-900/30 dark:text-emerald-400 dark:border-emerald-800">
              <Zap className="h-3 w-3 mr-1" />
              Streamline Your Delivery Business
            </Badge>

            <h1 className="text-4xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-800 bg-clip-text text-transparent dark:from-slate-100 dark:via-slate-200 dark:to-emerald-200">
              WhatsApp Delivery Bot
            </h1>

            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              Streamline your delivery business with our intelligent WhatsApp bot. Manage orders, track deliveries, and
              keep your customers informed with automated updates.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-8 py-3 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-xl border-0 bg-white/50 backdrop-blur-sm hover:bg-white/80 dark:bg-slate-800/50 dark:hover:bg-slate-800/80 px-8 py-3 text-base font-semibold"
              >
                Watch Demo
              </Button>
            </div>
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-emerald-200/20 rounded-full blur-3xl dark:bg-emerald-800/20"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-200/20 rounded-full blur-3xl dark:bg-teal-800/20"></div>
        </div>
      </section>

      {/* Main Cards Section */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <div className="grid gap-8 lg:grid-cols-2 max-w-5xl mx-auto">
            {/* For Businesses Card */}
            <Card className="border-0 shadow-xl bg-gradient-to-br from-white/80 to-emerald-50/50 backdrop-blur-sm dark:from-slate-900/80 dark:to-emerald-950/20 hover:shadow-2xl transition-all duration-500 group">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Building2 className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  For Businesses
                </CardTitle>
                <CardDescription className="text-base text-muted-foreground">
                  Register your business and start managing deliveries efficiently with our powerful automation tools.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="space-y-3 mb-6">
                  {benefits.slice(0, 3).map((benefit, index) => (
                    <div key={index} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
                <Button
                  size="lg"
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  Register Business
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            {/* For Administrators Card */}
            <Card className="border-0 shadow-xl bg-gradient-to-br from-white/80 to-slate-50/50 backdrop-blur-sm dark:from-slate-900/80 dark:to-slate-800/20 hover:shadow-2xl transition-all duration-500 group">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-700 shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-slate-600 to-slate-700 bg-clip-text text-transparent dark:from-slate-300 dark:to-slate-400">
                  For Administrators
                </CardTitle>
                <CardDescription className="text-base text-muted-foreground">
                  Access the comprehensive admin dashboard to manage all businesses and monitor platform performance.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="space-y-3 mb-6">
                  {benefits.slice(3, 6).map((benefit, index) => (
                    <div key={index} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-slate-500 flex-shrink-0" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full rounded-xl border-0 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <Link href="/dashboard" className="flex items-center">
                    Admin Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-gradient-to-r from-muted/30 to-muted/10">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 border-blue-200 dark:from-blue-900/30 dark:to-indigo-900/30 dark:text-blue-400 dark:border-blue-800">
              Features
            </Badge>
            <h2 className="text-3xl lg:text-4xl font-bold mb-4 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent dark:from-slate-100 dark:to-slate-300">
              Everything You Need
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed to streamline your delivery operations and enhance customer experience.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="border-0 shadow-lg bg-white/70 backdrop-blur-sm dark:bg-slate-900/70 hover:shadow-xl transition-all duration-300 group"
              >
                <CardHeader className="text-center">
                  <div
                    className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-lg group-hover:scale-110 transition-transform duration-300`}
                  >
                    <feature.icon className="h-7 w-7 text-white" />
                  </div>
                  <CardTitle className="text-xl font-semibold">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center text-muted-foreground">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <div className="grid gap-8 md:grid-cols-4 text-center">
            <div className="space-y-2">
              <div className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                500+
              </div>
              <div className="text-sm text-muted-foreground">Active Businesses</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                10K+
              </div>
              <div className="text-sm text-muted-foreground">Orders Processed</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                50K+
              </div>
              <div className="text-sm text-muted-foreground">Happy Customers</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                99.9%
              </div>
              <div className="text-sm text-muted-foreground">Uptime</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-emerald-600 to-teal-600">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Ready to Transform Your Delivery Business?</h2>
          <p className="text-xl text-emerald-100 mb-8 max-w-2xl mx-auto">
            Join hundreds of businesses already using our WhatsApp delivery bot to streamline their operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              className="rounded-xl bg-white text-emerald-600 hover:bg-emerald-50 px-8 py-3 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
            >
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10 px-8 py-3 text-base font-semibold"
            >
              Contact Sales
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/40 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                WhatsApp Delivery Bot
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="#" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link href="#" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <Link href="#" className="hover:text-foreground transition-colors">
                Support
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border/40 text-center text-sm text-muted-foreground">
            © 2025 WhatsApp Delivery Bot. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
