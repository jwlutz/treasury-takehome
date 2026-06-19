# test data

35 alcohol-label examples for the verifier. answers live only in the manifest, never printed on an image.

- `images/real/` (20) — real TTB public COLA registry labels. official application metadata, label text not OCR-checked. for ingestion + realism.
- `images/ai_correct/` (5) — AI product photos, compliant labels.
- `images/ai_wrong/` (5) — AI photos with one deliberate failure (field mismatch or warning defect).
- `images/ai_needs_review/` (5) — AI photos with image-quality issues (glare/skew).

`manifest.jsonl` = one row per image: id, category, expected_decision, image_path, application_fields, observed_label_fields, known_issues. `manifest.csv` = quick spreadsheet view.

source: generated from alcohol-label-verification-dataset (AI photos + deterministic local text overlay so the manifest matches the rendered text exactly).
