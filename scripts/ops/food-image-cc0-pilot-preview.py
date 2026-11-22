#!/usr/bin/env python3
"""Preflight real CC0 photo candidates for WAYTA; NEVER imports or approves photos.

Downloads images from a fixed Wikimedia Commons CDN location, produces unapproved
manifest and previews for human assessment. This does not contact WAYTA or its DB.
"""
import hashlib
import io
import json
from pathlib import Path
import sys
from urllib.parse import urlparse

import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps

MAX_BYTES = 20 * 1024 * 1024
MAX_PIXELS = 24_000_000
USER_AGENT = "WAYTA-CC0-Photo-Review/1.0 (human review only)"


def fetch_verified_location(session, url):
    parsed = urlparse(url)
    if (parsed.scheme != "https" or
        parsed.netloc != "upload.wikimedia.org" or
        not parsed.path.startswith("/wikipedia/commons/") or
        not parsed.path.lower().endswith((".jpg", ".jpeg", ".png", ".webp")) or
        parsed.username or parsed.password or parsed.fragment or parsed.port):
        raise ValueError("Unapproved CC0 image host or source path")
    parts = []
    size = 0
    with session.get(url, stream=True, allow_redirects=False, timeout=30) as response:
        if response.status_code != 200:
            raise ValueError("Image HTTP " + str(response.status_code))
        for chunk in response.iter_content(128 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError("Source exceeds 20MiB")
            parts.append(chunk)
    if not size:
        raise ValueError("Empty response")
    return b"".join(parts)


def make_preview(raw):
    image = Image.open(io.BytesIO(raw))
    if image.format not in ("JPEG", "PNG", "WEBP"):
        raise ValueError("Unsupported photo encoding")
    if image.width * image.height > MAX_PIXELS:
        raise ValueError("Image exceeds 24 MP")
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    image.save(buf, "WEBP", quality=82)
    return image, buf.getvalue()


def main():
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
    output = Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    (output / "previews").mkdir(exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    candidates = payload["candidates"]
    if not candidates or len(candidates) > 5:
        raise ValueError("Expected 1-5 controlled review candidates")
    sheet = Image.new("RGB", (800, len(candidates) * 620), "#12141a")
    pen = ImageDraw.Draw(sheet)
    manifest = {"version": 1, "images": []}
    report = []
    seen = set()

    for index, candidate in enumerate(candidates):
        photo_id = candidate["id"]
        if photo_id in seen or candidate.get("approved") is not False:
            raise ValueError("Duplicate or prematurely approved candidate: " + photo_id)
        seen.add(photo_id)
        print("REVIEWING " + photo_id, flush=True)
        y = index * 620
        try:
            original = fetch_verified_location(session, candidate["sourceUrl"])
            source_sha256 = hashlib.sha256(original).hexdigest()
            full, optimized = make_preview(original)
            preview_path = output / "previews" / (photo_id + ".webp")
            preview_path.write_bytes(optimized)
            hero = ImageOps.contain(full, (768, 490))
            sheet.paste(hero, ((800 - hero.width) // 2, y + 8))
            square = ImageOps.fit(full, (105, 105), method=Image.Resampling.LANCZOS)
            sheet.paste(square, (14, y + 500))
            pen.text((135, y + 510), candidate["name"][:64], fill="white")
            pen.text((135, y + 544), "CC0 claim; not yet operator-approved", fill="#ffc98f")
            pen.text((135, y + 567), "Tags: " + ", ".join(candidate["tagCodes"]), fill="#b9c1cf")
            manifest["images"].append({
                "id": photo_id,
                "name": candidate["name"],
                "sourceUrl": candidate["sourceUrl"],
                "sourcePageUrl": candidate["sourcePageUrl"],
                "licenseProofUrl": candidate["licenseProofUrl"],
                "license": "CC0",
                "licenseReviewedAt": None,
                "approved": False,
                "expectedSha256": source_sha256,
                "tagCodes": candidate["tagCodes"],
                "sectors": candidate["sectors"],
                "presentation": candidate["presentation"]
            })
            report.append({
                "id": photo_id, "status": "PREVIEW_READY", "approved": False,
                "sourceSha256": source_sha256, "sourceBytes": len(original),
                "width": full.width, "height": full.height,
                "previewBytes": len(optimized), "sourcePageUrl": candidate["sourcePageUrl"],
                "licenseReviewEvidence": candidate["licenseReviewEvidence"],
                "visualQualityScore": None
            })
            print("PREVIEW_READY " + photo_id + " " + str(full.width) + "x" +
                  str(full.height) + " sha256=" + source_sha256, flush=True)
        except Exception as error:
            pen.text((20, y + 230), "FAILED: " + photo_id, fill="#fc8a8a")
            report.append({"id": photo_id, "status": "FAILED", "approved": False,
                           "error": str(error)[:250]})
            print("FAILED " + photo_id + ": " + str(error)[:250], flush=True)

    sheet.save(output / "contact-sheet.jpg", quality=86, optimize=True)
    (output / "manifest-pending-review.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    (output / "source-review-report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print("SUMMARY READY=" + str(len(manifest["images"])) + " FAILED=" +
          str(len(candidates)-len(manifest["images"])), flush=True)
    if len(manifest["images"]) != len(candidates):
        sys.exit(2)


if __name__ == "__main__":
    main()
