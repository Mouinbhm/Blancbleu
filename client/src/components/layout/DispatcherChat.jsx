/**
 * DispatcherChat — panneau de messagerie flottant dispatcher ↔ chauffeur.
 * Émet  : message:dispatcher { text, driverId }
 * Écoute: message:driver { from, fromNom, text, timestamp }
 *
 * Notifications style Facebook :
 *   - Toast bas-droite (slide-in) avec nom + aperçu + avatar
 *   - Badge rouge sur le bouton flottant
 *   - Titre de l'onglet "(N) Nouveau message – Blanc Bleu"
 *   - Son discret via Web Audio API
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { getSocket } from "../../services/socketClient";

// ── Son de notification (ding léger via Web Audio API) ────────────────────────
function jouerSon() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) { /* silencieux si AudioContext non disponible */ }
}

// ── Composant Toast individuel ────────────────────────────────────────────────
function MessageToast({ toast, onClose, getDriverName }) {
  const [visible, setVisible] = useState(false);

  // Slide-in au montage
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  const nomAffiche = getDriverName(toast.from) || toast.fromNom?.trim() || "Chauffeur";
  const initiales  = nomAffiche
    .split(" ")
    .map((w) => w[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      style={{
        transform:  visible ? "translateX(0)" : "translateX(110%)",
        transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        borderLeft: "4px solid #1A56DB",
      }}
      className="w-72 bg-white rounded-xl shadow-2xl flex items-start gap-3 px-4 py-3 pointer-events-auto"
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-primary font-bold text-sm">
        {initiales || "?"}
      </div>

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-navy truncate">{nomAffiche}</p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{toast.text}</p>
        <p className="text-[10px] text-slate-400 mt-1">
          {new Date(toast.timestamp || Date.now()).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* Bouton fermer */}
      <button
        onClick={onClose}
        className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
        aria-label="Fermer"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>close</span>
      </button>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function DispatcherChat({ drivers = [] }) {
  const [open,             setOpen]             = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [messages,         setMessages]         = useState([]);
  const [input,            setInput]            = useState("");
  const [unread,           setUnread]           = useState(0);
  const [toasts,           setToasts]           = useState([]); // notifications Facebook
  const endRef       = useRef(null);
  const titreOrigRef = useRef(document.title);  // mémorise le titre original

  // Résolution du nom d'un chauffeur depuis la liste active
  const getDriverName = useCallback((driverId) => {
    const d = drivers.find(
      (dr) => dr.driverId === driverId || dr.driverId === String(driverId)
    );
    return d?.driverName || d?.driverNom || null;
  }, [drivers]);

  // Supprime un toast par son id
  const fermerToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Écoute des messages entrants ──────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    const handler = (data) => {
      setMessages((prev) => [...prev, { ...data, direction: "in" }]);

      // Notification si le panneau est fermé OU si c'est un autre chauffeur
      const afficherNotif = !open || data.from !== selectedDriverId;

      if (afficherNotif) {
        // 1. Badge + titre en un seul setState
        setUnread((n) => {
          const nb = n + 1;
          document.title = `(${nb}) Nouveau message – Blanc Bleu`;
          return nb;
        });

        // 2. Toast Facebook (max 3 simultanés)
        const id = Date.now();
        setToasts((prev) => [{ ...data, id }, ...prev.slice(0, 2)]);
        setTimeout(() => fermerToast(id), 5000);

        // 3. Son
        jouerSon();
      }
    };

    socket.on("message:driver", handler);
    return () => socket.off("message:driver", handler);
  }, [open, selectedDriverId, fermerToast]);

  // Défile vers le bas quand les messages changent
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Réinitialise badge + titre + toasts quand le panneau s'ouvre
  useEffect(() => {
    if (open) {
      setUnread(0);
      setToasts([]);
      document.title = titreOrigRef.current;
    }
  }, [open]);

  // ── Envoi d'un message ────────────────────────────────────────────────────
  const send = useCallback(() => {
    if (!input.trim() || !selectedDriverId) return;
    const socket = getSocket();
    socket.emit("message:dispatcher", { text: input.trim(), driverId: selectedDriverId });
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
      {/* ── Toasts Facebook (colonne bas-droite, au-dessus du bouton) ─────── */}
      <div className="fixed bottom-24 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((toast) => (
          <MessageToast
            key={toast.id}
            toast={toast}
            getDriverName={getDriverName}
            onClose={() => fermerToast(toast.id)}
          />
        ))}
      </div>

      {/* ── Bouton flottant avec badge ────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-[9998] w-14 h-14 rounded-full bg-navy shadow-xl flex items-center justify-center hover:bg-primary transition-colors"
        title="Messagerie chauffeurs"
      >
        <span className="material-symbols-outlined text-white" style={{ fontSize: "24px" }}>
          forum
        </span>
        {unread > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center animate-bounce">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* ── Panneau de chat ───────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-[9998] w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: "420px" }}
        >
          {/* En-tête */}
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

          {/* Sélecteur de chauffeur */}
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

          {/* Liste des messages */}
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
                    {m.direction === "in" && (
                      <p className="font-bold text-primary mb-0.5 text-xs">
                        {getDriverName(m.from) || m.fromNom?.trim() || "Chauffeur"}
                      </p>
                    )}
                    <p>{m.text}</p>
                    <p
                      className={`text-right mt-0.5 ${
                        m.direction === "out" ? "text-white/60" : "text-slate-400"
                      }`}
                      style={{ fontSize: "10px" }}
                    >
                      {new Date(m.timestamp).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          {/* Zone de saisie */}
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
