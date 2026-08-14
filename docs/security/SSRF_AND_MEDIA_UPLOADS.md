# SSRF And Media Upload Security

## Food AI remote images

Food AI accepts data URLs from Ascend's controlled upload flow. Legacy remote URLs remain compatible only when their exact HTTPS hostname appears in `FOOD_AI_REMOTE_IMAGE_HOSTS`.

For every request and redirect, Ascend:

- requires HTTPS, port 443, and no URL credentials;
- performs exact hostname matching, not suffix matching;
- rejects numeric loopback, private, link-local, carrier-grade NAT, multicast, documentation, unspecified, and IPv4-mapped IPv6 addresses;
- resolves every DNS answer and rejects the hostname if any answer is non-public;
- pins the validated public address for the TLS connection while retaining hostname/SNI certificate verification;
- revalidates up to three redirects;
- accepts only JPEG, PNG, and WebP responses, with a 5 MB limit and 10 second timeout.

Internal resolver/provider errors are recorded as safe codes and are never returned verbatim to clients. Keep `FOOD_AI_REMOTE_IMAGE_HOSTS` empty unless a controlled external image host is required.

## Controlled uploads

The public direct-to-bucket presign routes return `410 CONTROLLED_UPLOAD_REQUIRED`. The backend owns object keys and upload validation.

Each upload is checked for:

- a 5 MB decoded size limit (smaller where the feature requires it);
- JPEG, PNG, or WebP declared MIME type;
- matching file signature;
- successful strict image decode;
- one page/frame only;
- maximum 8,000 px per edge and 40 million pixels;
- a 10 second decode timeout and 15 second storage timeout;
- random UUID object names under a user/purpose prefix;
- ownership before attachment to a meal, profile, progress photo, or body scan;
- serialized per-user quotas of 10 uploads/minute and 100 uploads/24 hours.

Upload state is stored in `media_uploads`. A daily maintenance task deletes object keys for uploads left pending over 15 minutes and marks them failed. Failed active uploads also attempt immediate object cleanup.

## Operational response

Alert on repeated `remote_image:*` or `object_storage:*` external failure metrics, HTTP 429 upload responses, or growth in stale `media_uploads`. Never add a broad wildcard or user-controlled hostname to the allowlist.
