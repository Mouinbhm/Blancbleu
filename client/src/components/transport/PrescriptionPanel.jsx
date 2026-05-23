import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTransportPmt, transportKeys } from "../../hooks/queries/useTransports";
import { transportService } from "../../services/api";
import { Card, Button, Badge, Skeleton, EmptyState } from "../ui";

export function PrescriptionPanel({ transportId }) {
  const { data: pmt, isLoading } = useTransportPmt(transportId);
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);

  const docs = pmt?.documents || [];

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("triggerOcr", "true");
      await transportService.uploadPmt(transportId, fd);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: transportKeys.pmt(transportId) });
    } catch (e) {
      setErr(e.response?.data?.message || "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm("Supprimer ce document PMT ?")) return;
    await transportService.deletePmt(transportId, docId);
    qc.invalidateQueries({ queryKey: transportKeys.pmt(transportId) });
  };

  return (
    <Card>
      <Card.Header>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
          Prescription Médicale de Transport
        </h3>
      </Card.Header>
      <Card.Body>
        <div className="flex items-center gap-3 mb-4">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/*"
            className="text-sm flex-1"
            aria-label="Choisir un fichier PMT"
          />
          <Button size="sm" loading={uploading} onClick={handleUpload}>
            Téléverser
          </Button>
        </div>
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

        {isLoading && <Skeleton className="h-16 w-full" />}

        {!isLoading && docs.length === 0 && (
          <EmptyState
            icon="📄"
            title="Aucun document PMT"
            description="Téléversez un fichier PDF ou image pour déclencher l'OCR."
          />
        )}

        {!isLoading && docs.length > 0 && (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li
                key={d._id}
                className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg"
              >
                <span className="text-slate-400">📎</span>
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-sm text-[#1D6EF5] hover:underline truncate"
                >
                  {d.fileName || d.fileUrl}
                </a>
                <Badge variant={
                  d.ocrStatus === "done" ? "green" :
                  d.ocrStatus === "error" ? "red" :
                  d.ocrStatus === "processing" ? "yellow" : "slate"
                }>
                  {d.ocrStatus || "—"}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(d._id)}>
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card.Body>
    </Card>
  );
}

export default PrescriptionPanel;
