import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Network, Scale, Bot, Settings as SettingsIcon, Sparkles, Upload, ShieldAlert, History } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Graph Explorer", url: "/graph", icon: Network },
  { title: "Reconciliation", url: "/reconciliation", icon: Scale },
  { title: "Upload Data", url: "/upload", icon: Upload },
  { title: "Vendor Risk", url: "/vendors", icon: ShieldAlert },
  { title: "Audit Trails", url: "/audit", icon: History },
  { title: "AI Assistant", url: "/assistant", icon: Bot },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent>
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center glow-ring">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">GSTNexus</div>
              <div className="text-[10px] text-muted-foreground">Knowledge Graph GST</div>
            </div>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink to={item.url} className={`flex items-center gap-3 ${active ? "text-primary" : ""}`}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}