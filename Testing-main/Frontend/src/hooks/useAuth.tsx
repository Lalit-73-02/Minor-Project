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
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<{ user: User } | { error: string }>;
  register: (
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'student',
    rollNo?: string,
    department?: string,
    year?: string
  ) => Promise<{ user: User } | { error: string }>;
  logout: () => void;
  loading: boolean;
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

  const login = async (email: string, password: string) => {
    try {
      const data = await apiFetch<{ user: User; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      setUser(data.user);
      setAuthToken(data.token ?? null);
      return { user: data.user };
    } catch (error: any) {
      return { error: error.message || 'Login failed' };
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'student',
    rollNo?: string,
    department?: string,
    year?: string
  ) => {
    try {
      const data = await apiFetch<{ user: User; token?: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, role, rollNo, department, year }),
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
    apiFetch('/api/auth/logout', { method: 'POST', skipJson: true }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
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
