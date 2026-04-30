import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const nav = useNavigate();
  const [profile, setProfile] = useState({ name: "", email: "", gstin: "", company: "" });
  const [dark, setDark] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const stored = JSON.parse(localStorage.getItem("gst_profile") || "{}");
      setProfile({ name: stored.name || "", email: data.user?.email || "", gstin: stored.gstin || "", company: stored.company || "" });
    });
  }, []);

  const save = () => {
    localStorage.setItem("gst_profile", JSON.stringify(profile));
    toast.success("Profile saved");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    nav("/");
  };

  const toggleTheme = (v: boolean) => {
    setDark(v);
    document.documentElement.classList.toggle("light", !v);
    toast(v ? "Dark mode" : "Light mode (preview)");
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and preferences.</p>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Name</Label><Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={profile.email} disabled /></div>
          <div className="space-y-1.5"><Label>GSTIN</Label><Input value={profile.gstin} onChange={(e) => setProfile({ ...profile, gstin: e.target.value })} placeholder="27AABCU9603R1ZM" /></div>
          <div className="space-y-1.5"><Label>Company</Label><Input value={profile.company} onChange={(e) => setProfile({ ...profile, company: e.target.value })} /></div>
        </div>
        <Button onClick={save}>Save Changes</Button>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Appearance</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Dark mode</div>
            <div className="text-xs text-muted-foreground">GSTNexus is optimized for dark.</div>
          </div>
          <Switch checked={dark} onCheckedChange={toggleTheme} />
        </div>
      </div>

      <div className="glass rounded-xl p-6">
        <Button variant="destructive" onClick={logout}><LogOut className="h-4 w-4 mr-2" />Logout</Button>
      </div>
    </div>
  );
}