/// Sprint M3 — Référence Mongo polymorphe.
///
/// Problème : selon l'endpoint, le backend renvoie `transport.vehicule` soit
/// comme une `String` (id), soit comme un `Map` (objet populé via Mongoose).
/// Idem pour `chauffeur`, `patient`, etc.
///
/// Solution : un wrapper qui mémorise l'id ET optionnellement l'objet typé
/// si peuplé. L'UI peut toujours lire `.id` sans crash, et `.populated` quand
/// dispo (chemin "détail").
///
/// Usage type :
/// ```dart
/// @PopulatedRefConverter()
/// PopulatedRef<Vehicle>? vehicule,
/// ```
/// L'app fournit le `JsonConverter` paramétré par le type peuplé attendu (cf.
/// `Transport` ci-après).
library;

/// Wrapper polymorphe : soit on a uniquement l'id, soit on a l'objet peuplé.
class PopulatedRef<T> {
  final String id;
  final T? populated;

  const PopulatedRef({required this.id, this.populated});

  factory PopulatedRef.idOnly(String id) => PopulatedRef(id: id);
  factory PopulatedRef.populated(String id, T value) =>
      PopulatedRef(id: id, populated: value);

  bool get isPopulated => populated != null;

  @override
  String toString() => 'PopulatedRef<$T>(id=$id, populated=${populated != null})';
}

/// Converter générique. Les modèles freezed l'instancient avec un parseur
/// concret pour le type peuplé (ex. `Vehicle.fromJson`).
///
/// Exemple d'implémentation dans `transport.dart` :
/// ```dart
/// class VehiculePopulatedRefConverter
///     implements JsonConverter<PopulatedRef<Vehicle>?, Object?> {
///   const VehiculePopulatedRefConverter();
///   @override
///   PopulatedRef<Vehicle>? fromJson(Object? json) {
///     if (json == null) return null;
///     if (json is String) return PopulatedRef.idOnly(json);
///     if (json is Map<String, dynamic>) {
///       final id = (json['_id'] ?? json['id'])?.toString() ?? '';
///       return PopulatedRef.populated(id, Vehicle.fromJson(json));
///     }
///     return null;
///   }
///   @override
///   Object? toJson(PopulatedRef<Vehicle>? value) {
///     if (value == null) return null;
///     return value.populated != null
///         ? (value.populated as dynamic).toJson()
///         : value.id;
///   }
/// }
/// ```
class _PopulatedRefDoc {
  const _PopulatedRefDoc();
}
const populatedRefConverterUsage = _PopulatedRefDoc();
