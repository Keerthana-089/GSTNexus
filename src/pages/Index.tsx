import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Network, Scale, Bot, Sparkles, ArrowRight } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground" style={{ backgroundImage: "var(--gradient-hero)" }}>
      <nav className="flex items-center justify-between px-6 md:px-12 py-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center glow-ring">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <span className="font-bold tracking-tight text-lg">GSTNexus</span>
        </div>
        <Link to="/login"><Button variant="outline">Login</Button></Link>
      </nav>

      <header className="max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-muted-foreground mb-6">
          <span className="h-2 w-2 rounded-full bg-success" /> Knowledge Graph powered
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
          Intelligent <span className="text-primary">GST Reconciliation</span>
        </h1>
        <p className="text-muted-foreground mt-5 text-lg max-w-2xl mx-auto">
          Detect circular trades, validate ITC, and reconcile returns using Knowledge Graphs.
        </p>
        <Link to="/register">
          <Button size="lg" className="mt-8 px-7">
            Get Started <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </header>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-5">
        {[
          { icon: Network, title: "Graph Explorer", desc: "Visualize taxpayer networks and spot circular trade chains instantly." },
          { icon: Scale, title: "ITC Validation", desc: "Match GSTR-2B with purchase data and surface ITC at risk." },
          { icon: Bot, title: "AI Assistant", desc: "Ask GST-specific questions and get practical, India-focused guidance." },
        ].map((f) => (
          <div key={f.title} className="glass rounded-xl p-6">
            <f.icon className="h-6 w-6 text-primary mb-4" />
            <h3 className="font-semibold mb-1">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
};

export default Index;
