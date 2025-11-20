import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Mail, Lock, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export default function AuthDialog({ open, onOpenChange, onAuthSuccess }: AuthDialogProps) {
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
  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSignUp) {
      // Basic validation
      if (!formData.name || !formData.email || !formData.password || !formData.role) {
        toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
        return;
      }

      if (formData.role === "admin") {
        const expected = import.meta.env.VITE_ADMIN_PASSKEY || "ADMIN-1234";
        if (!formData.adminPasskey || formData.adminPasskey !== expected) {
          toast({ title: "Invalid Passkey", description: "Admin passkey is incorrect.", variant: "destructive" });
          return;
        }
      }

      if (formData.role === "student") {
        if (!formData.rollNo || !formData.department || !formData.year) {
          toast({ title: "Missing Info", description: "Please fill student fields", variant: "destructive" });
          return;
        }
      }

      const result = await register(
        formData.email,
        formData.password,
        formData.name,
        formData.role,
        formData.rollNo,
        formData.department,
        formData.year
      );

      if ("error" in result) {
        toast({ title: "Registration Failed", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: "Success!", description: "Account created successfully." });
      onAuthSuccess(result.user);
      onOpenChange(false);

      // ✅ Redirect to student analytics if student
      if (result.user.role === "student") navigate("/student-analytics");

    } else {
      // Login
      if (!formData.email || !formData.password) {
        toast({ title: "Error", description: "Enter email & password", variant: "destructive" });
        return;
      }

      const result = await login(formData.email, formData.password);
      if ("error" in result) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: "Welcome!", description: `Signed in as ${result.user.role}` });
      onAuthSuccess(result.user);
      onOpenChange(false);

      if (result.user.role === "student") navigate("/student-analytics");
    }
  };

  const resetForm = () => {
    setFormData({ name: "", email: "", password: "", role: "", rollNo: "", department: "", year: "", adminPasskey: "" });
  };

  const toggleMode = () => { setIsSignUp(!isSignUp); resetForm(); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-full rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <UserCheck className="h-5 w-5 text-primary" />
            <span>{isSignUp ? "Join Attendo" : "Welcome Back"}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input type="text" name="name" placeholder="Full Name" value={formData.name} onChange={handleInputChange} className="pl-10" required />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleInputChange} className="pl-10" required />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input type="password" name="password" placeholder="Password" value={formData.password} onChange={handleInputChange} className="pl-10" required />
          </div>

          {isSignUp && (
            <Select value={formData.role} onValueChange={(value) => handleChange("role", value as "admin" | "student")}>
              <SelectTrigger><SelectValue placeholder="Select Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          )}

          {isSignUp && formData.role === "student" && (
            <>
              <Input type="text" name="rollNo" placeholder="Roll Number" value={formData.rollNo} onChange={handleInputChange} required />
              <Select value={formData.department} onValueChange={(value) => handleChange("department", value)}>
                <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Computer Science">Computer Science</SelectItem>
                  <SelectItem value="Information Technology">Information Technology</SelectItem>
                  <SelectItem value="Civil Engineering">Civil Engineering</SelectItem>
                  <SelectItem value="Mechanical Engineering">Mechanical Engineering</SelectItem>
                </SelectContent>
              </Select>
              <Select value={formData.year} onValueChange={(value) => handleChange("year", value)}>
                <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1st year">1st Year</SelectItem>
                  <SelectItem value="2nd year">2nd Year</SelectItem>
                  <SelectItem value="3rd year">3rd Year</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {isSignUp && formData.role === "admin" && (
            <Input type="password" name="adminPasskey" placeholder="Admin Passkey" value={formData.adminPasskey} onChange={handleInputChange} required />
          )}

          <Button type="submit" className="w-full" size="lg">{isSignUp ? "Create Account" : "Sign In"}</Button>
        </form>

        <div className="mt-4 text-center text-sm">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={toggleMode} className="text-primary hover:underline font-medium">{isSignUp ? "Sign In" : "Sign Up"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
