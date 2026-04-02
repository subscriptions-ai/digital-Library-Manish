/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { Home } from "./components/Home";
import { DomainPage } from "./components/DomainPage";
import { DigitalLibrary } from "./components/DigitalLibrary";
import { AboutUs } from "./components/AboutUs";
import { ContactUs } from "./components/ContactUs";
import { SubscriptionPlans } from "./components/SubscriptionPlans";
import { InstitutionalAccess } from "./components/InstitutionalAccess";
import { Login } from "./components/Login";
import { Signup } from "./components/Signup";
import { JournalDetail } from "./components/JournalDetail";
import { Dashboard } from "./components/Dashboard";
import { AgencyListing } from "./components/AgencyListing";
import { PrivacyPolicy } from "./components/PrivacyPolicy";
import { TermsAndConditions } from "./components/TermsAndConditions";
import { Cart } from "./components/Cart";
import { Checkout } from "./components/Checkout";
import { QuotationPreview } from "./components/QuotationPreview";
import { QuotationWizard } from "./components/QuotationWizard";
import { AdminDashboard } from "./components/AdminDashboard";
import { CartProvider } from "./contexts/CartContext";
import { AuthProvider } from "./contexts/AuthContext";
import { DashboardLayout } from "./components/DashboardLayout";
import { DashboardHome } from "./components/DashboardHome";
import { UserManagement } from "./components/UserManagement";
import { SubscriptionManagement } from "./components/SubscriptionManagement";
import { ContentManagement } from "./components/ContentManagement";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { Toaster } from "react-hot-toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScrollToTop } from "./components/ScrollToTop";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CartProvider>
          <Router>
            <ScrollToTop />
            <div className="flex min-h-screen flex-col font-sans text-slate-900 antialiased">
              <Toaster position="top-right" />
              <Routes>
                {/* Dashboard routes with DashboardLayout */}
                <Route path="/dashboard" element={<DashboardLayout><DashboardHome /></DashboardLayout>} />
                <Route path="/dashboard/users" element={<DashboardLayout><UserManagement /></DashboardLayout>} />
                <Route path="/dashboard/subscriptions" element={<DashboardLayout><SubscriptionManagement /></DashboardLayout>} />
                <Route path="/dashboard/content" element={<DashboardLayout><ContentManagement /></DashboardLayout>} />
                <Route path="/dashboard/analytics" element={<DashboardLayout><AnalyticsDashboard /></DashboardLayout>} />
                <Route path="/dashboard/settings" element={<DashboardLayout><div>Settings</div></DashboardLayout>} />
                
                <Route path="/admin" element={<AdminDashboard />} />
                
                {/* Main Layout routes */}
              <Route path="*" element={
                <>
                  <Navbar />
                  <main className="flex-1">
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/digital-library" element={<DigitalLibrary />} />
                      <Route path="/domain/:domainId" element={<DomainPage />} />
                      <Route path="/journals" element={<DigitalLibrary />} />
                      <Route path="/journal/:journalId" element={<JournalDetail />} />
                      <Route path="/subscriptions" element={<SubscriptionPlans isFullPage={true} showTitle={true} />} />
                      <Route path="/institutional-access" element={<InstitutionalAccess />} />
                      <Route path="/agency-listing" element={<AgencyListing />} />
                      <Route path="/about" element={<AboutUs />} />
                      <Route path="/contact" element={<ContactUs />} />
                      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                      <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/signup" element={<Signup />} />
                      <Route path="/cart" element={<Cart />} />
                      <Route path="/checkout" element={<Checkout />} />
                      <Route path="/create-quotation" element={<QuotationWizard />} />
                      <Route path="/quotation-preview" element={<QuotationPreview />} />
                      <Route path="*" element={<Home />} />
                    </Routes>
                  </main>
                  <Footer />
                </>
              } />
            </Routes>
          </div>
        </Router>
      </CartProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}



