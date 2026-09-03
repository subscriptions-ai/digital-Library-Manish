/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { ForcePasswordChange } from "./components/ForcePasswordChange";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { Home } from "./components/Home";
import { NotFound } from "./components/NotFound";

import { DigitalLibrary } from "./components/DigitalLibrary";
import { AboutUs } from "./components/AboutUs";
import { ContactUs } from "./components/ContactUs";
import { InstitutionalAccess } from "./components/InstitutionalAccess";
import { Login } from "./components/Login";
import { Signup } from "./components/Signup";
import { JournalDetail } from "./components/JournalDetail";
import { JournalPage } from "./components/library/JournalPage";
import { AuthorPage } from "./components/library/AuthorPage";
import { ArticlePage } from "./components/library/ArticlePage";
import { DepartmentPage } from "./components/library/DepartmentPage";
import { PublisherPage } from "./components/library/PublisherPage";
import { SubjectPage } from "./components/library/SubjectPage";
import { PrivacyPolicy } from "./components/PrivacyPolicy";
import { TermsAndConditions } from "./components/TermsAndConditions";
import { LegalDisclaimer } from "./components/LegalDisclaimer";
import { ContentSources } from "./components/ContentSources";
import { ContentRemoval } from "./components/ContentRemoval";
// Lazy-loaded so the plan/price data it imports lands in its own chunk and is
// never downloaded by public visitors — only by admins/managers who open it.
const QuotationWizard = lazy(() =>
  import("./components/QuotationWizard").then(m => ({ default: m.QuotationWizard }))
);
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
import { ReceiptManager } from "./components/admin/ReceiptManager";
import { PublisherManager } from "./components/admin/PublisherManager";
import { MediaLibrary } from "./components/admin/MediaLibrary";
import { PublisherReviewQueue } from "./components/admin/PublisherReviewQueue";
import { DataIngestion } from "./components/admin/DataIngestion";
import { StructuredLibrary } from "./components/StructuredLibrary";
import { PublisherLayout } from "./components/publisher/PublisherLayout";
import { PublisherDashboard } from "./components/publisher/PublisherDashboard";
import { UserCreationPanel } from "./components/admin/UserCreationPanel";
import { DraftedContentManager } from './components/admin/DraftedContentManager';
import { AdminFeedbackManager } from "./components/admin/AdminFeedbackManager";
import { AdminFeedbackDetails } from "./components/admin/AdminFeedbackDetails";
import { AdminSalesTeam } from "./components/admin/AdminSalesTeam";
import { AdminExecutivePipeline } from "./components/admin/AdminExecutivePipeline";
import { AdminLeadManager } from "./components/admin/AdminLeadManager";
import { SalesLayout } from "./components/sales/SalesLayout";
import { SalesDashboard } from "./components/sales/SalesDashboard";
import { SalesLeadTable } from "./components/sales/SalesLeadTable";
import { SalesActivityLog } from "./components/sales/SalesActivityLog";
import { SalesPerformance } from "./components/sales/SalesPerformance";
import { SalesLeadDetails } from "./components/sales/SalesLeadDetails";
import { MyQuotations } from "./components/sales/MyQuotations";
import { ValidatorDashboard } from "./components/admin/ValidatorDashboard";
import { AgencyInquiriesPage } from "./components/admin/AgencyInquiriesPage";
import { ContactInquiriesPage } from "./components/admin/ContactInquiriesPage";
import { TakedownRequests } from "./components/admin/TakedownRequests";
import { DemoRequestsPage } from "./components/admin/DemoRequestsPage";
import { CouponsManager } from './components/admin/CouponsManager';
import { CouponDetails } from './components/admin/CouponDetails';
import { AdminPayments } from './components/admin/AdminPayments';
import { RequestDemo } from './components/RequestDemo';
import { ExtractionDashboard } from './components/admin/ExtractionDashboard';
import { ExtractionJobDetails } from './components/admin/ExtractionJobDetails';
import { EmailVerificationsPage } from './components/admin/EmailVerificationsPage';
import { AdminEmailSettings } from './components/admin/settings/AdminEmailSettings';
import { DetailedAnalyticsPage } from './components/admin/dashboard/DetailedAnalyticsPage';

