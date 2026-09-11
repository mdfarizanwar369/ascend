"""Archive, sign, and upload on an ephemeral GitHub macOS runner. Never prints secrets."""
import base64
import datetime
import os
from pathlib import Path
import plistlib
import secrets
import shutil
import subprocess
import tempfile

TEAM = "76N75VT6A7"
BUNDLE = "fit.getascend.app"


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def main():
    names = ("IOS_CERTIFICATE_BASE64", "IOS_CERTIFICATE_PASSWORD", "IOS_PROFILE_BASE64",
             "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY_BASE64")
    missing = [name for name in names if not os.environ.get(name)]
    if missing:
        raise SystemExit("Configure the apple-testflight environment secrets: " + ", ".join(missing))
    if os.environ.get("GITHUB_REF") != "refs/heads/main" or os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch":
        raise SystemExit("Release is allowed only through a manual run on main.")
    root = Path.cwd()
    installed_profile = None
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
            if profile.get("TeamIdentifier") != [TEAM] or profile["Entitlements"].get("application-identifier") != f"{TEAM}.{BUNDLE}":
                raise SystemExit("Provisioning profile does not match Ascend's team and bundle ID.")
            if profile.get("ProvisionedDevices") or profile.get("ProvisionsAllDevices") or profile["Entitlements"].get("get-task-allow"):
                raise SystemExit("An App Store distribution profile is required.")
            if profile["ExpirationDate"].replace(tzinfo=datetime.timezone.utc) <= datetime.datetime.now(datetime.timezone.utc):
                raise SystemExit("Provisioning profile has expired.")
            run("security", "create-keychain", "-p", password, str(keychain), capture_output=True)
            run("security", "set-keychain-settings", "-lut", "3600", str(keychain), capture_output=True)
            run("security", "unlock-keychain", "-p", password, str(keychain), capture_output=True)
            run("security", "import", str(certificate), "-P", os.environ["IOS_CERTIFICATE_PASSWORD"],
                "-t", "cert", "-f", "pkcs12", "-k", str(keychain), "-T", "/usr/bin/codesign", capture_output=True)
            run("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-k", password, str(keychain), capture_output=True)
            run("security", "list-keychains", "-d", "user", "-s", str(keychain), capture_output=True)
            profile_dir = Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles"
            profile_dir.mkdir(parents=True, exist_ok=True)
            installed_profile = profile_dir / f"{profile['UUID']}.mobileprovision"
            shutil.copyfile(profile_file, installed_profile)
            archive = temp / "Ascend.xcarchive"
            # Run number stays monotonic for this workflow; attempts get a separate component.
            build_number = f"{os.environ['GITHUB_RUN_NUMBER']}.{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}"
            run("xcodebuild", "-project", str(root / "ios/App/App.xcodeproj"), "-scheme", "App",
                "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", str(archive),
                # Only the App target consumes this custom setting. A global
                # provisioning override incorrectly applies to Swift packages.
                f"ASCEND_PROFILE_UUID={profile['UUID']}", f"CURRENT_PROJECT_VERSION={build_number}", "archive")
            export = temp / "ExportOptions.plist"
            export.write_bytes(plistlib.dumps({"method": "app-store-connect", "teamID": TEAM,
                "signingStyle": "manual", "signingCertificate": "Apple Distribution", "manageAppVersionAndBuildNumber": False,
                "provisioningProfiles": {BUNDLE: profile["UUID"]}}))
            run("xcodebuild", "-exportArchive", "-archivePath", str(archive), "-exportOptionsPlist", str(export), "-exportPath", str(temp / "export"))
            keys = temp / "private_keys"
            keys.mkdir(mode=0o700)
            key_id = os.environ["ASC_KEY_ID"]
            if not key_id.isalnum():
                raise SystemExit("Invalid App Store Connect key ID.")
            key = keys / f"AuthKey_{key_id}.p8"
            key.write_bytes(base64.b64decode(os.environ["ASC_PRIVATE_KEY_BASE64"], validate=True))
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
            if installed_profile:
                installed_profile.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        # Do not print CalledProcessError: command arguments may contain a password.
        raise SystemExit("Apple signing or upload command failed. Check the preceding non-secret build output.") from None
