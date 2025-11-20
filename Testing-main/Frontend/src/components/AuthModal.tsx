import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Mail, Lock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: any) => void;
}

interface FormData {
  name: string;
  email: string;
  password: string;
  role: "admin" | "student" | "";
  rollNo?: string;
  department?: string;
  year?: string;
  adminPasskey?: string;
}

export default function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
}: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    password: "",
    role: "",
    rollNo: "",
    department: "",
    year: "",
    adminPasskey: "",
  });

  const { toast } = useToast();
  const { login, register } = useAuth();

  // ✅ Escape key se bhi close hoga (optional)
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Gmail check
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(formData.email)) {
      toast({
        title: "Invalid Email",
        description: "Only Gmail addresses are allowed.",
        variant: "destructive",
      });
      return;
    }

    if (isSignUp) {
      if (!formData.name || !formData.email || !formData.password || !formData.role) {
        toast({
          title: "Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }

      if (formData.role === "admin") {
        const expected = import.meta.env.VITE_ADMIN_PASSKEY || "ADMIN-1234";
        if (!formData.adminPasskey || formData.adminPasskey !== expected) {
          toast({
            title: "Invalid Passkey",
            description: "Admin passkey is incorrect.",
            variant: "destructive",
          });
          return;
        }
      }

      if (formData.role === "student") {
        if (!formData.rollNo || !formData.department || !formData.year) {
          toast({
            title: "Missing Information",
            description: "Please fill in all student fields (Roll Number, Department, Year).",
            variant: "destructive",
          });
          return;
        }
      }

      const result = await register(
        formData.email,
        formData.password,
        formData.name,
        formData.role as "admin" | "student",
        formData.rollNo,
        formData.department,
        formData.year
      );

      if ("error" in result) {
        toast({
          title: "Registration Failed",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success!",
        description: "Account created successfully.",
      });
      onAuthSuccess(result.user);
      onClose();
    } else {
      if (!formData.email || !formData.password) {
        toast({
          title: "Error",
          description: "Please enter email and password",
          variant: "destructive",
        });
        return;
      }

      const result = await login(formData.email, formData.password);
      if ("error" in result) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Welcome!",
        description: `Signed in as ${result.user.role}`,
      });
      onAuthSuccess(result.user);
      onClose();
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "",
      rollNo: "",
      department: "",
      year: "",
      adminPasskey: "",
    });
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    resetForm();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="glass p-6 md:p-8 rounded-2xl w-full max-w-md"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <UserCheck className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold">
                  {isSignUp ? "Join Attendo" : "Welcome Back"}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose} // ❌ ab sirf X button se band hoga
                className="hover-glow"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="text"
                      name="name"
                      placeholder="Full Name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="pl-10"
                      required={isSignUp}
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="email"
                    name="email"
                    placeholder="Email Address"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="password"
                    name="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Role Selection */}
              {isSignUp && (
                <div className="space-y-2">
                  <Select
                    value={formData.role}
                    onValueChange={(value) =>
                      handleChange("role", value as "admin" | "student")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Student Fields */}
              {isSignUp && formData.role === "student" && (
                <>
                  <Input
                    type="text"
                    name="rollNo"
                    placeholder="Roll Number"
                    value={formData.rollNo}
                    onChange={handleInputChange}
                    required
                  />

                  <Select
                    value={formData.department}
                    onValueChange={(value) => handleChange("department", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Computer Science">
                        Computer Science
                      </SelectItem>
                      <SelectItem value="Information Technology">
                        Information Technology
                      </SelectItem>
                      <SelectItem value="Civil Engineering">
                        Civil Engineering
                      </SelectItem>
                      <SelectItem value="Chemical Engineering">
                        Chemical Engineering
                      </SelectItem>
                      <SelectItem value="Electronics Engineering">
                        Electronics Engineering
                      </SelectItem>
                      <SelectItem value="Electrical Engineering">
                        Electrical Engineering
                      </SelectItem>
                      <SelectItem value="Pharmacy">Pharmacy</SelectItem>
                      <SelectItem value="Mechanical Engineering">
                        Mechanical Engineering
                      </SelectItem>
                      <SelectItem value="Agriculture Engineering">
                        Agriculture Engineering
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={formData.year}
                    onValueChange={(value) => handleChange("year", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1st year">1st Year</SelectItem>
                      <SelectItem value="2nd year">2nd Year</SelectItem>
                      <SelectItem value="3rd year">3rd Year</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}

              {/* Admin Field */}
              {isSignUp && formData.role === "admin" && (
                <Input
                  type="password"
                  name="adminPasskey"
                  placeholder="Enter Admin Passkey"
                  value={formData.adminPasskey}
                  onChange={handleInputChange}
                />
              )}

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                size="lg"
              >
                {isSignUp ? "Create Account" : "Sign In"}
              </Button>
            </form>

            {/* Toggle */}
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                {isSignUp
                  ? "Already have an account?"
                  : "Don't have an account?"}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="ml-2 text-primary hover:underline font-medium"
                >
                  {isSignUp ? "Sign In" : "Sign Up"}
                </button>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
