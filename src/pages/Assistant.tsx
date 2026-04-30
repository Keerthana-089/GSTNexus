import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gst-chat`;

const QUICK = ["What is ITC?", "Explain GSTR-2B", "How to fix circular trade?"];

const GST_TERMS = /\b(GSTR-?[12][AB]?|GSTR-?3B|GSTIN|ITC|HSN|SAC|IGST|CGST|SGST|UTGST|TDS|TCS|RCM|GSTN|CIN)\b/g;

function Highlighted({ text }: { text: string }) {
  const parts = text.split(GST_TERMS);
  return <>{parts.map((p, i) => GST_TERMS.test(p) ? <span key={i} className="text-primary font-semibold">{p}</span> : <span key={i}>{p}</span>)}</>;
}

const INITIAL: Msg[] = [{ role: "assistant", content: "Hi! I'm your GST assistant. Ask me anything about ITC, GSTR returns, reconciliation or compliance." }];

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>(INITIAL);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: [...messages, userMsg].filter(m => m.role !== "assistant" || messages.indexOf(m) > 0).map(m => ({ role: m.role, content: m.content })) }),
      });
      if (resp.status === 429) { toast.error("Rate limit hit, please wait a moment."); setLoading(false); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted. Add funds in Workspace settings."); setLoading(false); return; }
      if (!resp.ok || !resp.body) throw new Error("Failed");

      setMessages((p) => [...p, { role: "assistant", content: "" }]);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              setMessages((p) => p.map((m, i) => i === p.length - 1 ? { ...m, content: acc } : m));
            }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }
    } catch (e: any) {
      toast.error(e.message ?? "Chat failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center"><Bot className="h-5 w-5 text-primary" /></div>
        <div className="flex-1">
          <h2 className="font-bold">GST AI Assistant</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Online
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setMessages(INITIAL); toast.success("Chat cleared"); }}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-3xl mx-auto w-full">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-card border border-border rounded-bl-sm"
            }`}>
              {m.content
                ? (m.role === "assistant" ? <Highlighted text={m.content} /> : m.content)
                : <span className="inline-flex gap-1 items-center"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" /><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" /><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" /></span>}
            </div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl px-4 py-2.5">
              <span className="inline-flex gap-1 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-4 max-w-3xl mx-auto w-full">
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK.map((q) => (
            <button key={q} onClick={() => send(q)} disabled={loading}
              className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-secondary transition disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about GST, ITC, GSTR returns…" disabled={loading} />
          <Button type="submit" disabled={loading || !input.trim()}><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}