-- Signatures and seals now belong only to individual contracts. Existing
-- issued snapshots in contracts.issued_assets are unaffected. Old drafts that
-- previously saw the shared image will require a new upload.
DROP TABLE "contract_signing_assets";
