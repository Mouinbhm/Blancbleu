import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:signature/signature.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/theme/app_theme.dart';

class SignatureScreen extends StatefulWidget {
  final String transportId;
  const SignatureScreen({super.key, required this.transportId});
  @override
  State<SignatureScreen> createState() => _SignatureScreenState();
}

class _SignatureScreenState extends State<SignatureScreen> {
  final _patientCtrl = SignatureController(penStrokeWidth: 3, penColor: Colors.black);
  final _driverCtrl  = SignatureController(penStrokeWidth: 3, penColor: Colors.black);
  bool _saving = false;

  // Export at fixed 800×240 px — enough detail for a legal signature,
  // caps the base64 payload to ~150 KB regardless of device DPI.
  static const _sigW = 800;
  static const _sigH = 240;

  Future<void> _save() async {
    final patBytes = await _patientCtrl.toPngBytes(width: _sigW, height: _sigH);
    final drvBytes = await _driverCtrl.toPngBytes(width: _sigW, height: _sigH);
    if (patBytes == null && drvBytes == null) return;

    setState(() => _saving = true);
    try {
      await ApiClient.instance.saveSignature(
        widget.transportId,
        patient: patBytes != null ? base64Encode(patBytes) : null,
        driver:  drvBytes != null ? base64Encode(drvBytes)  : null,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Signatures enregistrées'), backgroundColor: AppTheme.success));
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _patientCtrl.dispose();
    _driverCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Signatures')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _canvasCard('Signature du patient', _patientCtrl),
            const SizedBox(height: 16),
            _canvasCard('Signature du chauffeur', _driverCtrl),
            const SizedBox(height: 24),
            ElevatedButton(onPressed: _saving ? null : _save, child: _saving ? const Text('Enregistrement...') : const Text('Confirmer les signatures')),
          ],
        ),
      ),
    );
  }

  Widget _canvasCard(String title, SignatureController ctrl) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
          TextButton.icon(onPressed: ctrl.clear, icon: const Icon(Icons.refresh, size: 16), label: const Text('Effacer')),
        ],
      ),
      const SizedBox(height: 8),
      Container(
        decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(12), color: Colors.white),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Signature(controller: ctrl, height: 180, backgroundColor: Colors.white),
        ),
      ),
    ],
  );
}