import { CONTENT_MODULES } from "./constants";

import { AuthProvider } from "./contexts/AuthContext";
import { DashboardLayout } from "./components/DashboardLayout";
import { LMSDashboard } from "./components/dashboard/LMSDashboard";
import { LibraryHome } from "./components/dashboard/LibraryHome";

/**
 * A redirect that carries the query string with it. Every filtered browse URL
 * the reader has shared or bookmarked lives under the old path with its
 * filters in the query, and dropping them would land them on an unfiltered
 * page that looks like the wrong one.
 */
function KeepQuery({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}
import { MySubscriptions } from "./components/dashboard/MySubscriptions";
import { InvoicesPayments } from "./components/dashboard/InvoicesPayments";
import { ProfileSettings } from "./components/dashboard/ProfileSettings";
import MyFavorites from "./components/dashboard/MyFavorites";
import { ProtectedContentViewer } from "./components/dashboard/ProtectedContentViewer";
import { VideoLibrary } from "./components/dashboard/VideoLibrary";
import { LmsVideoPlayer } from "./components/dashboard/LmsVideoPlayer";
import MyHistory from "./components/dashboard/MyHistory";
import { MyFeedbacksPage } from "./components/dashboard/MyFeedbacksPage";
import { FAQ } from "./components/FAQ";
import { ForInstitutions } from "./components/ForInstitutions";
import { ForStudents } from "./components/ForStudents";
import { DomainLandingPage } from "./components/DomainLandingPage";
import { PublicContentPreview } from "./components/PublicContentPreview";
import { SearchResults } from "./components/SearchResults";
import { Toaster } from "react-hot-toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScrollToTop } from "./components/ScrollToTop";

import { InstitutionLayout } from "./components/institution/InstitutionLayout";
import { InstitutionDashboardHome } from "./components/institution/InstitutionDashboardHome";
import { InstitutionStudentManager } from "./components/institution/InstitutionStudentManager";
import { InstitutionProfile } from "./components/institution/InstitutionProfile";
import { InstitutionContentLibrary } from "./components/institution/InstitutionContentLibrary";
import { InstitutionContentAccess } from "./components/institution/InstitutionContentAccess";
import { InstitutionAnalytics } from "./components/institution/InstitutionAnalytics";
import { InstitutionSubscriptions } from "./components/institution/InstitutionSubscriptions";

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

import { HelmetProvider } from "react-helmet-async";
import { AnalyticsTracker } from "./components/AnalyticsTracker";
import { CookieConsent } from "./components/CookieConsent";
import { EmailVerificationPopup } from "./components/dashboard/EmailVerificationPopup";

export default function App() {
  return (
    <HelmetProvider>
      <ErrorBoundary>
        <AuthProvider>
            <Router>
              <AnalyticsTracker />
              <ScrollToTop />
              <FirstLoginGate>
              <div className="flex min-h-screen flex-col font-sans text-slate-900 antialiased">
                <Toaster position="top-right" />
                <CookieConsent />
                <EmailVerificationPopup />
                <Routes>
                {/* Subscriber Dashboard routes with DashboardLayout */}
                <Route path="/dashboard" element={<DashboardLayout><LMSDashboard /></DashboardLayout>} />
                <Route path="/dashboard/content/:id" element={<DashboardLayout><ProtectedContentViewer /></DashboardLayout>} />
                <Route path="/dashboard/library" element={<DashboardLayout><LibraryHome tab="browse" /></DashboardLayout>} />
                <Route path="/dashboard/library/access" element={<DashboardLayout><LibraryHome tab="access" /></DashboardLayout>} />
                <Route path="/dashboard/library/saved" element={<DashboardLayout><LibraryHome tab="saved" /></DashboardLayout>} />
                {/* The old sidebar entries. Anything already linked or bookmarked
                    still lands on the right tab rather than on NotFound. */}
                <Route path="/dashboard/access" element={<Navigate to="/dashboard/library/access" replace />} />
                <Route path="/dashboard/favorites" element={<Navigate to="/dashboard/library/saved" replace />} />
                <Route path="/dashboard/history" element={<DashboardLayout><MyHistory /></DashboardLayout>} />
                <Route path="/dashboard/feedbacks" element={<DashboardLayout><MyFeedbacksPage /></DashboardLayout>} />
                <Route path="/dashboard/videos" element={<DashboardLayout><VideoLibrary /></DashboardLayout>} />
                <Route path="/dashboard/videos/player/:id" element={<DashboardLayout><LmsVideoPlayer /></DashboardLayout>} />
                <Route path="/dashboard/viewer/:id" element={<DashboardLayout><ProtectedContentViewer /></DashboardLayout>} />
                <Route path="/dashboard/subscriptions" element={<DashboardLayout><MySubscriptions /></DashboardLayout>} />
                <Route path="/dashboard/invoices" element={<DashboardLayout><InvoicesPayments /></DashboardLayout>} />
                <Route path="/dashboard/settings" element={<DashboardLayout><ProfileSettings /></DashboardLayout>} />
                
                {/* Admin Routes */}
                <Route path="/admin" element={<AdminLayout><AdminDashboardHome /></AdminLayout>} />
                <Route path="/admin/users" element={<AdminLayout><UserManager /></AdminLayout>} />
                <Route path="/admin/subscriptions" element={<AdminLayout><SubscriptionListPage /></AdminLayout>} />
                <Route path="/admin/subscription-requests" element={<AdminLayout><SubscriptionRequestsPage /></AdminLayout>} />
                <Route path="/admin/analytics" element={<AdminLayout><DetailedAnalyticsPage /></AdminLayout>} />
                <Route path="/admin/pricing" element={<AdminLayout><ContentPricingModule /></AdminLayout>} />
                <Route path="/admin/quotations" element={<AdminLayout><QuotationManager /></AdminLayout>} />
                <Route path="/admin/quotations/create" element={<AdminLayout><Suspense fallback={null}><QuotationWizard isAdminMode={true} /></Suspense></AdminLayout>} />
                <Route path="/admin/receipts" element={<AdminLayout><ReceiptManager /></AdminLayout>} />
                <Route path="/admin/publishers" element={<AdminLayout><PublisherManager /></AdminLayout>} />
                <Route path="/admin/media" element={<AdminLayout><MediaLibrary /></AdminLayout>} />
                <Route path="/admin/review" element={<AdminLayout><PublisherReviewQueue /></AdminLayout>} />
                <Route path="/admin/ingestion" element={<AdminLayout><DataIngestion /></AdminLayout>} />
                <Route path="/publisher" element={<PublisherLayout><PublisherDashboard /></PublisherLayout>} />
                <Route path="/dashboard/explore" element={<KeepQuery to="/dashboard/library" />} />
                <Route path="/dashboard/journal/:journalId" element={<DashboardLayout><JournalPage /></DashboardLayout>} />
                <Route path="/dashboard/author/:authorId" element={<DashboardLayout><AuthorPage /></DashboardLayout>} />
                <Route path="/dashboard/article/:articleId" element={<DashboardLayout><ArticlePage /></DashboardLayout>} />
                <Route path="/dashboard/department/:slug" element={<DashboardLayout><DepartmentPage /></DashboardLayout>} />
                <Route path="/dashboard/publisher/:slug" element={<DashboardLayout><PublisherPage /></DashboardLayout>} />
                <Route path="/dashboard/subject/:slug" element={<DashboardLayout><SubjectPage /></DashboardLayout>} />
                <Route path="/admin/agency-inquiries" element={<AdminLayout><AgencyInquiriesPage /></AdminLayout>} />
                <Route path="/admin/contact-inquiries" element={<AdminLayout><ContactInquiriesPage /></AdminLayout>} />
                <Route path="/admin/takedown" element={<AdminLayout><TakedownRequests /></AdminLayout>} />
                <Route path="/admin/demo-requests" element={<AdminLayout><DemoRequestsPage /></AdminLayout>} />
                <Route path="/admin/validator" element={<AdminLayout><ValidatorDashboard /></AdminLayout>} />
                <Route path="/admin/drafts" element={<AdminLayout><DraftedContentManager /></AdminLayout>} />
                <Route path="/admin/feedbacks" element={<AdminLayout><AdminFeedbackManager /></AdminLayout>} />
                <Route path="/admin/feedbacks/:id" element={<AdminLayout><AdminFeedbackDetails /></AdminLayout>} />
                <Route path="/admin/sales-team" element={<AdminLayout><AdminSalesTeam /></AdminLayout>} />
                <Route path="/admin/sales-team/:id" element={<AdminLayout><AdminExecutivePipeline /></AdminLayout>} />
                <Route path="/admin/leads" element={<AdminLayout><AdminLeadManager /></AdminLayout>} />
                <Route path="/admin/coupons" element={<AdminLayout><CouponsManager /></AdminLayout>} />
                <Route path="/admin/coupons/:id" element={<AdminLayout><CouponDetails /></AdminLayout>} />
                <Route path="/admin/payments" element={<AdminLayout><AdminPayments /></AdminLayout>} />
                <Route path="/admin/extraction" element={<AdminLayout><ExtractionDashboard /></AdminLayout>} />
                <Route path="/admin/extraction/jobs/:id" element={<AdminLayout><ExtractionJobDetails /></AdminLayout>} />
                <Route path="/admin/email-verifications" element={<AdminLayout><EmailVerificationsPage /></AdminLayout>} />
                <Route path="/admin/email-settings" element={<AdminLayout><AdminEmailSettings /></AdminLayout>} />

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
                <Route path="/institution/analytics" element={<InstitutionLayout><InstitutionAnalytics /></InstitutionLayout>} />
                <Route path="/institution/access" element={<InstitutionLayout><InstitutionContentAccess /></InstitutionLayout>} />
                <Route path="/institution/library" element={<InstitutionLayout><InstitutionContentLibrary /></InstitutionLayout>} />
                <Route path="/institution/explore" element={<InstitutionLayout><StructuredLibrary viewerBasePath="/institution/viewer" /></InstitutionLayout>} />
                <Route path="/institution/journal/:journalId" element={<InstitutionLayout><JournalPage articleBase="/institution/article" departmentBase="/institution/department" publisherBase="/institution/publisher" subjectBase="/institution/subject" /></InstitutionLayout>} />
                <Route path="/institution/author/:authorId" element={<InstitutionLayout><AuthorPage journalBase="/institution/journal" articleBase="/institution/article" departmentBase="/institution/department" /></InstitutionLayout>} />
                <Route path="/institution/article/:articleId" element={<InstitutionLayout><ArticlePage viewerBase="/institution/viewer" journalBase="/institution/journal" authorBase="/institution/author" articleBase="/institution/article" departmentBase="/institution/department" publisherBase="/institution/publisher" /></InstitutionLayout>} />
                <Route path="/institution/department/:slug" element={<InstitutionLayout><DepartmentPage journalBase="/institution/journal" browseBase="/institution/explore" /></InstitutionLayout>} />
                <Route path="/institution/publisher/:slug" element={<InstitutionLayout><PublisherPage journalBase="/institution/journal" departmentBase="/institution/department" /></InstitutionLayout>} />
                <Route path="/institution/subject/:slug" element={<InstitutionLayout><SubjectPage journalBase="/institution/journal" departmentBase="/institution/department" /></InstitutionLayout>} />
                <Route path="/institution/viewer/:id" element={<InstitutionLayout><ProtectedContentViewer /></InstitutionLayout>} />
                <Route path="/institution/videos/player/:id" element={<InstitutionLayout><LmsVideoPlayer /></InstitutionLayout>} />
                <Route path="/institution/subscriptions" element={<InstitutionLayout><InstitutionSubscriptions /></InstitutionLayout>} />
                <Route path="/institution/profile" element={<InstitutionLayout><InstitutionProfile /></InstitutionLayout>} />
                <Route path="/institution/feedbacks" element={<InstitutionLayout><MyFeedbacksPage /></InstitutionLayout>} />

                {/* Subscription Manager Routes */}
                <Route path="/manager" element={<ManagerLayout><AdminDashboardHome /></ManagerLayout>} />
                <Route path="/manager/requests" element={<ManagerLayout><SubscriptionRequestsPage /></ManagerLayout>} />
                <Route path="/manager/subscriptions" element={<ManagerLayout><SubscriptionListPage /></ManagerLayout>} />
                <Route path="/manager/quotations" element={<ManagerLayout><QuotationManager /></ManagerLayout>} />
                <Route path="/manager/quotations/create" element={<ManagerLayout><Suspense fallback={null}><QuotationWizard isAdminMode={true} /></Suspense></ManagerLayout>} />
                <Route path="/manager/users/create" element={<ManagerLayout><UserCreationPanel /></ManagerLayout>} />

                {/* Admin User Management */}
                <Route path="/admin/users/create" element={<AdminLayout><UserCreationPanel /></AdminLayout>} />

                {/* Sales Executive Routes */}
                <Route path="/sales" element={<SalesLayout><SalesDashboard /></SalesLayout>} />
                <Route path="/sales/leads" element={<SalesLayout><SalesLeadTable /></SalesLayout>} />
                <Route path="/sales/activity" element={<SalesLayout><SalesActivityLog /></SalesLayout>} />
                <Route path="/sales/performance" element={<SalesLayout><SalesPerformance /></SalesLayout>} />
                <Route path="/sales/leads/:id" element={<SalesLayout><SalesLeadDetails /></SalesLayout>} />
                <Route path="/sales/quotations" element={<SalesLayout><MyQuotations /></SalesLayout>} />
                <Route path="/sales/quotations/create" element={<SalesLayout><Suspense fallback={null}><QuotationWizard isAdminMode={true} /></Suspense></SalesLayout>} />

                {/* Main Layout routes */}
              <Route path="*" element={
                <>
                  <Navbar />
                  <main className="flex-1">
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/digital-library" element={<DigitalLibrary />} />
                      <Route path="/for-institutions" element={<ForInstitutions />} />
                      <Route path="/for-students" element={<ForStudents />} />

                      <Route path="/journals" element={<DigitalLibrary />} />
                      <Route path="/journal/:journalId" element={<JournalDetail />} />
                      <Route path="/library/journal/:journalId" element={<JournalPage articleBase="/library/article" departmentBase="/library/department" publisherBase="/library/publisher" subjectBase="/library/subject" />} />
                      <Route path="/library/author/:authorId" element={<AuthorPage journalBase="/library/journal" articleBase="/library/article" departmentBase="/library/department" />} />
                      <Route path="/library/article/:articleId" element={<ArticlePage journalBase="/library/journal" authorBase="/library/author" articleBase="/library/article" departmentBase="/library/department" publisherBase="/library/publisher" />} />
                      <Route path="/library/department/:slug" element={<DepartmentPage journalBase="/library/journal" browseBase="/digital-library" />} />
                      <Route path="/library/publisher/:slug" element={<PublisherPage journalBase="/library/journal" departmentBase="/library/department" />} />
                      <Route path="/library/subject/:slug" element={<SubjectPage journalBase="/library/journal" departmentBase="/library/department" />} />
                      <Route path="/institutional-access" element={<InstitutionalAccess />} />
                      <Route path="/about" element={<AboutUs />} />
                      <Route path="/contact" element={<ContactUs />} />
                      <Route path="/faq" element={<FAQ />} />
                      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                      <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
                      <Route path="/legal-disclaimer" element={<LegalDisclaimer />} />
                      <Route path="/content-sources" element={<ContentSources />} />
                      <Route path="/content-removal" element={<ContentRemoval />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/signup" element={<Signup />} />
                      <Route path="/request-demo" element={<RequestDemo />} />
                      <Route path="/domain/:domainId" element={<DomainLandingPage />} />
                      <Route path="/preview/:id" element={<PublicContentPreview />} />
                      <Route path="/search" element={<SearchResults />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </main>
                  <Footer />
                </>
              } />
            </Routes>
          </div>
          </FirstLoginGate>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
    </HelmetProvider>
  );
}



