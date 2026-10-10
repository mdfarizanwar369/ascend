"""Archive, sign, and upload on an ephemeral GitHub macOS runner. Never prints secrets."""
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

TEAM = "76N75VT6A7"
BUNDLE = "fit.getascend.app"
WIDGET_BUNDLE = "fit.getascend.app.widget"
APP_GROUP = "group.fit.getascend.app"
RELEASE_ORIGINS = {
    "refs/heads/main": "https://www.getascend.fit/",
    "refs/heads/codex/ios-subscriptions-1-1": "https://ascend-ios-payments-web-ascend-ios-payments.up.railway.app/",
    "refs/heads/codex/ios-1.2-public-trainer-pro": "https://www.getascend.fit/",
}


def validate_release_context(environ, config):
    expected_origin = RELEASE_ORIGINS.get(environ.get("GITHUB_REF"))
    if environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or not expected_origin:
        raise SystemExit("TestFlight upload requires a manual run on an approved release branch.")
    if environ.get("GITHUB_REPOSITORY") != "mdfarizanwar369/ascend":
        raise SystemExit("TestFlight upload is restricted to the Ascend repository.")
    if config.get("appId") != BUNDLE or config.get("server", {}).get("url") != expected_origin:
        raise SystemExit("The packaged app must use the approved server for this release branch.")
    if config["server"].get("cleartext") is not False or config["server"].get("appStartPath") != "/launch":
        raise SystemExit("Release requires the HTTPS launch configuration.")


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def validate_profile(profile, bundle, required_entitlements):
    entitlements = profile.get("Entitlements", {})
    if profile.get("TeamIdentifier") != [TEAM] or entitlements.get("application-identifier") != f"{TEAM}.{bundle}":
        raise SystemExit("Provisioning profile does not match Ascend's team and bundle ID.")
    if bundle == BUNDLE and "Default" not in entitlements.get("com.apple.developer.applesignin", []):
        raise SystemExit("Regenerate the provisioning profile with Sign in with Apple enabled.")
    for capability in ("com.apple.developer.healthkit", "com.apple.developer.healthkit.background-delivery"):
        if required_entitlements.get(capability) is True and entitlements.get(capability) is not True:
            raise SystemExit("Regenerate Ascend's App Store provisioning profile with HealthKit and background delivery enabled.")
    if APP_GROUP in required_entitlements.get("com.apple.security.application-groups", []) and \
            APP_GROUP not in entitlements.get("com.apple.security.application-groups", []):
        raise SystemExit("Regenerate the provisioning profile with the Ascend App Group enabled.")
    if profile.get("ProvisionedDevices") or profile.get("ProvisionsAllDevices") or entitlements.get("get-task-allow"):
        raise SystemExit("An App Store distribution profile is required.")
    if profile["ExpirationDate"].replace(tzinfo=datetime.timezone.utc) <= datetime.datetime.now(datetime.timezone.utc):
        raise SystemExit("Provisioning profile has expired.")


def validate_health_usage_descriptions(info, required_entitlements):
    if required_entitlements.get("com.apple.developer.healthkit") is True:
        # App Store Connect currently checks both keys for HealthKit archives,
        # including Ascend's read-only requestAuthorization(toShare: []).
        for key in ("NSHealthShareUsageDescription", "NSHealthUpdateUsageDescription"):
            if not isinstance(info.get(key), str) or not info[key].strip():
                raise SystemExit(f"HealthKit archive requires a nonempty {key} in Info.plist.")


def validate_signed_entitlements(entitlements, bundle, required):
    if entitlements.get("application-identifier") != f"{TEAM}.{bundle}" or entitlements.get("get-task-allow"):
        raise SystemExit("Archived app identity or distribution signing is incorrect.")
    if bundle == BUNDLE and "Default" not in entitlements.get("com.apple.developer.applesignin", []):
        raise SystemExit("Archived app is missing Sign in with Apple.")
    for capability in ("com.apple.developer.healthkit", "com.apple.developer.healthkit.background-delivery"):
        if required.get(capability) is True and entitlements.get(capability) is not True:
            raise SystemExit("Archived app is missing the required HealthKit entitlement.")
    if APP_GROUP in required.get("com.apple.security.application-groups", []) and \
            APP_GROUP not in entitlements.get("com.apple.security.application-groups", []):
        raise SystemExit("Archived product is missing the Ascend App Group entitlement.")


