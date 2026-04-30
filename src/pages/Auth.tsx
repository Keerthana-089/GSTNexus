import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

export default function Auth() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const isRegister = pathname === "/register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Account created — you're in!");
        nav("/dashboard");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        nav("/dashboard");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6"
         style={{ backgroundImage: "var(--gradient-hero)" }}>
      <div className="w-full max-w-md glass rounded-2xl p-8">
        <Link to="/" className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center glow-ring">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <span className="font-bold tracking-tight">GSTNexus</span>
        </Link>
        <h1 className="text-2xl font-bold mb-1">{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {isRegister ? "Start reconciling GST in minutes." : "Sign in to continue."}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isRegister ? "Create account" : "Sign in"}
          </Button>
        </form>
        <div className="mt-6 text-sm text-center text-muted-foreground">
          {isRegister ? (
            <>Already have an account? <Link className="text-primary hover:underline" to="/login">Sign in</Link></>
          ) : (
            <>Don't have an account? <Link className="text-primary hover:underline" to="/register">Register</Link></>
          )}
        </div>
      </div>
    </div>
  );
}