/**
 * BlancBleu — Service Métier Equipements
 * Toute la logique métier centralisée ici
 */
const Equipement = require("../models/Equipement");
const Unit = require("../models/Unit");

// Seuils d'alerte
const SEUILS = {
  EXPIRATION_BIENTOT_JOURS: 30, // alerter 30j avant expiration
  CONTROLE_BIENTOT_JOURS: 14, // alerter 14j avant contrôle
};

// ══════════════════════════════════════════════════════════════════════════
// CRÉATION
// ══════════════════════════════════════════════════════════════════════════
async function creerEquipement(donnees) {
  // Vérifier numéro de série unique si fourni
  if (donnees.numeroSerie) {
    const existe = await Equipement.findOne({
      numeroSerie: donnees.numeroSerie.toUpperCase(),
    });
    if (existe)
      throw {
        status: 409,
        message: `Numéro de série ${donnees.numeroSerie} déjà utilisé`,
      };
  }

  // Vérifier que l'unité existe si fournie
  if (donnees.uniteAssignee) {
    const unite = await Unit.findById(donnees.uniteAssignee);
    if (!unite) throw { status: 404, message: "Unité introuvable" };
    donnees.typeLocalisation = "ambulance";
  }

  const equip = await Equipement.create(donnees);
  return equip.populate("uniteAssignee", "nom type statut");
}

// ══════════════════════════════════════════════════════════════════════════
// MISE À JOUR
// ══════════════════════════════════════════════════════════════════════════
async function mettreAJour(id, donnees) {
  const equip = await Equipement.findById(id);
  if (!equip) throw { status: 404, message: "Équipement introuvable" };

  // Vérifier numéro de série si changé
  if (donnees.numeroSerie && donnees.numeroSerie !== equip.numeroSerie) {
    const existe = await Equipement.findOne({
      numeroSerie: donnees.numeroSerie.toUpperCase(),
      _id: { $ne: id },
    });
    if (existe) throw { status: 409, message: `Numéro de série déjà utilisé` };
  }

  Object.assign(equip, donnees);
  await equip.save();
  return equip.populate("uniteAssignee", "nom type statut");
}

// ══════════════════════════════════════════════════════════════════════════
// AFFECTATION À UNE UNITÉ
// ══════════════════════════════════════════════════════════════════════════
async function affecter(equipementId, uniteId) {
  const [equip, unite] = await Promise.all([
    Equipement.findById(equipementId),
    Unit.findById(uniteId),
  ]);

  if (!equip) throw { status: 404, message: "Équipement introuvable" };
  if (!unite) throw { status: 404, message: "Unité introuvable" };

  // Règle métier : équipement en panne ne peut pas être affecté
  if (equip.etat === "en-panne") {
    throw {
      status: 422,
      message: `Impossible d'affecter un équipement en panne`,
    };
  }
  if (equip.etat === "retiré") {
    throw {
      status: 422,
      message: `Impossible d'affecter un équipement retiré du service`,
    };
  }
  if (equip.estExpire) {
    throw {
      status: 422,
      message: `Impossible d'affecter un équipement expiré`,
    };
  }

  equip.uniteAssignee = uniteId;
  equip.typeLocalisation = "ambulance";
  await equip.save();

  return await equip.populate("uniteAssignee", "nom type statut");
}

// ══════════════════════════════════════════════════════════════════════════
// DÉSAFFECTATION
// ══════════════════════════════════════════════════════════════════════════
async function desaffecter(equipementId) {
  const equip = await Equipement.findById(equipementId);
  if (!equip) throw { status: 404, message: "Équipement introuvable" };

  equip.uniteAssignee = null;
  equip.typeLocalisation = "base";
  await equip.save();

  return equip;
}

// ══════════════════════════════════════════════════════════════════════════
// CHANGEMENT D'ÉTAT
// ══════════════════════════════════════════════════════════════════════════
async function changerEtat(equipementId, nouvelEtat, notes = "") {
  const etatsValides = [
    "opérationnel",
    "en-panne",
    "à-vérifier",
    "retiré",
    "en-réparation",
  ];
  if (!etatsValides.includes(nouvelEtat))
    throw {
      status: 400,
      message: `État invalide. Valides : ${etatsValides.join(", ")}`,
    };

  const equip = await Equipement.findById(equipementId);
  if (!equip) throw { status: 404, message: "Équipement introuvable" };

  const ancienEtat = equip.etat;
  equip.etat = nouvelEtat;

  // Si passage à opérationnel après vérification → mettre à jour date contrôle
  if (nouvelEtat === "opérationnel" && ancienEtat === "à-vérifier") {
    equip.dernierControle = new Date();
    // prochainControle calculé par le pre-save hook
  }

  // Si retiré → désaffecter automatiquement
  if (nouvelEtat === "retiré") {
    equip.uniteAssignee = null;
    equip.typeLocalisation = "dépôt";
    equip.estActif = false;
  }

  if (notes) equip.notes = notes;
  await equip.save();

  return equip.populate("uniteAssignee", "nom type statut");
}

