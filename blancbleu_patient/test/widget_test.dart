import 'package:flutter_test/flutter_test.dart';
import 'package:blancbleu_patient/main.dart';

void main() {
  testWidgets('LoginScreen smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const BlancBleuApp());
    expect(find.text('Ambulances Blanc Bleu'), findsOneWidget);
    expect(find.text('Se connecter'), findsOneWidget);
  });
}
