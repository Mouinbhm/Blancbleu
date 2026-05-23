import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTransport, transportKeys } from "../../hooks/queries/useTransports";
import { transportService } from "../../services/api";
import { Card, Input, Button, Badge } from "../ui";

/**
 * SignaturePad — capture du nom du signataire + upload optionnel d'une image.
 * Pas de canvas custom dans ce sprint ; on accepte un fichier image scanné.
 */
export function SignaturePad({ transportId }) {
  const { data: transport } = useTransport(transportId);
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const proofSigned = transport?.proofOfCare?.signed;

  const handleSubmit = async () => {
    if (!name.trim()) { setErr("Nom du signataire requis"); return; }
    setErr(null); setLoading(true);
    try {
      const file = fileRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append("signature", file);
        fd.append("signedByName", name);
        await transportService.addSignatureFile(transportId, fd);
      } else {
        await transportService.addSignature(transportId, { signedByName: name });
      }
      qc.invalidateQueries({ queryKey: transportKeys.detail(transportId) });
      setName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr(e.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
            Signature patient
          </h3>
          {proofSigned && <Badge variant="green">✓ Signé</Badge>}
        </div>
      </Card.Header>
      <Card.Body>
        {proofSigned ? (
          <div className="text-sm text-slate-700">
            <p>
              Signé par <strong>{transport.proofOfCare.signedByName}</strong>
              {transport.proofOfCare.signedAt && (
                <span className="text-slate-500"> · {new Date(transport.proofOfCare.signedAt).toLocaleString("fr-FR")}</span>
              )}
            </p>
            {transport.proofOfCare.signatureImageUrl && (
              <img
                src={transport.proofOfCare.signatureImageUrl}
                alt="Signature patient"
                className="mt-3 max-h-32 border border-slate-200 rounded"
              />
            )}
          </div>
        ) : (
          <>
            <Input
              label="Nom du signataire"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de la personne qui signe"
              error={err}
            />
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Image de signature (optionnel)
              </label>
              <input ref={fileRef} type="file" accept="image/*" className="text-sm" />
            </div>
            <div className="mt-4">
              <Button onClick={handleSubmit} loading={loading} disabled={!name.trim()}>
                Enregistrer la signature
              </Button>
            </div>
          </>
        )}
      </Card.Body>
    </Card>
  );
}

export default SignaturePad;
