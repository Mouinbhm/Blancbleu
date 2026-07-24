"""
BlancBleu — Utilitaires OCR
Conversion PDF/image → texte via Tesseract
"""

import os
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger("blancbleu.ai.ocr")


# ─── Configuration Tesseract (Windows) ───────────────────────────────────────

def configurer_tesseract() -> bool:
    """
    Localise Tesseract sur Windows et configure pytesseract + TESSDATA_PREFIX.
    Vérifie dans cet ordre :
      1. C:\\Program Files\\Tesseract-OCR
      2. C:\\Program Files (x86)\\Tesseract-OCR
      3. C:\\Users\\<utilisateur>\\AppData\\Local\\Programs\\Tesseract-OCR
      4. C:\\Tesseract-OCR
      5. PATH système (where tesseract)
    Retourne True si Tesseract a été trouvé et configuré.
    """
    if os.name != "nt":
        return True  # Linux/Mac : Tesseract est dans le PATH

    import pytesseract

    chemins_candidats = [
        Path(r"C:\Program Files\Tesseract-OCR"),
        Path(r"C:\Program Files (x86)\Tesseract-OCR"),
        Path(os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR")),
        Path(r"C:\Tesseract-OCR"),
    ]

    for dossier in chemins_candidats:
        exe = dossier / "tesseract.exe"
        if exe.exists():
            pytesseract.pytesseract.tesseract_cmd = str(exe)
            tessdata = dossier / "tessdata"
            if tessdata.exists() and not os.environ.get("TESSDATA_PREFIX"):
                os.environ["TESSDATA_PREFIX"] = str(tessdata)
            logger.debug(f"Tesseract trouvé : {exe}")
            return True

    try:
        result = subprocess.run(
            ["where", "tesseract"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            exe = Path(result.stdout.strip().splitlines()[0])
            if exe.exists():
                pytesseract.pytesseract.tesseract_cmd = str(exe)
                tessdata = exe.parent / "tessdata"
                if tessdata.exists() and not os.environ.get("TESSDATA_PREFIX"):
                    os.environ["TESSDATA_PREFIX"] = str(tessdata)
                logger.debug(f"Tesseract trouvé via PATH : {exe}")
                return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    logger.warning(
        "Tesseract OCR introuvable. Installez-le depuis : "
        "https://github.com/UB-Mannheim/tesseract/wiki"
    )
    return False


# Configurer dès l'import du module (effet de bord voulu)
import pytesseract  # noqa: E402
configurer_tesseract()


# ─── Prétraitement image ──────────────────────────────────────────────────────

def ameliorer_image_scan(img):
    """
    Améliore la qualité d'un scan de PMT CERFA avant OCR.
    Pipeline : redimensionner → niveaux de gris →
               contraste → netteté → binarisation Otsu adaptative.
    Compatible PMT standard et formulaires CERFA n°11574 scannés.
    """
    from PIL import Image, ImageFilter, ImageEnhance
    import numpy as np

    # 1. Agrandir si trop petite (OCR meilleur à 300+ DPI)
    largeur, hauteur = img.size
    if largeur < 2000:
        facteur = 2500 / largeur
        img = img.resize(
            (int(largeur * facteur), int(hauteur * facteur)),
            Image.LANCZOS,
        )

    # 2. Niveaux de gris
    img = img.convert("L")

    # 3. Contraste
    img = ImageEnhance.Contrast(img).enhance(2.0)

    # 4. Netteté
    img = ImageEnhance.Sharpness(img).enhance(2.5)
    img = img.filter(ImageFilter.SHARPEN)

    # 5. Binarisation adaptative (seuil Otsu simplifié via numpy)
    arr = np.array(img)
    seuil = arr.mean() - arr.std() * 0.3
    arr = (arr > seuil).astype(np.uint8) * 255
    img = Image.fromarray(arr)

    return img


def preparer_image_ocr(image):
    """Alias vers ameliorer_image_scan() — conservé pour compatibilité."""
    return ameliorer_image_scan(image)


# ─── Conversion PDF → images ──────────────────────────────────────────────────

def pdf_vers_images(pdf_bytes: bytes) -> list:
    """
    Convertit un PDF en liste d'images PIL pour OCR.
    Utilise pymupdf (fitz) en priorité — ne nécessite pas Poppler.
    Fallback sur pdf2image si pymupdf est absent.
    """
    # ── Tentative pymupdf (priorité) ─────────────────────────────────────────
    try:
        import fitz  # pymupdf
        from PIL import Image
        import io

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        mat = fitz.Matrix(300 / 72, 300 / 72)  # 300 DPI pour CERFA scannés

        for numero, page in enumerate(doc):
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            images.append(img)
            logger.debug(f"pymupdf — page {numero + 1} convertie ({pix.width}×{pix.height})")

        doc.close()
        logger.info(f"PDF converti via pymupdf : {len(images)} page(s)")
        return images

    except ImportError:
        logger.debug("pymupdf absent — tentative avec pdf2image")
    except Exception as e:
        logger.warning(f"pymupdf erreur : {e} — tentative avec pdf2image")

    # ── Fallback pdf2image (nécessite Poppler) ────────────────────────────────
    try:
        from pdf2image import convert_from_bytes

        images = convert_from_bytes(pdf_bytes, dpi=300, fmt="PNG")
        logger.info(f"PDF converti via pdf2image : {len(images)} page(s)")
        return images

    except ImportError:
        raise RuntimeError(
            "Aucun convertisseur PDF disponible. "
            "Installez pymupdf : pip install pymupdf==1.24.5"
        )
    except Exception as e:
        msg = str(e).lower()
        if "poppler" in msg or "pdftoppm" in msg or "pdfinfo" in msg:
            raise RuntimeError(
                f"pdf2image nécessite Poppler (non installé) : {e}\n"
                "Solution recommandée : pip install pymupdf==1.24.5"
            )
        raise ValueError(f"Impossible de convertir le PDF : {e}")


# ─── Manipulation images ──────────────────────────────────────────────────────

def image_bytes_vers_pil(image_bytes: bytes, mimetype: str):
    """Convertit des bytes image en objet PIL Image."""
    from PIL import Image
    import io
    try:
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        return img
    except Exception as e:
        raise ValueError(f"Image invalide : {e}")


def ocr_image(image, lang: str = "fra") -> str:
    """
    Applique Tesseract OCR sur une image PIL.
    Configuration optimisée pour formulaires CERFA scannés :
      --oem 3  : moteur LSTM neural net (meilleur pour l'écriture cursive)
      --psm 6  : bloc de texte uniforme (formulaire)
      whitelist : caractères français + alphanumériques courants
    """
    caracteres_autorises = (
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
        "0123456789.,/-: éèêëàâùûüôîïçÉÈÊËÀÂÙÛÜÔÎÏÇæœÆŒ()[]'\"+"
    )
    config_cerfa = (
        "--oem 3 "
        "--psm 6 "
        f"-c tessedit_char_whitelist={caracteres_autorises}"
    )

    # Langue combinée : français + anglais pour meilleure reconnaissance
    langue = "fra+eng" if lang == "fra" else lang

    try:
        texte = pytesseract.image_to_string(image, lang=langue, config=config_cerfa)
        return texte.strip()
    except pytesseract.TesseractError as e:
        logger.error(f"Erreur Tesseract : {e}")
        raise RuntimeError(f"Tesseract OCR indisponible : {e}")


# ─── Pipeline complet ─────────────────────────────────────────────────────────

def extraire_texte_complet(fichier_bytes: bytes, mimetype: str) -> str:
    """
    Pipeline complet d'extraction de texte depuis un fichier PMT.

    1. Conversion PDF → images si nécessaire (pymupdf → pdf2image)
    2. Amélioration image pour scan CERFA (ameliorer_image_scan)
    3. OCR Tesseract optimisé (fra+eng, whitelist CERFA)
    4. Concaténation des pages
    """
    textes = []

    if mimetype == "application/pdf":
        images = pdf_vers_images(fichier_bytes)
        for i, img in enumerate(images):
            img_amelioree = ameliorer_image_scan(img)
            texte = ocr_image(img_amelioree)
            if texte:
                textes.append(texte)
                logger.debug(f"Page {i + 1} : {len(texte)} caractères extraits")
    else:
        image = image_bytes_vers_pil(fichier_bytes, mimetype)
        img_amelioree = ameliorer_image_scan(image)
        texte = ocr_image(img_amelioree)
        textes.append(texte)

    resultat = "\n\n".join(textes)
    logger.info(f"OCR terminé : {len(resultat)} caractères au total")
    return resultat
