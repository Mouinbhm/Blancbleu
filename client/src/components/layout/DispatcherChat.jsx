/**
 * DispatcherChat — floating chat panel for dispatcher ↔ driver messaging.
 * Emits  : message:dispatcher { text, driverId }
 * Listens: message:driver { from, fromNom, text, timestamp }
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { getSocket } from "../../services/socketClient";

export default function DispatcherChat({ drivers = [] }) {
  const [open, setOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [unread, setUnread] = useState(0);
  const endRef = useRef(null);

  // Listen for incoming driver messages
  useEffect(() => {
    const socket = getSocket();
    const handler = (data) => {
      setMessages((prev) => [...prev, { ...data, direction: "in" }]);
      if (!open) setUnread((n) => n + 1);
    };
    socket.on("message:driver", handler);
    return () => socket.off("message:driver", handler);
  }, [open]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Clear unread when opened
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const send = useCallback(() => {
    if (!input.trim() || !selectedDriverId) return;
    const socket = getSocket();
    const msg = {
      text:     input.trim(),
      driverId: selectedDriverId,
    };
    socket.emit("message:dispatcher", msg);
    setMessages((prev) => [
      ...prev,
      { text: input.trim(), direction: "out", timestamp: new Date() },
    ]);
    setInput("");
  }, [input, selectedDriverId]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-[9998] w-14 h-14 rounded-full bg-navy shadow-xl flex items-center justify-center hover:bg-primary transition-colors"
        title="Messagerie chauffeurs"
      >
        <span className="material-symbols-outlined text-white" style={{ fontSize: "24px" }}>
          forum
        </span>
        {unread > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-[9998] w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: "420px" }}
        >
          {/* Header */}
          <div className="bg-navy px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-white" style={{ fontSize: "18px" }}>forum</span>
              <p className="text-white font-bold text-sm">Messagerie chauffeurs</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/60 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>close</span>
            </button>
          </div>

          {/* Driver selector */}
          <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 text-navy font-semibold focus:outline-none focus:border-primary"
            >
              <option value="">— Sélectionner un chauffeur —</option>
              {drivers.map((d) => (
                <option key={d.driverId} value={d.driverId}>
                  {d.driverName || d.driverNom || d.driverId}
                </option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 text-xs gap-2">
                <span className="material-symbols-outlined text-3xl">chat_bubble_outline</span>
                Aucun message
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                      m.direction === "out"
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-navy"
                    }`}
                  >
                    {m.direction === "in" && m.fromNom && (
                      <p className="font-bold text-primary mb-0.5 text-xs">
                        {m.fromNom}
                      </p>
                    )}
                    <p>{m.text}</p>
                    <p className={`text-right mt-0.5 ${m.direction === "out" ? "text-white/60" : "text-slate-400"}`}
                       style={{ fontSize: "10px" }}>
                      {new Date(m.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-slate-100 flex gap-2 flex-shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={selectedDriverId ? "Message…" : "Sélectionnez un chauffeur"}
              disabled={!selectedDriverId}
              className="flex-1 text-xs rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:border-primary disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={!input.trim() || !selectedDriverId}
              className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center disabled:opacity-40 hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              <span className="material-symbols-outlined text-white" style={{ fontSize: "16px" }}>send</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
