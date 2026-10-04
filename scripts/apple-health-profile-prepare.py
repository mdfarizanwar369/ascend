"""Prepare the authorized Ascend profile, exporting only GitHub-encrypted ciphertext."""
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

BUNDLE = "fit.getascend.app"
TEAM = "76N75VT6A7"
HEALTH_KEYS = ("com.apple.developer.healthkit", "com.apple.developer.healthkit.background-delivery")
GITHUB_ENVIRONMENT_KEY_ID = "3380204578043523366"
GITHUB_ENVIRONMENT_PUBLIC_KEY = "qDweWVfdKsdPOhQc8uE8CCC7l4oC803z3zrpBwDPY08="


def validate_context(environ):
    if (environ.get("GITHUB_REPOSITORY") != "mdfarizanwar369/ascend"
            or environ.get("GITHUB_REF") != "refs/heads/main"
            or environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch"
            or environ.get("PROFILE_PREPARATION_APPROVED") != "true"):
        raise SystemExit("Profile preparation requires the authorized manual main workflow.")


def validate_encryption_target(environ):
    if (environ.get("PROFILE_ENCRYPTION_KEY_ID") != GITHUB_ENVIRONMENT_KEY_ID
            or environ.get("PROFILE_ENCRYPTION_PUBLIC_KEY") != GITHUB_ENVIRONMENT_PUBLIC_KEY):
        raise SystemExit("Profile export is restricted to the existing apple-testflight environment key.")


def validate_profile(profile, original, require_health=True):
    entitlements = profile.get("Entitlements", {})
    if profile.get("TeamIdentifier") != [TEAM] or entitlements.get("application-identifier") != f"{TEAM}.{BUNDLE}":
        raise SystemExit("Refusing a profile for another app or team.")
    if profile.get("ProvisionedDevices") or profile.get("ProvisionsAllDevices") or entitlements.get("get-task-allow"):
        raise SystemExit("An App Store distribution profile is required.")
    if profile["ExpirationDate"].replace(tzinfo=datetime.timezone.utc) <= datetime.datetime.now(datetime.timezone.utc):
        raise SystemExit("Refusing an expired profile.")
    if require_health and any(entitlements.get(key) is not True for key in HEALTH_KEYS):
        raise SystemExit("Apple's new profile still lacks HealthKit or background delivery; do not replace the existing secret.")
    if "Default" not in entitlements.get("com.apple.developer.applesignin", []):
        raise SystemExit("The new profile must preserve Sign in with Apple.")
    for key, previous in original.get("Entitlements", {}).items():
        if key in HEALTH_KEYS:
            continue
        current = entitlements.get(key)
        if isinstance(previous, list):
            if not isinstance(current, list) or any(item not in current for item in previous):
                raise SystemExit("The new profile would remove an existing app entitlement.")
        elif current != previous:
            raise SystemExit("The new profile would change an existing app entitlement.")
    expected = {hashlib.sha256(value).hexdigest() for value in original.get("DeveloperCertificates", [])}
    actual = {hashlib.sha256(value).hexdigest() for value in profile.get("DeveloperCertificates", [])}
    if not expected or not actual.intersection(expected):
        raise SystemExit("The new profile does not contain the existing signing certificate.")


def main():
    validate_context(os.environ)
    validate_encryption_target(os.environ)
    import jwt
    from nacl.public import PublicKey, SealedBox
    encryption_key = PublicKey(base64.b64decode(os.environ["PROFILE_ENCRYPTION_PUBLIC_KEY"], validate=True))
    key_id = os.environ["PROFILE_ENCRYPTION_KEY_ID"]
    if not key_id.isdigit():
        raise SystemExit("A valid environment encryption key ID is required.")
    now = int(time.time())
    token = jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
        base64.b64decode(os.environ["ASC_PRIVATE_KEY_BASE64"], validate=True), algorithm="ES256",
        headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})

    def request(method, path, body=None, **params):
        url = "https://api.appstoreconnect.apple.com" + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)["data"]
        except urllib.error.HTTPError as error:
            # Do not dump the body of a signing request or return credential contents.
            raise SystemExit(f"Apple profile preparation returned HTTP {error.code} for {method} {path}.") from None

    with tempfile.TemporaryDirectory(prefix="ascend-health-profile-") as directory:
        def decode(value, filename):
            file = Path(directory) / filename
            file.write_bytes(base64.b64decode(value, validate=True))
            file.chmod(0o600)
            result = subprocess.run(["security", "cms", "-D", "-i", str(file)], capture_output=True, check=True)
            return plistlib.loads(result.stdout)

        original = decode(os.environ["IOS_PROFILE_BASE64"], "original.mobileprovision")
        validate_profile(original, original, require_health=False)
        bundles = request("GET", "/v1/bundleIds", **{"filter[identifier]": BUNDLE, "limit": 5})
        if len(bundles) != 1:
            raise SystemExit("Expected exactly one Ascend bundle ID.")
        bundle_id = bundles[0]["id"]
        certificates = request("GET", "/v1/certificates", limit=200)
        expected = {hashlib.sha256(value).hexdigest() for value in original["DeveloperCertificates"]}
        matching = [item for item in certificates if hashlib.sha256(base64.b64decode(item["attributes"].get("certificateContent", ""))).hexdigest() in expected]
        if len(matching) != 1 or matching[0]["attributes"]["certificateType"] not in ("DISTRIBUTION", "IOS_DISTRIBUTION"):
            raise SystemExit("Could not uniquely verify the existing distribution signing certificate.")
        capabilities = request("GET", f"/v1/bundleIds/{bundle_id}/bundleIdCapabilities")
        if not any(item["attributes"]["capabilityType"] == "HEALTHKIT" for item in capabilities):
            request("POST", "/v1/bundleIdCapabilities", {"data": {"type": "bundleIdCapabilities",
                "attributes": {"capabilityType": "HEALTHKIT"},
                "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_id}}}}})
            print("ASCEND_HEALTHKIT_CAPABILITY_ENABLED")
        else:
            print("ASCEND_HEALTHKIT_CAPABILITY_ALREADY_ENABLED")
        name = "Ascend Health App Store " + os.environ["GITHUB_RUN_ID"]
        # Recover a profile if this exact run is retried; do not create duplicates.
        existing = request("GET", "/v1/profiles", **{"filter[name]": name, "limit": 5})
        if len(existing) > 1:
            raise SystemExit("Multiple profiles unexpectedly match this preparation run.")
        profile = existing[0] if existing else request("POST", "/v1/profiles", {"data": {"type": "profiles",
            "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
            "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_id}},
                "certificates": {"data": [{"type": "certificates", "id": matching[0]["id"]}]}}}})
        content = profile["attributes"]["profileContent"]
        updated = decode(content, "health.mobileprovision")
        validate_profile(updated, original)
        ciphertext = base64.b64encode(SealedBox(encryption_key).encrypt(content.encode())).decode()
        output = Path(os.environ["RUNNER_TEMP"]) / "ascend-health-profile-encrypted.json"
        output.write_text(json.dumps({"key_id": key_id, "encrypted_value": ciphertext}), encoding="utf-8")
        output.chmod(0o600)
        print("HEALTH_PROFILE_VALIDATED", json.dumps({"id": profile["id"], "existingCertificatePreserved": True,
            "existingEntitlementsPreserved": True, "healthKit": True, "backgroundDelivery": True}))
        print("PROFILE_EXPORT_ENCRYPTED_FOR_EXISTING_GITHUB_ENVIRONMENT")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit("Profile decoding failed; no credentials were printed.") from None
