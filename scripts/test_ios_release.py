"""Exercise the signing boundary before any Apple credential is used."""
import importlib.util
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


if __name__ == "__main__":
    unittest.main()
