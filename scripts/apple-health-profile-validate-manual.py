"""Validate a manually downloaded Ascend profile against current signing before use."""
import base64
import importlib.util
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile


def main():
    spec = importlib.util.spec_from_file_location(
        "health_profile_prepare", Path(__file__).with_name("apple-health-profile-prepare.py"))
    profile_tools = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(profile_tools)
    profile_tools.validate_context(os.environ)

    with tempfile.TemporaryDirectory(prefix="ascend-manual-profile-") as directory:
        def decode(name):
            file = Path(directory) / f"{name}.mobileprovision"
            file.write_bytes(base64.b64decode(os.environ[name], validate=True))
            file.chmod(0o600)
            result = subprocess.run(["security", "cms", "-D", "-i", str(file)],
                                    capture_output=True, check=True)
            return plistlib.loads(result.stdout)

        original = decode("IOS_PROFILE_BASE64")
        candidate = decode("MANUAL_PROFILE_BASE64")
        profile_tools.validate_profile(original, original, require_health=False)
        profile_tools.validate_profile(candidate, original)

    print("MANUAL_HEALTH_PROFILE_VALIDATED", "existing certificate and entitlements preserved")


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, ValueError, KeyError):
        raise SystemExit("Manual profile validation failed; no signing material was printed.") from None
