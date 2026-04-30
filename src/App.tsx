import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Graph from "./pages/Graph.tsx";
import Reconciliation from "./pages/Reconciliation.tsx";
import Assistant from "./pages/Assistant.tsx";
import Settings from "./pages/Settings.tsx";
import UploadPage from "./pages/Upload.tsx";
import Vendors from "./pages/Vendors.tsx";
import Audit from "./pages/Audit.tsx";
import AppLayout from "./components/AppLayout.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner theme="dark" position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/register" element={<Auth />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/graph" element={<Graph />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