// ══════════════════════════════════════════════════════════════════════════
// DÉTECTION AUTOMATIQUE — Équipements à alerter
// ══════════════════════════════════════════════════════════════════════════
async function detecterAlertes() {
  const maintenant = new Date();
  const dans30Jours = new Date(
    maintenant.getTime() + SEUILS.EXPIRATION_BIENTOT_JOURS * 86400000,
  );
  const dans14Jours = new Date(
    maintenant.getTime() + SEUILS.CONTROLE_BIENTOT_JOURS * 86400000,
  );

  const [expires, expirentBientot, controleRetard, controleBientot, enPanne] =
    await Promise.all([
      // Déjà expirés
      Equipement.find({
        dateExpiration: { $lt: maintenant },
        estActif: true,
      }).populate("uniteAssignee", "nom type"),

      // Expirent dans 30 jours
      Equipement.find({
        dateExpiration: { $gte: maintenant, $lte: dans30Jours },
        estActif: true,
      }).populate("uniteAssignee", "nom type"),

      // Contrôle en retard
      Equipement.find({
        prochainControle: { $lt: maintenant },
        estActif: true,
      }).populate("uniteAssignee", "nom type"),

      // Contrôle à faire dans 14 jours
      Equipement.find({
        prochainControle: { $gte: maintenant, $lte: dans14Jours },
        estActif: true,
      }).populate("uniteAssignee", "nom type"),

      // En panne
      Equipement.find({ etat: "en-panne", estActif: true }).populate(
        "uniteAssignee",
        "nom type",
      ),
    ]);

  return { expires, expirentBientot, controleRetard, controleBientot, enPanne };
}

// ══════════════════════════════════════════════════════════════════════════
// STATISTIQUES
// ══════════════════════════════════════════════════════════════════════════
async function getStats() {
  const maintenant = new Date();
  const dans30Jours = new Date(maintenant.getTime() + 30 * 86400000);

  const [
    total,
    operationnels,
    enPanne,
    aVerifier,
    expires,
    expirentBientot,
    parCategorie,
    parUnite,
  ] = await Promise.all([
    Equipement.countDocuments({ estActif: true }),
    Equipement.countDocuments({ etat: "opérationnel", estActif: true }),
    Equipement.countDocuments({ etat: "en-panne", estActif: true }),
    Equipement.countDocuments({ etat: "à-vérifier", estActif: true }),
    Equipement.countDocuments({
      dateExpiration: { $lt: maintenant },
      estActif: true,
    }),
    Equipement.countDocuments({
      dateExpiration: { $gte: maintenant, $lte: dans30Jours },
      estActif: true,
    }),
    Equipement.aggregate([
      { $match: { estActif: true } },
      {
        $group: {
          _id: "$categorie",
          total: { $sum: 1 },
          operationnels: {
            $sum: { $cond: [{ $eq: ["$etat", "opérationnel"] }, 1, 0] },
          },
        },
      },
      { $sort: { total: -1 } },
    ]),
    Equipement.aggregate([
      { $match: { estActif: true, uniteAssignee: { $ne: null } } },
      { $group: { _id: "$uniteAssignee", count: { $sum: 1 } } },
    ]),
  ]);

  const tauxOperationnel =
    total > 0 ? Math.round((operationnels / total) * 100) : 0;

  return {
    total,
    operationnels,
    enPanne,
    aVerifier,
    expires,
    expirentBientot,
    tauxOperationnel,
    parCategorie,
    nbUnitesCouvertes: parUnite.length,
    alertes: enPanne + aVerifier + expires,
  };
}

module.exports = {
  creerEquipement,
  mettreAJour,
  affecter,
  desaffecter,
  changerEtat,
  detecterAlertes,
  getStats,
};
