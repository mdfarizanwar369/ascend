import datetime
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("health_profile", Path(__file__).with_name("apple-health-profile-prepare.py"))
profile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(profile)


class HealthProfilePreparationTests(unittest.TestCase):
    def fixture(self):
        return {"TeamIdentifier": [profile.TEAM], "ExpirationDate": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=90),
            "DeveloperCertificates": [b"public-fixture-certificate"], "Entitlements": {
                "application-identifier": f"{profile.TEAM}.{profile.BUNDLE}", "get-task-allow": False,
                "com.apple.developer.applesignin": ["Default"], "com.apple.developer.associated-domains": ["*"],
                **{key: True for key in profile.HEALTH_KEYS}}}

    def test_existing_identity_and_health_profile(self):
        profile.validate_profile(self.fixture(), self.fixture())

    def test_missing_health_does_not_replace_existing_secret(self):
        for key in profile.HEALTH_KEYS:
            fixture = self.fixture()
            del fixture["Entitlements"][key]
            with self.assertRaises(SystemExit):
                profile.validate_profile(fixture, self.fixture())

    def test_existing_capabilities_and_certificate_are_preserved(self):
        for changed in ("entitlement", "certificate", "apple-signin"):
            fixture = self.fixture()
            if changed == "entitlement":
                fixture["Entitlements"]["com.apple.developer.associated-domains"] = []
            elif changed == "certificate":
                fixture["DeveloperCertificates"] = [b"unrelated-certificate"]
            else:
                fixture["Entitlements"]["com.apple.developer.applesignin"] = []
            with self.assertRaises(SystemExit):
                profile.validate_profile(fixture, self.fixture())

    def test_wrong_identity_or_debug_profile_is_rejected(self):
        for changed in ("team", "bundle", "debug", "expired"):
            fixture = self.fixture()
            if changed == "team": fixture["TeamIdentifier"] = ["another"]
            elif changed == "bundle": fixture["Entitlements"]["application-identifier"] = "another"
            elif changed == "debug": fixture["Entitlements"]["get-task-allow"] = True
            else: fixture["ExpirationDate"] = datetime.datetime(2020, 1, 1)
            with self.assertRaises(SystemExit):
                profile.validate_profile(fixture, self.fixture())

    def test_only_authorized_manual_main_preparation_is_allowed(self):
        approved = {"GITHUB_REPOSITORY": "mdfarizanwar369/ascend", "GITHUB_REF": "refs/heads/main",
            "GITHUB_EVENT_NAME": "workflow_dispatch", "PROFILE_PREPARATION_APPROVED": "true"}
        profile.validate_context(approved)
        for key, value in (("GITHUB_REF", "refs/heads/feature"), ("GITHUB_REPOSITORY", "another/repository"),
                ("GITHUB_EVENT_NAME", "pull_request"), ("PROFILE_PREPARATION_APPROVED", "false")):
            with self.assertRaises(SystemExit):
                profile.validate_context({**approved, key: value})


if __name__ == "__main__":
    unittest.main()
