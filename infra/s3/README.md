# S3 config for `vsc-files-storage` (ap-south-1)

Makes site-editor device uploads work in the browser. Two things:

1. **CORS** — lets the browser `PUT` the file straight to S3 from the app origin
   (the `presign → PUT → confirm` flow in `sites-api.ts:uploadSiteImage`).
2. **Public read** — lets `<img src="https://vsc-files-storage.s3.ap-south-1.amazonaws.com/…">`
   load. Scoped to the only prefixes the app serves: `projects/*` (uploads) and
   `studio/*` (placeholders, cache, stock library) — see `ALLOWED_PREFIXES` in
   `backend/src/server/storage/s3.ts`.

Edit `cors.json` origins to match your real domains before applying.

## Apply

```bash
BUCKET=vsc-files-storage

aws s3api put-bucket-cors \
  --bucket "$BUCKET" \
  --cors-configuration file://cors.json

# Public read needs Block Public Access turned OFF for bucket policies first,
# otherwise the policy is ignored. Turn off only the policy-blocking flags:
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false

aws s3api put-bucket-policy \
  --bucket "$BUCKET" \
  --policy file://bucket-policy.json
```

## Verify

```bash
aws s3api get-bucket-cors    --bucket vsc-files-storage
aws s3api get-bucket-policy  --bucket vsc-files-storage
```

## Prefer a CDN instead of raw S3 URLs?

Front the bucket with CloudFront, set `STUDIO_ASSET_PUBLIC_BASE_URL` in `backend/.env`
to the CDN origin, and you can keep the bucket fully private (skip the public-read
policy — keep CORS for the upload PUT). `publicAssetUrl` uses that base when set.
