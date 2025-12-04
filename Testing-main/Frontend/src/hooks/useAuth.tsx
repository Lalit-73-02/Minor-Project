import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, setAuthToken } from '@/lib/api';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'student';
  name: string;
  rollNo?: string;
  department?: string;
  year?: string;
  studentId?: string;
  referencePhoto?: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  login: (emailOrStudentId: string, password: string, isStudentId?: boolean) => Promise<{ user: User; needsReferencePhoto?: boolean } | { error: string }>;
  register: (
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'student',
    rollNo?: string,
    department?: string,
    year?: string,
    referencePhoto?: string
  ) => Promise<{ user: User } | { error: string }>;
  logout: () => void;
  loading: boolean;
  saveReferencePhoto: (photo: string) => Promise<{ success: boolean } | { error: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await apiFetch<{ user: User; token?: string }>('/api/auth/me');
        setUser(data.user);
        setAuthToken(data.token ?? null);
      } catch {
        setUser(null);
        setAuthToken(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const login = async (emailOrStudentId: string, password: string, isStudentId: boolean = false) => {
    try {
      const body = isStudentId
        ? { student_id: emailOrStudentId, password }
        : { email: emailOrStudentId, password };

      const data = await apiFetch<{ user: User; token?: string; needsReferencePhoto?: boolean }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setUser(data.user);
      setAuthToken(data.token ?? null);
      return { user: data.user, needsReferencePhoto: data.needsReferencePhoto || false };
    } catch (error: any) {
      return { error: error.message || 'Login failed' };
    }
  };

  const saveReferencePhoto = async (photo: string) => {
    try {
      await apiFetch('/api/auth/save-reference-photo', {
        method: 'POST',
        body: JSON.stringify({ photo }),
      });
      return { success: true };
    } catch (error: any) {
      return { error: error.message || 'Failed to save reference photo' };
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'student',
    rollNo?: string,
    department?: string,
    year?: string,
    referencePhoto?: string
  ) => {
    try {
      const data = await apiFetch<{ user: User; token?: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, role, rollNo, department, year, referencePhoto }),
      });

      setUser(data.user);
      setAuthToken(data.token ?? null);
      return { user: data.user };
    } catch (error: any) {
      return { error: error.message || 'Registration failed' };
    }
  };

  const logout = () => {
    setUser(null);
    setAuthToken(null);
    apiFetch('/api/auth/logout', { method: 'POST', skipJson: true }).catch(() => { });
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, saveReferencePhoto }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
