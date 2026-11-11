# Token fallback assets

Upload the Solana blockchain logo into this folder using this exact filename:

`solana-logo.png`

The frontend loads it from:

`/assets/token-fallbacks/solana-logo.png`

Recommended asset: a square PNG with a transparent background (512 × 512 or larger). Keep the logo centered with comfortable transparent padding. Do not rename the file.

The app uses this image when a token has no usable logo URL or when all current token-logo image gateways fail. It continues retrying the token's own logo in the background and switches back automatically if that logo later loads.
