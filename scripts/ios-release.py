"""Archive, sign, and upload on an ephemeral GitHub macOS runner. Never prints secrets."""
import base64
import datetime
import json
import os
from pathlib import Path
import plistlib
import secrets
import shutil
import subprocess
import tempfile

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
            authentication = ("-allowProvisioningUpdates", "-authenticationKeyPath", str(private_key),
                "-authenticationKeyID", key_id,
                "-authenticationKeyIssuerID", os.environ["ASC_ISSUER_ID"])
            archive = temp / "Ascend.xcarchive"
            # Run number stays monotonic for this workflow; attempts get a separate component.
            build_number = f"{os.environ['GITHUB_RUN_NUMBER']}.{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}"
            run("xcodebuild", "-project", str(root / "ios/App/App.xcodeproj"), "-scheme", "App", *authentication,
                "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", str(archive),
                "CODE_SIGN_STYLE=Automatic", f"DEVELOPMENT_TEAM={TEAM}",
                f"CURRENT_PROJECT_VERSION={build_number}", "archive")
            archived_app = archive / "Products/Applications/App.app"
            run("codesign", "--verify", "--deep", "--strict", str(archived_app), capture_output=True)
            archived_widget = archived_app / "PlugIns/AscendWidgetExtension.appex"
            if not archived_widget.exists():
                raise SystemExit("Archived app is missing the Ascend Today widget extension.")
            for product, bundle, entitlements in ((archived_app, BUNDLE, required),
                                                   (archived_widget, WIDGET_BUNDLE, widget_required)):
                embedded = product / "embedded.mobileprovision"
                if not embedded.exists():
                    raise SystemExit("Archived product is missing its distribution provisioning profile.")
                archived_profile = plistlib.loads(run("security", "cms", "-D", "-i", str(embedded), capture_output=True).stdout)
                validate_profile(archived_profile, bundle, entitlements)
            signed = run("codesign", "-d", "--entitlements", ":-", str(archived_app), capture_output=True)
            validate_signed_entitlements(plistlib.loads(signed.stdout), BUNDLE, required)
            run("codesign", "--verify", "--strict", str(archived_widget), capture_output=True)
            widget_signed = run("codesign", "-d", "--entitlements", ":-", str(archived_widget), capture_output=True)
            validate_signed_entitlements(plistlib.loads(widget_signed.stdout), WIDGET_BUNDLE, widget_required)
            export = temp / "ExportOptions.plist"
            export.write_bytes(plistlib.dumps({"method": "app-store-connect", "teamID": TEAM,
                "signingStyle": "automatic", "manageAppVersionAndBuildNumber": False}))
            run("xcodebuild", "-exportArchive", *authentication, "-archivePath", str(archive),
                "-exportOptionsPlist", str(export), "-exportPath", str(temp / "export"))
            keys = temp / "private_keys"
            keys.mkdir(mode=0o700)
            key = keys / f"AuthKey_{key_id}.p8"
            shutil.copyfile(private_key, key)
            key.chmod(0o600)
            ipas = list((temp / "export").glob("*.ipa"))
            if len(ipas) != 1:
                raise SystemExit("Expected exactly one exported IPA.")
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
