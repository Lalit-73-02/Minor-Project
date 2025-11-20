import React, { useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Search, Mail } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const YEAR_OPTIONS = ['1st year', '2nd year', '3rd year', '4th year'];

type ManagedStudent = {
  id: number;
  name: string;
  email: string;
  rollNo: string;
  department: string;
  year: string;
  attendancePercentage: number;
  presentDays: number;
  totalDays: number;
};

const initialFormState = {
  name: '',
  email: '',
  rollNo: '',
  department: '',
  year: YEAR_OPTIONS[0],
  password: '',
};

export const StudentManagement: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<ManagedStudent | null>(null);
  const [formData, setFormData] = useState(initialFormState);

  const { data, isLoading } = useQuery({
    queryKey: ['students-list'],
    queryFn: () => apiFetch<{ students: ManagedStudent[] }>('/api/admin/students'),
  });

  const students = data?.students ?? [];

  const filteredStudents = useMemo(() => {
    return students.filter((student) =>
      `${student.name} ${student.rollNo} ${student.email}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );
  }, [students, searchTerm]);

  const invalidateStudents = () =>
    queryClient.invalidateQueries({ queryKey: ['students-list'] });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify(formData),
      }),
    onSuccess: () => {
      toast({ title: 'Student added successfully' });
      resetForm();
      invalidateStudents();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to add student', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/students/${editingStudent?.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          department: formData.department,
          year: formData.year,
        }),
      }),
    onSuccess: () => {
      toast({ title: 'Student updated successfully' });
      resetForm();
      invalidateStudents();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update student', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/students/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({ title: 'Student removed' });
      invalidateStudents();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to remove student', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStudent) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const handleEdit = (student: ManagedStudent) => {
    setEditingStudent(student);
    setShowForm(true);
    setFormData({
      name: student.name,
      email: student.email,
      rollNo: student.rollNo,
      department: student.department,
      year: student.year,
      password: '',
    });
  };

  const handleDelete = (student: ManagedStudent) => {
    if (confirm(`Delete ${student.name}?`)) {
      deleteMutation.mutate(student.id);
    }
  };

  const resetForm = () => {
    setFormData(initialFormState);
    setEditingStudent(null);
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Student Management</h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingStudent(null);
            setFormData(initialFormState);
          }}
          className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors hover-glow"
        >
          <Plus className="h-5 w-5" />
          <span>Add Student</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
          placeholder="Search students by name, roll, or email..."
        />
      </div>

      {showForm && (
        <div className="rounded-lg p-6 glass hover-glow">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {editingStudent ? 'Edit Student' : 'Add New Student'}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                required
              />
            </div>
            {!editingStudent && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Temporary Password
                  </label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                    placeholder="Default: same as roll number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Roll Number
                  </label>
                  <input
                    type="text"
                    value={formData.rollNo}
                    onChange={(e) => setFormData({ ...formData, rollNo: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                    required
                  />
                </div>
              </>
            )}
            {editingStudent && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">
                  Roll Number
                </label>
                <input
                  type="text"
                  value={formData.rollNo}
                  disabled
                  className="w-full px-3 py-2 border rounded-lg bg-muted text-muted-foreground"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Department
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Year
              </label>
              <select
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
              >
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex justify-end space-x-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors hover-glow"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingStudent ? 'Update Student' : 'Add Student'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-lg shadow overflow-hidden glass hover-glow">
        <div className="px-6 py-4 border-b border-border/50">
          <h3 className="text-lg font-semibold text-foreground">
            Students ({filteredStudents.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Student
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Year
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Attendance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    Loading students...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No students found.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {student.name.charAt(0)}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-foreground">
                            {student.name}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            {student.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-foreground">{student.department}</div>
                      <div className="text-sm text-muted-foreground">ID: {student.rollNo}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-foreground">{student.year}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-sm">
                            <span
                              className={`font-medium ${
                                student.attendancePercentage >= 75 ? 'text-green-500' : 'text-red-500'
                              }`}
                            >
                              {student.attendancePercentage}%
                            </span>
                            <span className="text-muted-foreground">
                              {student.presentDays}/{student.totalDays}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 mt-1">
                            <div
                              className={`h-2 rounded-full ${
                                student.attendancePercentage >= 75 ? 'bg-green-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${student.attendancePercentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(student)}
                          className="text-primary hover:text-primary/80 p-1"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(student)}
                          className="text-red-500 hover:text-red-600 p-1"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

