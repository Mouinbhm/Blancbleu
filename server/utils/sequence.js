/**
 * BlancBleu — Numérotation métier atomique (FAC-…, TRS-…, PAT-…, PMT-…)
 *
 * Le compteur Counter ($inc + upsert) garantit l'unicité tant qu'il reste en
 * avance sur la base. Il peut dériver — restauration partielle, import de
 * documents déjà numérotés, collection `counters` vidée — et alors regénérer un
 * numéro déjà pris (E11000 sur l'index unique au moment du save).
 *
 * On vérifie donc le numéro alloué : en cas de collision on resynchronise le
 * compteur sur le max réellement présent en base, puis on retente.
 */
const Counter = require("../models/Counter");

const MAX_TENTATIVES = 5;

/**
 * Recale Counter.seq sur le plus grand suffixe numérique déjà utilisé.
 * `$max` est atomique : deux instances qui recalent en parallèle convergent.
 *
 * @returns {Promise<number>} le max trouvé en base
 */
async function resyncCounter(Model, { counterId, field, prefix }) {
  const rows = await Model.aggregate([
    { $match: { [field]: { $regex: `^${prefix}` } } },
    {
      $project: {
        seq: {
          $convert: {
            input: { $arrayElemAt: [{ $split: [`$${field}`, "-"] }, -1] },
            to: "int",
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
    { $group: { _id: null, max: { $max: "$seq" } } },
  ]);

  const max = rows[0]?.max || 0;
  await Counter.updateOne({ _id: counterId }, { $max: { seq: max } }, { upsert: true });
  return max;
}

/**
 * Alloue le prochain numéro unique pour un modèle.
 *
 * @param {import("mongoose").Model} Model  modèle cible (`this.constructor` dans un hook)
 * @param {object}   opts
 * @param {string}   opts.counterId  _id du document Counter (ex. "facture")
 * @param {string}   opts.prefix     préfixe commun à tous les numéros (ex. "FAC-")
 * @param {function} opts.build      (seq) => numéro complet
 * @param {string}  [opts.field]     champ portant le numéro (défaut : "numero")
 */
async function nextNumero(Model, { counterId, prefix, build, field = "numero" }) {
  for (let tentative = 0; tentative < MAX_TENTATIVES; tentative++) {
    const counter = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const numero = build(counter.seq);

    // Lecture couverte par l'index unique → coût négligeable.
    if (!(await Model.exists({ [field]: numero }))) return numero;

    // Compteur en retard : on le recale au-delà de tout numéro existant.
    // Le $inc de la tentative suivante produit donc un suffixe inédit.
    await resyncCounter(Model, { counterId, field, prefix });
  }

  throw new Error(`Numérotation ${prefix} impossible : ${MAX_TENTATIVES} collisions consécutives`);
}

module.exports = { nextNumero, resyncCounter };