class AppleDeveloperAPI:
    """Minimal App Store Connect provisioning client; error bodies may contain sensitive data."""

    def __init__(self, issuer_id, key_id, private_key):
        import jwt
        now = int(time.time())
        self.token = jwt.encode({"iss": issuer_id, "iat": now, "exp": now + 600,
            "aud": "appstoreconnect-v1"}, private_key, algorithm="ES256",
            headers={"kid": key_id, "typ": "JWT"})

    def request(self, method, path, body=None, **params):
        url = "https://api.appstoreconnect.apple.com" + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                if response.status == 204:
                    return None
                return json.load(response)["data"]
        except urllib.error.HTTPError as error:
            raise SystemExit(f"Apple provisioning returned HTTP {error.code} for {method} {path}.") from None


def get_or_create_bundle(api, identifier, name):
    matches = api.request("GET", "/v1/bundleIds", **{"filter[identifier]": identifier, "limit": 5})
    if len(matches) > 1:
        raise SystemExit(f"Multiple Apple bundle IDs match {identifier}.")
    if matches:
        return matches[0]
    return api.request("POST", "/v1/bundleIds", {"data": {"type": "bundleIds",
        "attributes": {"identifier": identifier, "name": name, "platform": "IOS"}}})


def enable_capability(api, bundle_id, capability_type):
    capabilities = api.request("GET", f"/v1/bundleIds/{bundle_id}/bundleIdCapabilities")
    if any(item["attributes"].get("capabilityType") == capability_type for item in capabilities):
        return
    api.request("POST", "/v1/bundleIdCapabilities", {"data": {"type": "bundleIdCapabilities",
        "attributes": {"capabilityType": capability_type},
        "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_id}}}}})


def matching_distribution_certificate(api, original_profile):
    expected = {hashlib.sha256(value).hexdigest()
        for value in original_profile.get("DeveloperCertificates", [])}
    certificates = api.request("GET", "/v1/certificates", limit=200)
    matching = [item for item in certificates
        if item["attributes"].get("certificateType") in ("DISTRIBUTION", "IOS_DISTRIBUTION")
        and hashlib.sha256(base64.b64decode(
            item["attributes"].get("certificateContent", ""))).hexdigest() in expected]
    if len(matching) != 1:
        raise SystemExit("Could not uniquely verify Ascend's Apple Distribution certificate.")
    return matching[0]


def get_or_create_profile(api, name, bundle_id, certificate_id):
    matches = api.request("GET", "/v1/profiles", **{"filter[name]": name, "limit": 5})
    active = [item for item in matches if item["attributes"].get("profileState") == "ACTIVE"]
    if len(active) > 1:
        raise SystemExit(f"Multiple active Apple profiles match {name}.")
    if active:
        return active[0]
    return api.request("POST", "/v1/profiles", {"data": {"type": "profiles",
        "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
        "relationships": {
            "bundleId": {"data": {"type": "bundleIds", "id": bundle_id}},
            "certificates": {"data": [{"type": "certificates", "id": certificate_id}]}}}})


def install_profile(profile_resource, destination, bundle, required):
    destination.write_bytes(base64.b64decode(profile_resource["attributes"]["profileContent"], validate=True))
    decoded = plistlib.loads(run("security", "cms", "-D", "-i", str(destination), capture_output=True).stdout)
    validate_profile(decoded, bundle, required)
    return decoded


def validate_product(product, bundle, required):
    run("codesign", "--verify", "--strict", str(product), capture_output=True)
    embedded = product / "embedded.mobileprovision"
    if not embedded.exists():
        raise SystemExit("Signed product is missing its App Store provisioning profile.")
    profile = plistlib.loads(run("security", "cms", "-D", "-i", str(embedded), capture_output=True).stdout)
    validate_profile(profile, bundle, required)
    signed = run("codesign", "-d", "--entitlements", ":-", str(product), capture_output=True)
    validate_signed_entitlements(plistlib.loads(signed.stdout), bundle, required)


def main():
    root = Path.cwd()
    validate_release_context(os.environ, json.loads((root / "ios/App/App/capacitor.config.json").read_text()))
    names = ("IOS_CERTIFICATE_BASE64", "IOS_CERTIFICATE_PASSWORD", "IOS_PROFILE_BASE64",
             "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY_BASE64", "IOS_GOOGLE_SERVICE_INFO_BASE64")
    missing = [name for name in names if not os.environ.get(name)]
    if missing:
        raise SystemExit("Configure the apple-testflight environment secrets: " + ", ".join(missing))
    google_config = plistlib.loads((root / "ios/App/App/GoogleService-Info.plist").read_bytes())
    if google_config.get("BUNDLE_ID") != BUNDLE or google_config.get("PROJECT_ID") != "ascend-b2850" or google_config.get("API_KEY") == "SIMULATOR_ONLY_NOT_FOR_SIGN_IN":
        raise SystemExit("Valid Ascend iOS Firebase configuration is required for release.")
    installed_profiles = []
    with tempfile.TemporaryDirectory(prefix="ascend-signing-", dir=os.environ.get("RUNNER_TEMP")) as directory:
        temp = Path(directory)
        keychain = temp / "signing.keychain-db"
        password = secrets.token_urlsafe(32)
        try:
            certificate = temp / "distribution.p12"
            profile_file = temp / "app.mobileprovision"
            certificate.write_bytes(base64.b64decode(os.environ["IOS_CERTIFICATE_BASE64"], validate=True))
            profile_file.write_bytes(base64.b64decode(os.environ["IOS_PROFILE_BASE64"], validate=True))
            profile = plistlib.loads(run("security", "cms", "-D", "-i", str(profile_file), capture_output=True).stdout)
            required = plistlib.loads((root / "ios/App/App/App.entitlements").read_bytes())
            widget_required = plistlib.loads((root / "ios/App/AscendWidget/AscendWidget.entitlements").read_bytes())
            # Anchor automatic signing to the existing verified Ascend profile.
            # Xcode refreshes provisioning for the new App Group and widget, and
            # the resulting distribution profiles are validated below.
            validate_profile(profile, BUNDLE, {key: value for key, value in required.items()
                if key != "com.apple.security.application-groups"})
            validate_health_usage_descriptions(plistlib.loads((root / "ios/App/App/Info.plist").read_bytes()), required)
            run("security", "create-keychain", "-p", password, str(keychain), capture_output=True)
            run("security", "set-keychain-settings", "-lut", "3600", str(keychain), capture_output=True)
            run("security", "unlock-keychain", "-p", password, str(keychain), capture_output=True)
            run("security", "import", str(certificate), "-P", os.environ["IOS_CERTIFICATE_PASSWORD"],
                "-t", "cert", "-f", "pkcs12", "-k", str(keychain), "-T", "/usr/bin/codesign", capture_output=True)
            run("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-k", password, str(keychain), capture_output=True)
            run("security", "list-keychains", "-d", "user", "-s", str(keychain), capture_output=True)
            profile_dir = Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles"
            profile_dir.mkdir(parents=True, exist_ok=True)
            destination = profile_dir / f"{profile['UUID']}.mobileprovision"
            shutil.copyfile(profile_file, destination)
            installed_profiles.append(destination)
            key_id = os.environ["ASC_KEY_ID"]
            if not key_id.isalnum():
                raise SystemExit("Invalid App Store Connect key ID.")
            private_key = temp / f"AuthKey_{key_id}.p8"
            private_key.write_bytes(base64.b64decode(os.environ["ASC_PRIVATE_KEY_BASE64"], validate=True))
            private_key.chmod(0o600)
            api = AppleDeveloperAPI(os.environ["ASC_ISSUER_ID"], key_id, private_key.read_bytes())
            distribution = matching_distribution_certificate(api, profile)
            main_bundle = get_or_create_bundle(api, BUNDLE, "Ascend Fitness and Nutrition")
            widget_bundle = get_or_create_bundle(api, WIDGET_BUNDLE, "Ascend Today Widget")
            enable_capability(api, main_bundle["id"], "APP_GROUPS")
            enable_capability(api, widget_bundle["id"], "APP_GROUPS")
            release_profile_suffix = os.environ["GITHUB_RUN_ID"]
            if not release_profile_suffix.isdigit():
                raise SystemExit("Invalid GitHub release run ID.")
            main_profile_resource = get_or_create_profile(api, f"Ascend Shared {release_profile_suffix}",
                main_bundle["id"], distribution["id"])
            widget_profile_resource = get_or_create_profile(api, f"Ascend Widget {release_profile_suffix}",
                widget_bundle["id"], distribution["id"])
            main_profile_source = temp / "ascend-shared.mobileprovision"
            widget_profile_source = temp / "ascend-widget.mobileprovision"
            main_profile = install_profile(main_profile_resource, main_profile_source, BUNDLE, required)
            widget_profile = install_profile(widget_profile_resource, widget_profile_source, WIDGET_BUNDLE, widget_required)
            for source, item in ((main_profile_source, main_profile), (widget_profile_source, widget_profile)):
                installed = profile_dir / f"{item['UUID']}.mobileprovision"
                shutil.copyfile(source, installed)
                installed_profiles.append(installed)
            archive = temp / "Ascend.xcarchive"
            # Run number stays monotonic for this workflow; attempts get a separate component.
            build_number = f"{os.environ['GITHUB_RUN_NUMBER']}.{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}"
            run("xcodebuild", "-project", str(root / "ios/App/App.xcodeproj"), "-scheme", "App",
                "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", str(archive),
                # Release signing is manual in the App and widget target build
                # settings. Global signing overrides also affect Swift packages.
                f"ASCEND_PROFILE_UUID={main_profile['UUID']}",
                f"ASCEND_WIDGET_PROFILE_UUID={widget_profile['UUID']}",
                f"CURRENT_PROJECT_VERSION={build_number}", "archive")
            archived_app = archive / "Products/Applications/App.app"
            run("codesign", "--verify", "--deep", "--strict", str(archived_app), capture_output=True)
            archived_widget = archived_app / "PlugIns/AscendWidgetExtension.appex"
            if not archived_widget.exists():
                raise SystemExit("Archived app is missing the Ascend Today widget extension.")
            validate_product(archived_app, BUNDLE, required)
            validate_product(archived_widget, WIDGET_BUNDLE, widget_required)
            export = temp / "ExportOptions.plist"
            export.write_bytes(plistlib.dumps({"method": "app-store-connect", "teamID": TEAM,
                "signingStyle": "manual", "signingCertificate": "Apple Distribution",
                "provisioningProfiles": {BUNDLE: main_profile["UUID"],
                    WIDGET_BUNDLE: widget_profile["UUID"]},
                "manageAppVersionAndBuildNumber": False}))
            run("xcodebuild", "-exportArchive", "-archivePath", str(archive),
                "-exportOptionsPlist", str(export), "-exportPath", str(temp / "export"))
            keys = temp / "private_keys"
            keys.mkdir(mode=0o700)
            key = keys / f"AuthKey_{key_id}.p8"
            shutil.copyfile(private_key, key)
            key.chmod(0o600)
            ipas = list((temp / "export").glob("*.ipa"))
            if len(ipas) != 1:
                raise SystemExit("Expected exactly one exported IPA.")
            extracted = temp / "exported-ipa"
            run("ditto", "-x", "-k", str(ipas[0]), str(extracted), capture_output=True)
            exported_apps = list((extracted / "Payload").glob("*.app"))
            if len(exported_apps) != 1:
                raise SystemExit("Expected exactly one exported application.")
            exported_widget = exported_apps[0] / "PlugIns/AscendWidgetExtension.appex"
            if not exported_widget.exists():
                raise SystemExit("Exported IPA is missing the Ascend Today widget extension.")
            validate_product(exported_apps[0], BUNDLE, required)
            validate_product(exported_widget, WIDGET_BUNDLE, widget_required)
            run("xcrun", "altool", "--upload-app", "--type", "ios", "--file", str(ipas[0]),
                "--apiKey", key_id, "--apiIssuer", os.environ["ASC_ISSUER_ID"], cwd=temp)
            print("Uploaded to App Store Connect. Wait for Apple processing before testing in TestFlight.")
        finally:
            if keychain.exists():
                subprocess.run(["security", "delete-keychain", str(keychain)], capture_output=True)
            for installed_profile in installed_profiles:
                installed_profile.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        # Do not print CalledProcessError: command arguments may contain a password.
        raise SystemExit("Apple signing or upload command failed. Check the preceding non-secret build output.") from None
