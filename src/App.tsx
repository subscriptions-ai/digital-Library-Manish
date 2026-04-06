/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { ForcePasswordChange } from "./components/ForcePasswordChange";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { Home } from "./components/Home";

import { DigitalLibrary } from "./components/DigitalLibrary";
import { AboutUs } from "./components/AboutUs";
import { ContactUs } from "./components/ContactUs";
import { SubscriptionPlans } from "./components/SubscriptionPlans";
import { InstitutionalAccess } from "./components/InstitutionalAccess";
import { Login } from "./components/Login";
import { Signup } from "./components/Signup";
import { JournalDetail } from "./components/JournalDetail";
import { AgencyListing } from "./components/AgencyListing";
import { PrivacyPolicy } from "./components/PrivacyPolicy";
import { TermsAndConditions } from "./components/TermsAndConditions";
import { Cart } from "./components/Cart";
import { Checkout } from "./components/Checkout";
import { QuotationPreview } from "./components/QuotationPreview";
import { QuotationWizard } from "./components/QuotationWizard";
import { AdminLayout } from "./components/admin/AdminLayout";
import { AdminDashboardHome } from "./components/admin/AdminDashboardHome";
import { UserManager } from "./components/admin/UserManager";
import { ContentModuleLayout } from "./components/admin/content/ContentModuleLayout";
import { ContentListView } from "./components/admin/content/ContentListView";
import { ContentSingleEditor } from "./components/admin/content/ContentSingleEditor";
import { ContentBulkImport } from "./components/admin/content/ContentBulkImport";
import { SubscriptionRequestsPage } from "./components/admin/subscriptions/SubscriptionRequestsPage";
import { SubscriptionListPage } from "./components/admin/subscriptions/SubscriptionListPage";
import { ContentPricingModule } from "./components/admin/ContentPricingModule";
import { QuotationManager } from "./components/admin/QuotationManager";
import { UserCreationPanel } from "./components/admin/UserCreationPanel";

const CONTENT_MODULES = [
  { slug: 'books',                  contentType: 'Books'                   },
  { slug: 'periodicals',            contentType: 'Periodicals'             },
  { slug: 'magazines',              contentType: 'Magazines'               },
  { slug: 'case-reports',           contentType: 'Case Reports'            },
  { slug: 'theses',                 contentType: 'Theses'                  },
  { slug: 'conference-proceedings', contentType: 'Conference Proceedings'  },
  { slug: 'educational-videos',     contentType: 'Educational Videos'      },
  { slug: 'newsletters',            contentType: 'Newsletters'             },
];

import { CartProvider } from "./contexts/CartContext";
import { AuthProvider } from "./contexts/AuthContext";
import { DashboardLayout } from "./components/DashboardLayout";
import { SubscriberOverview } from "./components/dashboard/SubscriberOverview";
import { MyContentAccess } from "./components/dashboard/MyContentAccess";
import { MySubscriptions } from "./components/dashboard/MySubscriptions";
import { InvoicesPayments } from "./components/dashboard/InvoicesPayments";
import { ProfileSettings } from "./components/dashboard/ProfileSettings";
import { FAQ } from "./components/FAQ";
import { Toaster } from "react-hot-toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScrollToTop } from "./components/ScrollToTop";

import { InstitutionLayout } from "./components/institution/InstitutionLayout";
import { InstitutionDashboardHome } from "./components/institution/InstitutionDashboardHome";
import { InstitutionStudentManager } from "./components/institution/InstitutionStudentManager";

import { ManagerLayout } from "./components/manager/ManagerLayout";

function FirstLoginGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  if (loading) return null;
  if (!dismissed && profile?.isFirstLogin) {
    return <ForcePasswordChange onComplete={() => setDismissed(true)} />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CartProvider>
          <Router>
            <ScrollToTop />
            <FirstLoginGate>
            <div className="flex min-h-screen flex-col font-sans text-slate-900 antialiased">
              <Toaster position="top-right" />
              <Routes>
                {/* Subscriber Dashboard routes with DashboardLayout */}
                <Route path="/dashboard" element={<DashboardLayout><SubscriberOverview /></DashboardLayout>} />
                <Route path="/dashboard/access" element={<DashboardLayout><MyContentAccess /></DashboardLayout>} />
                <Route path="/dashboard/subscriptions" element={<DashboardLayout><MySubscriptions /></DashboardLayout>} />
                <Route path="/dashboard/invoices" element={<DashboardLayout><InvoicesPayments /></DashboardLayout>} />
                <Route path="/dashboard/settings" element={<DashboardLayout><ProfileSettings /></DashboardLayout>} />
                
                {/* Admin Routes */}
                <Route path="/admin" element={<AdminLayout><AdminDashboardHome /></AdminLayout>} />
                <Route path="/admin/users" element={<AdminLayout><UserManager /></AdminLayout>} />
                <Route path="/admin/subscriptions" element={<AdminLayout><SubscriptionListPage /></AdminLayout>} />
                <Route path="/admin/subscription-requests" element={<AdminLayout><SubscriptionRequestsPage /></AdminLayout>} />
                <Route path="/admin/pricing" element={<AdminLayout><ContentPricingModule /></AdminLayout>} />
                <Route path="/admin/quotations" element={<AdminLayout><QuotationManager /></AdminLayout>} />

                {/* Per Content Type Module Routes (8 modules × 3 pages each) */}
                {CONTENT_MODULES.map(({ slug, contentType }) => (
                  <React.Fragment key={slug}>
                    <Route path={`/admin/${slug}`} element={
                      <AdminLayout>
                        <ContentModuleLayout contentType={contentType}>
                          <ContentListView contentType={contentType} />
                        </ContentModuleLayout>
                      </AdminLayout>
                    } />
                    <Route path={`/admin/${slug}/new`} element={
                      <AdminLayout>
                        <ContentModuleLayout contentType={contentType}>
                          <ContentSingleEditor contentType={contentType} />
                        </ContentModuleLayout>
                      </AdminLayout>
                    } />
                    <Route path={`/admin/${slug}/:id`} element={
                      <AdminLayout>
                        <ContentModuleLayout contentType={contentType}>
                          <ContentSingleEditor contentType={contentType} />
                        </ContentModuleLayout>
                      </AdminLayout>
                    } />
                    <Route path={`/admin/${slug}/import`} element={
                      <AdminLayout>
                        <ContentModuleLayout contentType={contentType}>
                          <ContentBulkImport contentType={contentType} />
                        </ContentModuleLayout>
                      </AdminLayout>
                    } />
                  </React.Fragment>
                ))}

                {/* Fallback admin route */}
                <Route path="/admin/*" element={<AdminLayout><AdminDashboardHome /></AdminLayout>} />

                {/* Institution Routes */}
                <Route path="/institution" element={<InstitutionLayout><InstitutionDashboardHome /></InstitutionLayout>} />
                <Route path="/institution/students" element={<InstitutionLayout><InstitutionStudentManager /></InstitutionLayout>} />
                <Route path="/institution/analytics" element={<InstitutionLayout><InstitutionDashboardHome /></InstitutionLayout>} />

                {/* Subscription Manager Routes */}
                <Route path="/manager" element={<ManagerLayout><AdminDashboardHome /></ManagerLayout>} />
                <Route path="/manager/requests" element={<ManagerLayout><SubscriptionRequestsPage /></ManagerLayout>} />
                <Route path="/manager/subscriptions" element={<ManagerLayout><SubscriptionListPage /></ManagerLayout>} />
                <Route path="/manager/quotations" element={<ManagerLayout><QuotationManager /></ManagerLayout>} />
                <Route path="/manager/users/create" element={<ManagerLayout><UserCreationPanel /></ManagerLayout>} />

                {/* Admin User Management */}
                <Route path="/admin/users/create" element={<AdminLayout><UserCreationPanel /></AdminLayout>} />

                
                {/* Main Layout routes */}
              <Route path="*" element={
                <>
                  <Navbar />
                  <main className="flex-1">
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/digital-library" element={<DigitalLibrary />} />

                      <Route path="/journals" element={<DigitalLibrary />} />
                      <Route path="/journal/:journalId" element={<JournalDetail />} />
                      <Route path="/subscriptions" element={<SubscriptionPlans isFullPage={true} showTitle={true} />} />
                      <Route path="/institutional-access" element={<InstitutionalAccess />} />
                      <Route path="/agency-listing" element={<AgencyListing />} />
                      <Route path="/about" element={<AboutUs />} />
                      <Route path="/contact" element={<ContactUs />} />
                      <Route path="/faq" element={<FAQ />} />
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
          </FirstLoginGate>
        </Router>
      </CartProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}



