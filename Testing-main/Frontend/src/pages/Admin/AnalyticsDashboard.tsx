import React, { useMemo } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
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
} from 'chart.js';
import { Users, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { format, subDays, eachDayOfInterval } from 'date-fns';

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

type AnalyticsResponse = {
  totals: {
    totalStudents: number;
    presentToday: number;
    absentToday: number;
    avgAttendance: number;
    lowAttendance: number;
  };
  last7Days: { date: string; attendance: number }[];
  students: {
    id: number;
    name: string;
    rollNo: string;
    department: string;
    attendancePercentage: number;
  }[];
};

export const AnalyticsDashboard: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => apiFetch<AnalyticsResponse>('/api/attendance/stats/overview'),
  });

  const last7Days = useMemo(() => {
    if (!data?.last7Days?.length) {
      return eachDayOfInterval({
        start: subDays(new Date(), 6),
        end: new Date(),
      }).map((date) => ({
        date: format(date, 'MMM dd'),
        attendance: 0,
      }));
    }

    return data.last7Days.map((item) => ({
      date: format(new Date(item.date), 'MMM dd'),
      attendance: item.attendance,
    }));
  }, [data?.last7Days]);

  const students = data?.students ?? [];
  const totals = data?.totals ?? {
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    avgAttendance: 0,
    lowAttendance: 0,
  };

  if (isLoading) {
    return (
      <div className="glass p-6 rounded-xl text-muted-foreground">
        Loading analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass p-6 rounded-xl text-red-500">
        Failed to load analytics. Please try again.
      </div>
    );
  }

  const lineChartData = {
    labels: last7Days.map(d => d.date),
    datasets: [
      {
        label: 'Daily Attendance',
        data: last7Days.map(d => d.attendance),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        tension: 0.4,
        borderWidth: 3,
        pointBackgroundColor: '#2563eb',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  };

  const barChartData = {
    labels: students.map(s => s.name.split(' ')[0]),
    datasets: [
      {
        label: 'Attendance %',
        data: students.map(s => s.attendancePercentage),
        backgroundColor: students.map(s => s.attendancePercentage >= 75 ? '#16a34a' : '#dc2626'),
        borderRadius: 8,
        borderSkipped: false,
        hoverBackgroundColor: students.map(s => s.attendancePercentage >= 75 ? '#22c55e' : '#ef4444'),
      },
    ],
  };

  const doughnutData = {
    labels: ['Present', 'Absent'],
    datasets: [
      {
    data: [totals.presentToday, totals.absentToday],
        backgroundColor: ['#16a34a', '#dc2626'],
        hoverBackgroundColor: ['#22c55e', '#ef4444'],
        hoverOffset: 4,
        borderWidth: 3,
        borderColor: '#ffffff',
      },
    ],
  };

  const statsCards = [
    {
      title: 'Total Students',
      value: totals.totalStudents,
      icon: Users,
      color: 'blue',
    },
    {
      title: 'Average Attendance',
      value: `${totals.avgAttendance}%`,
      icon: TrendingUp,
      color: 'green',
    },
    {
      title: 'Low Attendance',
      value: totals.lowAttendance,
      icon: AlertTriangle,
      color: 'red',
    },
    {
      title: 'Present Today',
      value: last7Days[last7Days.length - 1]?.attendance || 0,
      icon: CheckCircle,
      color: 'green',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Analytics Dashboard</h2>
        <div className="text-sm text-muted-foreground">
          Overview of attendance trends and statistics
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          const colorClasses = {
            blue: 'bg-blue-500 text-blue-50',
            green: 'bg-green-500 text-green-50',
            red: 'bg-red-500 text-red-50',
          };

          return (
            <div key={index} className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105">
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Chart */}
        <div className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Attendance Trend (Last 7 Days)
          </h3>
          <div className="hover:shadow-[0_0_30px_rgba(37,99,235,0.3)] transition-shadow duration-300 rounded-lg p-2">
            <Line data={lineChartData} options={{ responsive: true }} />
          </div>
        </div>

        {/* Doughnut Chart */}
        <div className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Overall Attendance Distribution
          </h3>
          <div className="w-64 mx-auto hover:shadow-[0_0_30px_rgba(22,163,74,0.3)] transition-shadow duration-300 rounded-lg p-2">
            <Doughnut data={doughnutData} options={{ responsive: true }} />
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Individual Student Attendance
        </h3>
        <div className="hover:shadow-[0_0_30px_rgba(220,38,38,0.3)] transition-shadow duration-300 rounded-lg p-2">
          <Bar 
            data={barChartData} 
            options={{ 
              responsive: true,
              plugins: {
                legend: {
                  display: false
                }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100
                }
              }
            }} 
          />
        </div>
      </div>
    </div>
  );
};