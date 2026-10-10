"""Exercise the signing boundary before any Apple credential is used."""
import importlib.util
import datetime
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("ios_release", Path(__file__).with_name("ios-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseContextTests(unittest.TestCase):
    def context(self, branch="main"):
        return {"GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_REF": "refs/heads/" + branch,
                "GITHUB_REPOSITORY": "mdfarizanwar369/ascend"}

    def config(self, origin="https://www.getascend.fit/"):
        return {"appId": release.BUNDLE, "server": {"url": origin, "appStartPath": "/launch", "cleartext": False}}

    def test_manual_main_release(self):
        release.validate_release_context(self.context(), self.config())

    def test_manual_ios_1_2_release_candidate(self):
        release.validate_release_context(self.context("codex/ios-1.2-public-trainer-pro"), self.config())

    def test_manual_apple_health_candidate(self):
        with self.assertRaises(SystemExit):
            release.validate_release_context(self.context("codex/apple-health-v1"), self.config())

    def test_payment_beta_requires_its_isolated_origin(self):
        context = self.context("codex/ios-subscriptions-1-1")
        with self.assertRaises(SystemExit):
            release.validate_release_context(context, self.config())
        release.validate_release_context(context, self.config(release.RELEASE_ORIGINS[context["GITHUB_REF"]]))

    def test_automatic_runs_other_branches_and_forks_cannot_sign(self):
        for override in ({"GITHUB_EVENT_NAME": "pull_request"}, {"GITHUB_EVENT_NAME": "push"},
                         {"GITHUB_REF": "refs/heads/unapproved"}, {"GITHUB_REF": "refs/tags/main"},
                         {"GITHUB_REPOSITORY": "another/ascend"}):
            with self.subTest(override=override), self.assertRaises(SystemExit):
                release.validate_release_context({**self.context(), **override}, self.config())

    def test_wrong_app_or_insecure_launch_is_rejected(self):
        for config in ({**self.config(), "appId": "another.app"},
                       {**self.config(), "server": {**self.config()["server"], "cleartext": True}},
                       {**self.config(), "server": {**self.config()["server"], "appStartPath": "/other"}}):
            with self.subTest(config=config), self.assertRaises(SystemExit):
                release.validate_release_context(self.context(), config)


class HealthSigningTests(unittest.TestCase):
    required = {"com.apple.developer.healthkit": True, "com.apple.developer.healthkit.background-delivery": True,
                "com.apple.security.application-groups": [release.APP_GROUP]}

    def entitlements(self):
        return {"application-identifier": f"{release.TEAM}.{release.BUNDLE}", "com.apple.developer.applesignin": ["Default"], **self.required}

    def profile(self):
        return {"TeamIdentifier": [release.TEAM], "Entitlements": self.entitlements(),
                "ExpirationDate": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30)}

    def test_matching_distribution_profile_and_signed_app(self):
        release.validate_profile(self.profile(), release.BUNDLE, self.required)
        release.validate_signed_entitlements(self.entitlements(), release.BUNDLE, self.required)

    def test_health_archive_needs_both_usage_descriptions_for_apple_upload(self):
        info = {"NSHealthShareUsageDescription": "Read activity", "NSHealthUpdateUsageDescription": "Read-only HealthKit use"}
        release.validate_health_usage_descriptions(info, self.required)
        for key in info:
            with self.subTest(key=key), self.assertRaises(SystemExit):
                release.validate_health_usage_descriptions({**info, key: " "}, self.required)

    def test_health_entitlements_must_exist_in_profile_and_binary(self):
        for capability in self.required:
            profile = self.profile()
            del profile["Entitlements"][capability]
            with self.subTest(capability=capability), self.assertRaises(SystemExit):
                release.validate_profile(profile, release.BUNDLE, self.required)
            with self.subTest(binary=capability), self.assertRaises(SystemExit):
                release.validate_signed_entitlements(profile["Entitlements"], release.BUNDLE, self.required)

    def test_wrong_team_expired_and_development_profiles_are_rejected(self):
        for override in ({"TeamIdentifier": ["OTHER"]}, {"ProvisionedDevices": ["device"]},
                         {"ExpirationDate": datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)}):
            with self.subTest(override=override), self.assertRaises(SystemExit):
                release.validate_profile({**self.profile(), **override}, release.BUNDLE, self.required)

    def test_wrong_identity_and_debug_binary_are_rejected(self):
        for override in ({"application-identifier": "wrong.app"}, {"get-task-allow": True},
                         {"com.apple.developer.applesignin": []}):
            with self.subTest(override=override), self.assertRaises(SystemExit):
                release.validate_signed_entitlements({**self.entitlements(), **override}, release.BUNDLE, self.required)

    def test_widget_profile_requires_widget_identity_and_shared_app_group(self):
        required = {"com.apple.security.application-groups": [release.APP_GROUP]}
        entitlements = {"application-identifier": f"{release.TEAM}.{release.WIDGET_BUNDLE}",
                        "com.apple.security.application-groups": [release.APP_GROUP]}
        profile = {"TeamIdentifier": [release.TEAM], "Entitlements": entitlements,
                   "ExpirationDate": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30)}
        release.validate_profile(profile, release.WIDGET_BUNDLE, required)
        release.validate_signed_entitlements(entitlements, release.WIDGET_BUNDLE, required)
        with self.assertRaises(SystemExit):
            release.validate_profile({**profile, "Entitlements": {**entitlements,
                "com.apple.security.application-groups": []}}, release.WIDGET_BUNDLE, required)


class ProvisioningAPITests(unittest.TestCase):
    class API:
        def __init__(self, responses):
            self.responses = list(responses)
            self.calls = []

        def request(self, *args, **kwargs):
            self.calls.append((args, kwargs))
            return self.responses.pop(0)

    def test_existing_bundle_and_capability_are_reused(self):
        api = self.API([[{"id": "bundle-id"}], [{"attributes": {"capabilityType": "APP_GROUPS"}}]])
        self.assertEqual(release.get_or_create_bundle(api, release.WIDGET_BUNDLE, "Widget")["id"], "bundle-id")
        release.enable_capability(api, "bundle-id", "APP_GROUPS")
        self.assertEqual([call[0][0] for call in api.calls], ["GET", "GET"])

    def test_missing_bundle_capability_and_profile_are_created(self):
        created_bundle = {"id": "bundle-id"}
        created_profile = {"id": "profile-id", "attributes": {"profileState": "ACTIVE"}}
        api = self.API([[], created_bundle, [], None, [], created_profile])
        self.assertEqual(release.get_or_create_bundle(api, release.WIDGET_BUNDLE, "Widget"), created_bundle)
        release.enable_capability(api, "bundle-id", "APP_GROUPS")
        self.assertEqual(release.get_or_create_profile(api, "Widget profile", "bundle-id", "certificate-id"), created_profile)
        self.assertEqual([call[0][0] for call in api.calls], ["GET", "POST", "GET", "POST", "GET", "POST"])


if __name__ == "__main__":
    unittest.main()
