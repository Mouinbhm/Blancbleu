/**
 * BlancBleu — Recalcul des factures avec montantTotal = 0
 *
 * Usage :
 *   node server/scripts/fix-factures.js [--dry-run]
 *
 * Options :
 *   --dry-run   Affiche le rapport sans modifier la base de données
 *
 * Idempotent : sans effet de bord si relancé plusieurs fois.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const Facture = require("../models/Facture");
const Transport = require("../models/Transport");
const tarifService = require("../services/tarifService");

const DRY_RUN = process.argv.includes("--dry-run");

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log(`${CYAN}BlancBleu — Recalcul des factures à montantTotal = 0${RESET}`);
  if (DRY_RUN) console.log(`${YELLOW}[DRY-RUN] Aucune modification ne sera effectuée${RESET}`);
  console.log("");

  const factures = await Facture.find({ montantTotal: 0 }).lean();

  if (factures.length === 0) {
    console.log(`${GREEN}Aucune facture à corriger.${RESET}`);
    await mongoose.disconnect();
    return;
  }

  console.log(`${YELLOW}${factures.length} facture(s) avec montantTotal = 0 trouvée(s)${RESET}\n`);

  let ok = 0;
  let erreurs = 0;

  for (const facture of factures) {
    const label = facture.numero || String(facture._id);

    const transport = await Transport.findById(facture.transportId).lean();
    if (!transport) {
      console.log(`${RED}✗ ${label} | Transport introuvable (id: ${facture.transportId})${RESET}`);
      erreurs++;
      continue;
    }

    let tarif;
    try {
      tarif = await tarifService.calculerTarif(transport);
    } catch (err) {
      // Fallback : coordonnées manquantes → distance 10 km par défaut
      try {
        tarif = await tarifService.calculerTarif({
          ...transport,
          adresseDepart: { coordonnees: null },
          adresseDestination: { coordonnees: null },
        });
      } catch (err2) {
        console.log(`${RED}✗ ${label} | Calcul tarifaire impossible : ${err2.message}${RESET}`);
        erreurs++;
        continue;
      }
    }

    const montantBase = Math.round(
      (tarif.bareme.forfait + tarif.bareme.prixKm * tarif.distanceFacturee) * 100,
    ) / 100;
    const majoration = tarif.supplements ?? 0;
    const tauxPriseEnCharge = tarif.tauxPriseEnCharge ?? facture.tauxPriseEnCharge ?? 65;
    const montantTotal = Math.round((montantBase + majoration) * 100) / 100;
    const montantCPAM = Math.round(montantTotal * tauxPriseEnCharge) / 100;
    const montantPatient = Math.round((montantTotal - montantCPAM) * 100) / 100;

    const typeVehicule = transport.typeTransport || facture.typeVehicule || "VSL";
    const distanceKm = tarif.distanceFacturee;

    const rapport =
      `${label} | ${typeVehicule} | ${distanceKm.toFixed(1)} km | ` +
      `${montantTotal.toFixed(2)}€ → CPAM: ${montantCPAM.toFixed(2)}€ | ` +
      `Patient: ${montantPatient.toFixed(2)}€`;

    if (!DRY_RUN) {
      try {
        await Facture.findByIdAndUpdate(facture._id, {
          distanceKm,
          montantBase,
          majoration,
          tauxPriseEnCharge,
          montantTotal,
          montantCPAM,
          montantPatient,
          typeVehicule,
          detailsCalcul: {
            sourceDistance: tarif.sourceDistance,
            bareme: tarif.bareme,
            lignes: tarif.details,
          },
        });
        console.log(`${GREEN}✅ ${rapport}${RESET}`);
        ok++;
      } catch (err) {
        console.log(`${RED}✗ ${label} | Mise à jour échouée : ${err.message}${RESET}`);
        erreurs++;
      }
    } else {
      console.log(`${DIM}[DRY] ${rapport}${RESET}`);
      ok++;
    }
  }

  console.log("");
  console.log(`${DIM}─────────────────────────────────────────────────────${RESET}`);
  if (DRY_RUN) {
    console.log(`${CYAN}DRY-RUN terminé : ${ok} facture(s) seraient corrigées${RESET}`);
  } else {
    console.log(`${GREEN}Terminé : ${ok} corrigée(s)${RESET}${erreurs ? `, ${RED}${erreurs} erreur(s)${RESET}` : ""}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(`${RED}Erreur fatale : ${err.message}${RESET}`);
  process.exit(1);
});
