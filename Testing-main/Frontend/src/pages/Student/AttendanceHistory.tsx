import React, { useMemo, useState } from 'react';
import { Calendar, Filter, CheckCircle, Clock, Camera, Eye, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

type StudentAttendanceResponse = {
  records: {
    id: number;
    sessionType: 'check-in' | 'check-out';
    markedAt: string;
    verificationPhoto?: string | null;
  }[];
  stats: {
    presentDays: number;
    totalDays: number;
    percentage: number;
  };
};

export const AttendanceHistory: React.FC = () => {
  const { user } = useAuth();
  const [filterMonth, setFilterMonth] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['student-attendance', user?.rollNo],
    enabled: Boolean(user?.rollNo),
    queryFn: () =>
      apiFetch<StudentAttendanceResponse>(`/api/attendance/student/${user?.rollNo}`),
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const records = data?.records ?? [];
  const stats = data?.stats ?? { presentDays: 0, totalDays: 0, percentage: 0 };

  const filteredRecords = useMemo(() => {
    if (!filterMonth) return records;
    return records.filter((record) =>
      record.markedAt.startsWith(filterMonth)
    );
  }, [records, filterMonth]);

  const summaryCards = [
    { title: 'Overall', value: `${stats.percentage}%`, color: 'text-foreground' },
    { title: 'Days Present', value: stats.presentDays, color: 'text-green-600' },
    {
      title: 'Days Remaining',
      value: Math.max(stats.totalDays - stats.presentDays, 0),
      color: 'text-yellow-600',
    },
    { title: 'Sessions Logged', value: records.length, color: 'text-blue-600' },
  ];

  const getIcon = (sessionType: string) => {
    if (sessionType === 'check-in') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    return <Clock className="h-5 w-5 text-yellow-500" />;
  };

  if (!user?.rollNo) {
    return <div className="text-foreground">Please complete your profile to view attendance.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Attendance History</h2>
        <div className="text-sm text-muted-foreground">Your complete attendance record</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {summaryCards.map((card, index) => (
          <div
            key={index}
            className="glass p-6 rounded-xl shadow-lg hover-glow transition-all duration-300 transform hover:scale-105"
          >
            <div className="text-center">
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-sm text-muted-foreground">{card.title}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass p-4 rounded-xl flex items-center space-x-4 hover-glow transition-all duration-300">
        <Filter className="h-5 w-5 text-muted-foreground" />
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
        />
        {filterMonth && (
          <button
            onClick={() => setFilterMonth('')}
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Clear Filter
          </button>
        )}
      </div>

      <div className="glass rounded-xl shadow-lg overflow-hidden hover-glow transition-all duration-300">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">
            Records ({filteredRecords.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Loading attendance...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No attendance records found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredRecords.map((record) => (
              <div key={record.id} className="p-6 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    {getIcon(record.sessionType)}
                    <div className="flex-1">
                      <div className="text-lg font-semibold text-foreground">
                        {format(new Date(record.markedAt), 'EEEE, MMMM d, yyyy')}
                      </div>
                      <div className="text-sm text-muted-foreground capitalize">
                        {record.sessionType.replace('-', ' ')} at{' '}
                        {format(new Date(record.markedAt), 'h:mm a')}
                      </div>
                    </div>
                  </div>
                  {record.verificationPhoto && (
                    <button
                      onClick={() => setSelectedPhoto(record.verificationPhoto!)}
                      className="flex items-center space-x-2 px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                    >
                      <Camera className="h-4 w-4" />
                      <span className="text-sm">View Photo</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
