import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Join from "./pages/Join";
import Connect from "./pages/Connect";
import EventPage from "./pages/EventPage";
import DJDashboard from "./pages/DJDashboard";
import DJEventManage from "./pages/DJEventManage";
import DJDevTools from "./pages/DJDevTools";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Analytics from "./pages/Analytics";
import Archive from "./pages/Archive";

import ErrorMonitor from "./pages/ErrorMonitor";
import NotFound from "./pages/NotFound.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";

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
              <Route path="/join" element={<Join />} />
              <Route path="/connect" element={<Connect />} />
              <Route path="/event/:code" element={<EventPage />} />
              <Route path="/dj" element={<DJDashboard />} />
              <Route path="/dj/:id" element={<DJEventManage />} />
              <Route path="/dj/:id/dev" element={<DJDevTools />} />
              <Route path="/dj/:id/analytics" element={<Analytics />} />
              <Route path="/dj/archive" element={<Archive />} />
              <Route path="/dj/errors" element={<ErrorMonitor />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/users/:userId" element={<PublicProfile />} />
              <Route path="/testing" element={<Testing />} />
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
