import React, { useMemo, useState } from 'react';
import { Check, X, Clock, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

type LeaveRecord = {
  id: number;
  rollNo: string;
  name: string;
  email: string;
  startDate: string;
  endDate: string;
  appliedAt: string;
  updatedAt?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
};

export const LeaveManagement: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leave-applications'],
    queryFn: () => apiFetch<{ applications: LeaveRecord[] }>('/api/leave'),
  });

  const applications = data?.applications ?? [];

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
      const matchesSearch =
        !searchTerm ||
        `${app.name} ${app.rollNo}`.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [applications, statusFilter, searchTerm]);

  const statusCounts = useMemo(() => {
    return {
      all: applications.length,
      pending: applications.filter((app) => app.status === 'pending').length,
      approved: applications.filter((app) => app.status === 'approved').length,
      rejected: applications.filter((app) => app.status === 'rejected').length,
    };
  }, [applications]);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'rejected' }) =>
      apiFetch(`/api/leave/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast({ title: 'Leave status updated' });
      queryClient.invalidateQueries({ queryKey: ['leave-applications'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update status',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between space-y-1 md:space-y-0">
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Leave Management</h2>
        <div className="text-xs md:text-sm text-muted-foreground">
          Review and manage student leave applications
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(statusCounts).map(([status, count]) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status as any)}
            className={`p-4 rounded-lg border text-left transition-colors ${
              statusFilter === status
                ? 'border-primary bg-primary/10'
                : 'border-border bg-background hover:bg-muted/40'
            }`}
          >
            <div className="text-2xl font-bold text-foreground">{count}</div>
            <div className="text-sm text-muted-foreground capitalize">
              {status === 'all' ? 'Total' : status}
            </div>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
          placeholder="Search by student name or ID..."
        />
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="rounded-lg p-8 text-center glass">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Loading applications...</p>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="rounded-lg p-8 text-center glass">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No leave applications found.</p>
          </div>
        ) : (
          filteredApplications.map((application) => (
            <div key={application.id} className="rounded-lg shadow border p-6 glass">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      {application.name}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                        application.status
                      )}`}
                    >
                      {application.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">Student ID:</span>
                      <div>{application.rollNo}</div>
                    </div>
                    <div>
                      <span className="font-medium">Start Date:</span>
                      <div>{format(new Date(application.startDate), 'PPP')}</div>
                    </div>
                    <div>
                      <span className="font-medium">End Date:</span>
                      <div>{format(new Date(application.endDate), 'PPP')}</div>
                    </div>
                    <div>
                      <span className="font-medium">Applied On:</span>
                      <div>{format(new Date(application.appliedAt), 'PPP')}</div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <span className="font-medium text-foreground">Reason:</span>
                    <p className="mt-1 text-foreground bg-muted p-3 rounded-lg">
                      {application.reason}
                    </p>
                  </div>

                  {application.updatedAt && application.status !== 'pending' && (
                    <div className="text-sm text-muted-foreground">
                      Updated on {format(new Date(application.updatedAt), 'PPP')}
                    </div>
                  )}
                </div>

                {application.status === 'pending' && (
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ id: application.id, status: 'approved' })
                      }
                      className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Check className="h-4 w-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ id: application.id, status: 'rejected' })
                      }
                      className="flex items-center space-x-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <X className="h-4 w-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
