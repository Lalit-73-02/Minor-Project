import React from "react";
import { PanelShell } from "../../components/PanelShell";
import { QrCode, History, FileText, BarChart3, Bell, Camera } from "lucide-react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface StudentDashboardProps {
  onLogout: () => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onLogout }) => {
  const { user } = useAuth();
  const navItems = [
    { label: "Dashboard", href: "/panel/student", icon: BarChart3 },
    { label: "Scan QR", href: "/panel/student/scanner", icon: QrCode },
    { label: "Face Scan", href: "/panel/student/face-scan", icon: Camera },
    { label: "History", href: "/panel/student/history", icon: History },
    { label: "Leave", href: "/panel/student/leave", icon: FileText },
    { label: "Alerts", href: "/panel/student/alerts", icon: Bell },
  ];

  return (
    <PanelShell title={<span>{user?.name || "Student"}</span>} navItems={navItems} onLogout={onLogout}>
      <div className="rounded-2xl shadow glass p-4 sm:p-6">
        <Outlet />
      </div>
    </PanelShell>
  );
};
