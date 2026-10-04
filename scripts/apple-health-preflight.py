"""Read-only release inspection. Never uploads, changes capabilities, or prints secrets."""
import base64
import datetime
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
import jwt

BUNDLE = "fit.getascend.app"
TEAM = "76N75VT6A7"


def main():
    if (os.environ.get("GITHUB_REPOSITORY") != "mdfarizanwar369/ascend"
            or os.environ.get("GITHUB_REF") != "refs/heads/main"
            or os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch"):
        raise SystemExit("Inspection requires a manual run on Ascend's protected main branch.")
    now = int(time.time())
    token = jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
        base64.b64decode(os.environ["ASC_PRIVATE_KEY_BASE64"], validate=True), algorithm="ES256",
        headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})

    def get(path, **params):
        request = urllib.request.Request("https://api.appstoreconnect.apple.com" + path + "?" + urllib.parse.urlencode(params),
            headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)["data"]
        except urllib.error.HTTPError as error:
            print("APPLE_READ_ERROR", json.dumps({"path": path, "status": error.code}))
            return None

    apps = get("/v1/apps", **{"filter[bundleId]": BUNDLE, "limit": 5})
    if apps is None or len(apps) != 1:
        raise SystemExit("Could not verify the Ascend app identity.")
    versions = get(f"/v1/apps/{apps[0]['id']}/appStoreVersions", limit=20)
    if versions is not None:
        for version in versions:
            attrs = version["attributes"]
            print("APP_STORE_VERSION", json.dumps({"version": attrs.get("versionString"), "state": attrs.get("appStoreState"), "platform": attrs.get("platform")}))
    bundles = get("/v1/bundleIds", **{"filter[identifier]": BUNDLE, "limit": 5})
    if bundles is not None and len(bundles) == 1:
        capabilities = get(f"/v1/bundleIds/{bundles[0]['id']}/bundleIdCapabilities", limit=100)
        if capabilities is not None:
            for capability in capabilities:
                if capability["attributes"].get("capabilityType") in ("HEALTHKIT", "SIGN_IN_WITH_APPLE"):
                    print("BUNDLE_CAPABILITY", json.dumps(capability["attributes"]))
    with tempfile.TemporaryDirectory(prefix="ascend-profile-inspection-") as directory:
        file = Path(directory) / "app.mobileprovision"
        file.write_bytes(base64.b64decode(os.environ["IOS_PROFILE_BASE64"], validate=True))
        file.chmod(0o600)
        result = subprocess.run(["security", "cms", "-D", "-i", str(file)], capture_output=True, check=True)
        profile = plistlib.loads(result.stdout)
        entitlements = profile.get("Entitlements", {})
        print("PROFILE_INSPECTION", json.dumps({
            "teamMatches": profile.get("TeamIdentifier") == [TEAM],
            "bundleMatches": entitlements.get("application-identifier") == f"{TEAM}.{BUNDLE}",
            "appStoreDistribution": not bool(profile.get("ProvisionedDevices") or profile.get("ProvisionsAllDevices") or entitlements.get("get-task-allow")),
            "unexpired": profile["ExpirationDate"].replace(tzinfo=datetime.timezone.utc) > datetime.datetime.now(datetime.timezone.utc),
            "signInWithApple": "Default" in entitlements.get("com.apple.developer.applesignin", []),
            "healthKit": entitlements.get("com.apple.developer.healthkit") is True,
            "healthKitBackgroundDelivery": entitlements.get("com.apple.developer.healthkit.background-delivery") is True}))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit("Profile decoding failed; no credentials were printed.") from None
