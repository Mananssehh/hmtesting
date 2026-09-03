import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import {
  GuardLoading,
  RequireAdmin,
  RequireAuth,
  RequireDJ,
  RequireEventOwner,
} from "@/components/guards/RouteGuards";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Join from "./pages/Join";
import Connect from "./pages/Connect";
import EventPage from "./pages/EventPage";
import DJDashboard from "./pages/DJDashboard";
import DJEventManage from "./pages/DJEventManage";
import DJOnboarding from "./pages/DJOnboarding";
import OAuthConsent from "./pages/OAuthConsent";




import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Analytics from "./pages/Analytics";
import Archive from "./pages/Archive";
import ActivityLedger from "./pages/ActivityLedger";
import AdminReports from "./pages/AdminReports";

import ErrorMonitor from "./pages/ErrorMonitor";
import Earnings from "./pages/Earnings";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import DMCA from "./pages/legal/DMCA";
import Contact from "./pages/legal/Contact";
import TrustSafety from "./pages/legal/TrustSafety";
import RefundPolicy from "./pages/legal/RefundPolicy";
import NotFound from "./pages/NotFound.tsx";
import Unsubscribe from "./pages/Unsubscribe";

import { ErrorBoundary } from "./components/ErrorBoundary";

// Developer tooling is loaded through a dynamic import that only exists in
// development builds. In production `import.meta.env.DEV` folds to false and
// the branch (with the entire src/dev chunk) is dropped from the bundle, so
// /dj/:id/dev falls through to the NotFound catch-all.
const DevRoutes = import.meta.env.DEV ? lazy(() => import("./dev/DevRoutes")) : null;

const queryClient = new QueryClient();


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/v1/callback" element={<AuthCallback />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/join" element={<Join />} />
              <Route path="/connect" element={<Connect />} />
              <Route path="/event/:code" element={<EventPage />} />
              <Route path="/dj" element={<DJDashboard />} />
              <Route path="/dj/onboarding" element={<DJOnboarding />} />
              <Route path="/dj/:id" element={<DJEventManage />} />
              <Route path="/dj/:id/dev" element={<DJDevTools />} />
              <Route path="/dj/:id/analytics" element={<Analytics />} />
              <Route path="/dj/archive" element={<Archive />} />
              <Route path="/dj/earnings" element={<Earnings />} />
              <Route path="/dj/errors" element={<ErrorMonitor />} />
              
              
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/activity" element={<ActivityLedger />} />
              <Route path="/users/:userId" element={<PublicProfile />} />
              <Route path="/admin/reports" element={<AdminReports />} />

              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/dmca" element={<DMCA />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/trust-safety" element={<TrustSafety />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />


              
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
