import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../services/api";
import { useTransport, useTransportMutation } from "../../hooks/queries/useTransports";
import { Card, Button, Select, Badge, EmptyState } from "../ui";

/**
 * TransportAssignPanel — assignation véhicule + chauffeur depuis le dispatcher.
 *
 * Le refactor Sprint 3 avait retiré tous les boutons lifecycle de la page
 * détail : un transport planifié ne pouvait plus avancer que par une
 * validation auto-dispatch. Ce panneau réexpose le passage
 * SCHEDULED/DRIVER_REJECTED → ASSIGNED, seule porte vers l'app chauffeur.
 *
 * On assigne par SHIFT plutôt que par véhicule seul : un shift actif porte
 * déjà la paire véhicule + chauffeur, et c'est ce couple que le backend
 * attend (assignerVehicule dérive vehiculeId/chauffeurId du shift).
 */

const STATUTS_ASSIGNABLES = ["SCHEDULED", "DRIVER_REJECTED"];

const nomChauffeur = (p) =>
  p && typeof p === "object" ? [p.prenom, p.nom].filter(Boolean).join(" ") : "";

const libelleVehicule = (v) =>
  v && typeof v === "object" ? [v.immatriculation, v.nom].filter(Boolean).join(" — ") : "";

export function TransportAssignPanel({ transportId }) {
  const { data: t } = useTransport(transportId);
  const { transition } = useTransportMutation();
  const [shiftId, setShiftId] = useState("");
  const [erreur, setErreur] = useState(null);

  const assignable = STATUTS_ASSIGNABLES.includes(t?.statut);

  const { data: shiftsData, isLoading } = useQuery({
    queryKey: ["shifts", "active"],
    queryFn: () =>
      api.get("/v1/shifts", { params: { status: "ACTIVE", limit: 50 } }).then((r) => r.data),
    enabled: assignable,
  });

  if (!t || !assignable) return null;

  const shifts = shiftsData?.shifts || [];

  const handleAssign = async () => {
    if (!shiftId) return;
    setErreur(null);
    try {
      await transition.mutateAsync({ id: transportId, action: "assigner", body: { shiftId } });
      setShiftId("");
    } catch (e) {
      setErreur(e?.response?.data?.message || "Assignation impossible.");
    }
  };

  return (
    <Card>
      <Card.Header>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
          Assignation
        </h3>
      </Card.Header>
      <Card.Body>
        {isLoading ? (
          <p className="text-sm text-slate-500">Chargement des shifts actifs…</p>
        ) : shifts.length === 0 ? (
          <EmptyState
            title="Aucun shift actif"
            description="Un chauffeur doit avoir démarré son service pour recevoir une mission."
          />
        ) : (
          <div className="space-y-3">
            <Select
              label="Shift à assigner"
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              error={erreur}
            >
              <option value="">Sélectionner un chauffeur en service…</option>
              {shifts.map((s) => (
                <option key={s._id} value={s._id}>
                  {[libelleVehicule(s.vehicleId), nomChauffeur(s.personnelId)]
                    .filter(Boolean)
                    .join(" · ")}
                </option>
              ))}
            </Select>

            {erreur && (
              <p role="alert" className="text-sm text-red-600">
                {erreur}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleAssign} disabled={!shiftId} loading={transition.isPending}>
                Assigner
              </Button>
              <Badge variant="blue">{t.statut}</Badge>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
