import React, { useState, useMemo } from 'react';
import { Download, FileText, Filter, Calendar, Camera, Eye, X } from 'lucide-react';
import { exportToPDF, exportToExcel } from '../../utils/exportUtils';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

type AttendanceRecord = {
  id: number;
  rollNo: string;
  studentName: string;
  department: string;
  sessionType: string;
  markedAt: string;
  verificationPhoto?: string | null;
};

type StudentSummary = {
  id: number;
  name: string;
  email: string;
  rollNo: string;
  department: string;
  year: string;
};

export const AttendanceReports: React.FC = () => {
  const [dateFilter, setDateFilter] = useState({
    startDate: '',
    endDate: '',
  });
  const [departmentFilter, setDepartmentFilter] = useState('');

  const { data: studentData } = useQuery({
    queryKey: ['students-list'],
    queryFn: () => apiFetch<{ students: StudentSummary[] }>('/api/admin/students'),
  });

  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  
  const { data: attendanceData, isLoading, refetch } = useQuery({
    queryKey: ['attendance-records', dateFilter, departmentFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFilter.startDate) params.append('startDate', dateFilter.startDate);
      if (dateFilter.endDate) params.append('endDate', dateFilter.endDate);
      if (departmentFilter) params.append('department', departmentFilter);
      const query = params.toString() ? `?${params.toString()}` : '';
      return apiFetch<{ records: AttendanceRecord[] }>(`/api/attendance${query}`);
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const students = studentData?.students ?? [];
  const filteredRecords = attendanceData?.records ?? [];

  const departments = useMemo(
    () => Array.from(new Set(students.map((s) => s.department).filter(Boolean))),
    [students]
  );

  if (isLoading) {
    return (
      <div className="glass p-6 rounded-xl text-muted-foreground">
        Loading attendance records...
      </div>
    );
  }

  const handleExportPDF = () => {
    exportToPDF(filteredRecords);
  };

  const handleExportExcel = () => {
    exportToExcel(filteredRecords);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-2xl font-bold text-foreground">Attendance Reports</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExportPDF}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors hover-glow"
          >
            <FileText className="h-4 w-4" />
            <span>Export PDF</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors hover-glow"
          >
            <Download className="h-4 w-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg p-6 glass hover-glow">
        <div className="flex items-center space-x-4 mb-4">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={dateFilter.startDate}
              onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              End Date
            </label>
            <input
              type="date"
              value={dateFilter.endDate}
              onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Department
            </label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="rounded-lg shadow overflow-hidden glass hover-glow">
        <div className="px-6 py-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">
              Attendance Records ({filteredRecords.length})
            </h3>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Generated on {format(new Date(), 'PPP')}</span>
            </div>
          </div>
        </div>

        {/* ✅ Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Student
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Session
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Marked At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Verification
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    No attendance records found for the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4 text-sm">
                      {format(new Date(record.markedAt), 'PPP')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{record.studentName}</div>
                      <div className="text-sm text-muted-foreground">ID: {record.rollNo}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">{record.department || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm capitalize">{record.sessionType}</td>
                    <td className="px-6 py-4 text-sm">{format(new Date(record.markedAt), 'pp')}</td>
                    <td className="px-6 py-4">
                      {record.verificationPhoto ? (
                        <button
                          onClick={() => setSelectedPhoto(record.verificationPhoto!)}
                          className="flex items-center space-x-2 px-3 py-1 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                        >
                          <Camera className="h-4 w-4" />
                          <span className="text-sm">View Photo</span>
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">No photo</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ✅ Mobile Cards */}
        <div className="block md:hidden">
          {filteredRecords.length === 0 ? (
            <div className="px-6 py-8 text-center text-muted-foreground">
              No attendance records found for the selected filters.
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {filteredRecords.map((record) => (
                <div key={record.id} className="p-4 border rounded-lg bg-background shadow-sm">
                  <p>
                    <span className="font-semibold">Date:</span>{' '}
                    {format(new Date(record.markedAt), 'PPP')}
                  </p>
                  <p>
                    <span className="font-semibold">Student:</span> {record.studentName} (ID: {record.rollNo})
                  </p>
                  <p>
                    <span className="font-semibold">Department:</span> {record.department || 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold">Session:</span> {record.sessionType}
                  </p>
                  <p>
                    <span className="font-semibold">Marked At:</span> {format(new Date(record.markedAt), 'pp')}
                  </p>
                  {record.verificationPhoto && (
                    <div className="mt-3">
                      <button
                        onClick={() => setSelectedPhoto(record.verificationPhoto!)}
                        className="flex items-center space-x-2 px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors w-full"
                      >
                        <Camera className="h-4 w-4" />
                        <span className="text-sm">View Verification Photo</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto relative">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 p-2 bg-muted rounded-full hover:bg-muted/80 transition-colors z-10"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center space-x-2">
                <Camera className="h-5 w-5" />
                <span>Verification Photo</span>
              </h3>
              <img
                src={selectedPhoto}
                alt="Verification"
                className="w-full h-auto rounded-lg border border-border"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
