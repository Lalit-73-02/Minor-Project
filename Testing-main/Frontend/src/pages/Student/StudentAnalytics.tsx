import React, { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { subDays, eachDayOfInterval, format } from "date-fns";
import { Line, Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import {
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

type StudentAttendanceResponse = {
  records: {
    id: number;
    sessionType: "check-in" | "check-out";
    markedAt: string;
  }[];
  stats: {
    presentDays: number;
    totalDays: number;
    percentage: number;
  };
};

export const StudentAnalytics: React.FC = () => {
  const { user, saveReferencePhoto } = useAuth();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const result = await saveReferencePhoto(base64);

      if ("error" in result) {
        toast({
          title: "Upload Failed",
          description: result.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Reference photo updated successfully. Please refresh to see changes.",
        });
        // Optionally reload page or update user context
        window.location.reload();
      }
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["student-analytics", user?.rollNo],
    enabled: Boolean(user?.rollNo),
    queryFn: () =>
      apiFetch<StudentAttendanceResponse>(`/api/attendance/student/${user?.rollNo}`),
  });

  const stats = data?.stats ?? { presentDays: 0, totalDays: 0, percentage: 0 };
  const records = data?.records ?? [];
  const daysAbsent = Math.max(stats.totalDays - stats.presentDays, 0);
  const lowAttendance = stats.percentage < 75;

  const dailyAttendance = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((record) => {
      const key = record.markedAt.slice(0, 10);
      const current = map.get(key) ?? 0;
      map.set(key, Math.min(current + 50, 100));
    });
    return map;
  }, [records]);

  const trendData = useMemo(() => {
    const interval = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date(),
    });

    return {
      labels: interval.map((day) => format(day, "EEE")),
      datasets: [
        {
          label: "Attendance %",
          data: interval.map((day) => {
            const key = day.toISOString().slice(0, 10);
            return dailyAttendance.get(key) ?? 0;
          }),
          borderColor: "rgb(59, 130, 246)",
          backgroundColor: "rgba(59, 130, 246, 0.5)",
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: "#3b82f6",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
        },
      ],
    };
  }, [dailyAttendance]);

  const distributionData = useMemo(
    () => ({
      labels: ["Present", "Absent"],
      datasets: [
        {
          label: "Days",
          data: [stats.presentDays, daysAbsent],
          backgroundColor: ["#22c55e", "#ef4444"],
          hoverBackgroundColor: ["#16a34a", "#dc2626"],
          hoverOffset: 4,
          borderWidth: 3,
          borderColor: "#ffffff",
        },
      ],
    }),
    [stats.presentDays, daysAbsent]
  );

  const weeklyData = useMemo(() => {
    const weeks = [0, 1, 2, 3].map((index) => {
      const start = subDays(new Date(), (index + 1) * 7);
      const end = subDays(new Date(), index * 7);
      const interval = eachDayOfInterval({ start, end });
      const daily = interval.map((day) => {
        const key = day.toISOString().slice(0, 10);
        return dailyAttendance.get(key) ?? 0;
      });
      const average =
        daily.length > 0
          ? Math.round(daily.reduce((sum, value) => sum + value, 0) / daily.length)
          : 0;
      return { label: `Week ${4 - index}`, value: average };
    });

    return {
      labels: weeks.map((week) => week.label),
      datasets: [
        {
          label: "Attendance %",
          data: weeks.map((week) => week.value),
          backgroundColor: "rgba(59, 130, 246, 0.8)",
          borderRadius: 8,
          borderSkipped: false,
          hoverBackgroundColor: "rgba(59, 130, 246, 1)",
        },
      ],
    };
  }, [dailyAttendance]);

  const statsCards = [
    {
      title: "Overall Attendance",
      value: `${stats.percentage}%`,
      icon: TrendingUp,
      color: "blue",
    },
    {
      title: "Days Present",
      value: stats.presentDays,
      icon: CheckCircle,
      color: "green",
    },
    {
      title: "Days Absent",
      value: daysAbsent,
      icon: XCircle,
      color: "red",
    },
    {
      title: "Target",
      value: "75%",
      icon: Calendar,
      color: "yellow",
    },
  ];

  if (isLoading) {
    return (
      <div className="glass p-6 rounded-xl text-muted-foreground">
        Loading analytics...
      </div>
    );
  }

  if (!user?.rollNo) {
    return <div className="text-foreground">Update your profile to see analytics.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Student Analytics</h2>
        <div className="text-sm text-muted-foreground">Your attendance performance overview</div>
      </div>

      {lowAttendance && (
        <div className="glass p-6 rounded-xl shadow-lg border border-red-500 hover-glow transition-all duration-300">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <h3 className="text-lg font-semibold text-red-500">Low Attendance Alert</h3>
          </div>
          <p className="mt-2 text-muted-foreground">
            Your attendance is below the required 75%. Please attend more classes to avoid being
            debarred from exams.
          </p>
        </div>
      )}

      <div className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105">
        <h3 className="text-lg font-semibold text-foreground mb-4">Student Information</h3>
        <ul className="space-y-2 text-muted-foreground">
          <li>
            <strong className="text-foreground">Name:</strong> {user.name}
          </li>
          <li>
            <strong className="text-foreground">Roll No:</strong> {user.rollNo}
          </li>
          <li>
            <strong className="text-foreground">Department:</strong> {user.department || "N/A"}
          </li>
          <li>
            <strong className="text-foreground">Year:</strong> {user.year || "N/A"}
          </li>
          <li>
            <strong className="text-foreground">Email:</strong> {user.email}
          </li>
          <li>
            <strong className="text-foreground">Goal:</strong> Maintain 75% attendance
          </li>
        </ul>
      </div>

      <div className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105">
        <h3 className="text-lg font-semibold text-foreground mb-4">Reference Photo</h3>
        <div className="flex flex-col items-center space-y-4">
          {user.referencePhoto ? (
            <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-primary/20">
              <img
                src={user.referencePhoto}
                alt="Reference"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center border-4 border-dashed border-muted-foreground/30">
              <Camera className="h-12 w-12 text-muted-foreground" />
            </div>
          )}

          <div className="w-full">
            <label htmlFor="photo-upload" className="cursor-pointer w-full">
              <div className="flex items-center justify-center w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Uploading..." : "Update Photo"}
              </div>
              <Input
                id="photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
                disabled={isUploading}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          const colorClasses = {
            blue: "bg-blue-500 text-blue-50",
            green: "bg-green-500 text-green-50",
            red: "bg-red-500 text-red-50",
            yellow: "bg-yellow-500 text-yellow-50",
          };

          return (
            <div
              key={index}
              className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105"
            >
              <div className="flex items-center">
                <div className={`p-3 rounded-lg ${colorClasses[stat.color as keyof typeof colorClasses]} shadow-lg`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105">
          <h3 className="text-lg font-semibold text-foreground mb-4">Attendance Trend</h3>
          <div className="hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-shadow duration-300 rounded-lg p-2">
            <Line data={trendData} options={{ responsive: true }} />
          </div>
        </div>

        <div className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105">
          <h3 className="text-lg font-semibold text-foreground mb-4">Attendance Distribution</h3>
          <div className="w-64 mx-auto hover:shadow-[0_0_30px_rgba(34,197,94,0.3)] transition-shadow duration-300 rounded-lg p-2">
            <Doughnut data={distributionData} options={{ responsive: true }} />
          </div>
        </div>
      </div>

      <div className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105">
        <h3 className="text-lg font-semibold text-foreground mb-4">Weekly Performance</h3>
        <div className="hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-shadow duration-300 rounded-lg p-2">
          <Bar
            data={weeklyData}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                },
              },
            }}
          />
        </div>
      </div>
    </div >
  );
};

