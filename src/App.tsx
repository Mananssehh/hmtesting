import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Join from "./pages/Join";
import EventPage from "./pages/EventPage";
import DJDashboard from "./pages/DJDashboard";
import DJEventManage from "./pages/DJEventManage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/join" element={<Join />} />
            <Route path="/event/:code" element={<EventPage />} />
            <Route path="/dj" element={<DJDashboard />} />
            <Route path="/dj/:id" element={<DJEventManage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </Sonner>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
