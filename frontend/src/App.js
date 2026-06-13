import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import NewOrder from "@/pages/NewOrder";
import Customers from "@/pages/Customers";
import Dispatch from "@/pages/Dispatch";
import Products from "@/pages/Products";
import AdminUsers from "@/pages/AdminUsers";
import AdminSettings from "@/pages/AdminSettings";
import PriceLists from "@/pages/PriceLists";
import DailyReport from "@/pages/DailyReport";
import LoginAttestations from "@/pages/LoginAttestations";
import DispatchLedger from "@/pages/DispatchLedger";
import Suppliers from "@/pages/Suppliers";
import SupplierLedger from "@/pages/SupplierLedger";
import PurchaseCenter from "@/pages/PurchaseCenter";
import InstallPrompt from "@/components/InstallPrompt";
import "@/App.css";

function Protected({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-10 text-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/new" element={<NewOrder />} />
            <Route path="customers" element={<Customers />} />
            <Route path="dispatch" element={<Dispatch />} />
            <Route path="purchase-center" element={<Protected adminOnly><PurchaseCenter /></Protected>} />
            <Route path="dispatch-ledger" element={<DispatchLedger />} />
            <Route path="products" element={<Products />} />
            <Route path="reports/daily" element={<DailyReport />} />
            <Route path="admin/users" element={<Protected adminOnly><AdminUsers /></Protected>} />
            <Route path="admin/price-lists" element={<Protected adminOnly><PriceLists /></Protected>} />
            <Route path="admin/settings" element={<Protected adminOnly><AdminSettings /></Protected>} />
            <Route path="admin/login-attestations" element={<Protected adminOnly><LoginAttestations /></Protected>} />
            <Route path="admin/suppliers" element={<Protected adminOnly><Suppliers /></Protected>} />
            <Route path="admin/suppliers/:id" element={<Protected adminOnly><SupplierLedger /></Protected>} />
            <Route path="admin/dispatch-ledger" element={<Navigate to="/dispatch-ledger" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
      <InstallPrompt />
    </AuthProvider>
  );
}
