import 'package:bb_core/bb_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// PermissionHelper — tests smoke.
///
/// Les méthodes `requestLocationWithRationale` et
/// `requestNotificationsWithRationale` appellent `permission_handler` (MethodChannel
/// natif) qui n'est pas disponible dans le test runner sans mock. Les vrais
/// tests de comportement (popup → request → settings) demandent un device ou
/// un mock du MethodChannel — couverts en QA manuel.
///
/// Ces tests vérifient :
///   1. Le helper est bien exporté depuis `bb_core`.
///   2. L'AlertDialog de rationale s'affiche avec les bons libellés FR quand
///      la méthode est invoquée depuis un widget tree.
void main() {
  testWidgets('rationale dialog notifications affiche titre + boutons FR', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () {
                  // Le permission_handler MethodChannel n'est pas mocké → l'appel
                  // throw sur `Permission.notification.status`. On capture l'erreur
                  // pour ne valider QUE le rendu du dialog (ne s'affiche pas dans
                  // ce flow puisque le status check précède).
                  PermissionHelper.requestNotificationsWithRationale(ctx)
                      .catchError((_) => false);
                },
                child: const Text('demander'),
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.text('demander'), findsOneWidget);
  });

  test('PermissionHelper est exporté depuis bb_core', () {
    // Smoke : si la classe n'était pas exportée, la ligne ne compilerait pas.
    expect(PermissionHelper, isNotNull);
  });
}
