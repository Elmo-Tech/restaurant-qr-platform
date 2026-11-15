#!/usr/bin/env python3
"""Resolve public WP Photo Directory candidates and build review-only previews.

No WAYTA database access, no auto-approval. Individual CC0 rights still need
independent checks; this script does not validate authorship or image relevance.
"""
import hashlib
import io
import json
import pathlib
import re
import sys
import time
from urllib.parse import urlparse

import requests
from PIL import Image, ImageDraw, ImageOps

API = "https://wordpress.org/photos/wp-json/wp/v2/photos"


def valid_image_url(raw):
    if not isinstance(raw, str):
        return False
    url = urlparse(raw)
    return (url.scheme == "https" and url.hostname == "pd.w.org" and
            url.port is None and not url.username and
            bool(re.search(r"\.(jpe?g|png|webp)$", url.path, re.I)))


def resolve_photo(session, photo_id):
    response = session.get(API, params={"slug": photo_id, "_embed": 1}, timeout=25)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("Photo API did not return a list")
    photos = [p for p in payload if p.get("slug") == photo_id or
              (p.get("link") or "").rstrip("/").endswith("/" + photo_id)]
    if not photos:
        raise ValueError("Photo ID not returned by Photo Directory API: " + photo_id)
    item = photos[0]
    possible = [item.get("source_url")]
    details = item.get("media_details") or {}
    for size in ("full", "large", "medium"):
        possible.append((details.get("sizes") or {}).get(size, {}).get("source_url"))
    for media in (item.get("_embedded") or {}).get("wp:featuredmedia", []):
        possible.append(media.get("source_url"))
        for size in ("full", "large", "medium"):
            possible.append(((media.get("media_details") or {}).get("sizes") or {})
                            .get(size, {}).get("source_url"))
    url = next((u for u in possible if valid_image_url(u)), None)
    if not url:
        raise ValueError("No supported pd.w.org photo URL. API fields: " + ",".join(item.keys()))
    return url


def fetch_limited(session, url, max_bytes=20 * 1024 * 1024):
    if not valid_image_url(url):
        raise ValueError("Unapproved photo host")
    with session.get(url, stream=True, timeout=25, allow_redirects=False) as resp:
        if resp.status_code != 200:
            raise ValueError("Photo returned HTTP " + str(resp.status_code))
        buffers, size = [], 0
        for chunk in resp.iter_content(131072):
            size += len(chunk)
            if size > max_bytes:
                raise ValueError("Downloaded image exceeds 20 MB")
            buffers.append(chunk)
    return b"".join(buffers)


def main():
    batch = json.loads(pathlib.Path(sys.argv[1]).read_text("utf8"))
    images = batch["images"]
    if len(images) != 20:
        raise ValueError("The initial review batch must contain exactly 20 candidates")
    output = pathlib.Path(sys.argv[2])
    previews = output / "previews"
    previews.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = "WAYTA-FoodPhotoQA/0.1 (no product upload)"
    sheet = Image.new("RGB", (1200, 1200), "#111419")
    draw = ImageDraw.Draw(sheet)
    manifest = {"version": 1, "images": []}
    report = []
    for i, item in enumerate(images):
        x, y = (i % 4) * 300, (i // 4) * 240
        print("CHECK", i + 1, item["id"], flush=True)
        try:
            url = resolve_photo(session, item["wpPhotoId"])
            original = fetch_limited(session, url)
            image = Image.open(io.BytesIO(original))
            if image.format not in ("JPEG", "PNG", "WEBP"):
                raise ValueError("Unsupported image encoding")
            if image.width * image.height > 25000000:
                raise ValueError("Image too large to decode safely")
            image = ImageOps.exif_transpose(image).convert("RGB")
            thumbnail = ImageOps.fit(image, (280, 178))
            sheet.paste(thumbnail, (x + 10, y + 10))
            image.thumbnail((1080, 1080))
            image.save(previews / (item["id"] + ".webp"), "WEBP", quality=80)
            digest = hashlib.sha256(original).hexdigest()
            manifest["images"].append({
                "id": item["id"], "name": item["name"],
                "sourceUrl": url, "sourcePageUrl": item["sourcePageUrl"],
                "licenseProofUrl": item["licenseProofUrl"],
                "license": "CC0", "licenseReviewedAt": None,
                "approved": False, "expectedSha256": digest,
                "tagCodes": item["tagCodes"], "sectors": item["sectors"],
                "presentation": item["presentation"]
            })
            report.append({"id": item["id"], "status": "previewed",
                           "sourceSha256": digest, "sourceUrl": url,
                           "sourcePageUrl": item["sourcePageUrl"],
                           "licenseReviewed": False})
            print("  PREVIEWED", len(original), "bytes", url, flush=True)
        except Exception as exc:
            report.append({"id": item["id"], "status": "failed", "reason": str(exc)[:350]})
            draw.rectangle((x + 10, y + 10, x + 289, y + 188), fill="#252b32")
            draw.text((x + 18, y + 74), "NOT FETCHED", fill="#ff8d82")
            print("  FAILED", str(exc)[:350], flush=True)
        draw.text((x + 12, y + 191), item["name"][:30], fill="#ffffff")
        draw.text((x + 12, y + 211), item["wpPhotoId"], fill="#9ea9b4")
        time.sleep(.1)
    sheet.save(output / "contact-sheet.jpg", quality=80, optimize=True)
    (output / "manifest-pending-review.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", "utf8")
    (output / "review-report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", "utf8")
    print("WAYTA_SUMMARY", json.dumps({"previewed": len(manifest["images"]),
          "failed": len(images) - len(manifest["images"])}), flush=True)
    if len(manifest["images"]) < 10:
        raise RuntimeError("Fewer than 10 previews from 20 candidates; source batch needs replacement")
    if len(manifest["images"]) < len(images):
        print("REVIEW PARTIAL: failed photo IDs are logged in review-report.json; "
              "they are excluded from the import manifest.", flush=True)


if __name__ == "__main__":
    main()
