class StripeConfig {
  // Remplacer par votre clé publique Stripe (Dashboard → Développeurs → Clés API)
  static const String publishableKey = String.fromEnvironment(
    'STRIPE_PUBLISHABLE_KEY',
    defaultValue: '***STRIPE_KEY_REMOVED***',
  );
}
