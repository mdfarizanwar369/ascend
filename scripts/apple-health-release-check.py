"""Read-only Apple release/signing checks on an ephemeral trusted macOS runner."""
import base64
import importlib.util
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


def main():
    spec = importlib.util.spec_from_file_location("ios_release", Path(__file__).with_name("ios-release.py"))
    release = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(release)
    release.validate_release_context(os.environ, {"appId": release.BUNDLE,
        "server": {"url": "https://www.getascend.fit/", "appStartPath": "/launch", "cleartext": False}})
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
            raise SystemExit(f"Apple read-only release check returned HTTP {error.code} for {path}.") from None

    apps = get("/v1/apps", **{"filter[bundleId]": release.BUNDLE, "limit": 5})
    if len(apps) != 1:
        raise SystemExit("Expected exactly one Ascend app.")
    for version in get(f"/v1/apps/{apps[0]['id']}/appStoreVersions", limit=20):
        attrs = version["attributes"]
        print("APP_STORE_VERSION", json.dumps({"version": attrs.get("versionString"), "state": attrs.get("appStoreState"), "platform": attrs.get("platform")}))
    bundles = get("/v1/bundleIds", **{"filter[identifier]": release.BUNDLE, "limit": 5})
    if len(bundles) == 1:
        for capability in get(f"/v1/bundleIds/{bundles[0]['id']}/bundleIdCapabilities"):
            if capability["attributes"].get("capabilityType") in ("HEALTHKIT", "APPLE_ID_AUTH"):
                print("BUNDLE_CAPABILITY", json.dumps(capability["attributes"]))
    required = plistlib.loads(Path("ios/App/App/App.entitlements").read_bytes())
    with tempfile.TemporaryDirectory(prefix="ascend-profile-check-") as directory:
        file = Path(directory) / "app.mobileprovision"
        file.write_bytes(base64.b64decode(os.environ["IOS_PROFILE_BASE64"], validate=True))
        file.chmod(0o600)
        result = subprocess.run(["security", "cms", "-D", "-i", str(file)], capture_output=True, check=True)
        profile = plistlib.loads(result.stdout)
        for key in ("com.apple.developer.healthkit", "com.apple.developer.healthkit.background-delivery"):
            print("PROFILE_CAPABILITY", json.dumps({"capability": key, "enabled": profile.get("Entitlements", {}).get(key) is True}))
        release.validate_profile(profile, required)
    print("APPLE_HEALTH_SIGNING_PREFLIGHT_PASSED")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit("Apple profile decoding failed; no credentials were printed.") from None
