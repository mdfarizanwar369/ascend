"""Exercise Apple release boundaries with fictional API responses, never credentials."""

import contextlib
import copy
import importlib.util
import io
import os
from pathlib import Path
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("app_store_release", Path(__file__).with_name("app-store-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

APP = "fictional-app"
BUILD = "fictional-build-222"
VERSION = "fictional-version-17"
SUBMISSION = "fictional-submission"


def version(state="PREPARE_FOR_SUBMISSION", number="1.7", identity=VERSION):
    return {"id": identity, "attributes": {
        "versionString": number, "platform": "IOS", "appStoreState": state, "releaseType": "MANUAL",
    }}


def build():
    return {"id": BUILD, "attributes": {
        "version": "222.1", "processingState": "VALID", "buildAudienceType": "APP_STORE_ELIGIBLE",
        "usesNonExemptEncryption": False,
    }}


class FakeClient:
    def __init__(self, reads=None, posts=None):
        self.reads = reads or {}
        self.posts = posts or {}
        self.calls = []

    def get(self, path, **params):
        self.calls.append(("GET", path, params))
        if path not in self.reads:
            raise AssertionError("Unexpected read: " + path)
        return copy.deepcopy(self.reads[path])

    def post(self, path, payload):
        self.calls.append(("POST", path, copy.deepcopy(payload)))
        if path not in self.posts:
            raise AssertionError("Unexpected creation: " + path)
        return copy.deepcopy(self.posts[path])

    def patch(self, path, payload):
        self.calls.append(("PATCH", path, copy.deepcopy(payload)))
        return None

    @property
    def mutations(self):
        return [call for call in self.calls if call[0] in {"POST", "PATCH"}]


def release_client(target=None, attached=BUILD):
    target = target if target is not None else version()
    versions = [version("READY_FOR_SALE", "1.6", "fictional-version-16")]
    if target:
        versions.insert(0, target)
    return FakeClient({
        "/v1/apps": {"data": [{"id": APP, "attributes": {"name": "Ascend", "bundleId": "fit.getascend.app"}}]},
        "/v1/builds": {"data": [build()]},
        f"/v1/builds/{BUILD}/preReleaseVersion": {"data": {"attributes": {"version": "1.7", "platform": "IOS"}}},
        f"/v1/apps/{APP}/appStoreVersions": {"data": versions},
        f"/v1/appStoreVersions/{VERSION}/appStoreVersionLocalizations": {"data": [{"id": "locale", "attributes": {"locale": "en-US"}}]},
        "/v1/appStoreVersionLocalizations/locale/appScreenshotSets": {"data": [{"id": "screenshots"}]},
        "/v1/appScreenshotSets/screenshots/appScreenshots": {"data": [{"id": "image"}]},
        f"/v1/appStoreVersions/{VERSION}/appStoreReviewDetail": {"data": {"id": "review-detail"}},
        f"/v1/appStoreVersions/{VERSION}/build": {"data": {"id": attached} if attached else None},
    })


def review_client(*, items=None, related=None, active_state="READY_FOR_REVIEW", final_state="WAITING_FOR_REVIEW"):
    reads = {
        f"/v1/apps/{APP}/reviewSubmissions": {"data": [{"id": SUBMISSION, "attributes": {"state": active_state}}]},
        f"/v1/reviewSubmissions/{SUBMISSION}/items": {"data": [{"id": identity} for identity in (items or [])]},
        f"/v1/reviewSubmissions/{SUBMISSION}": {"data": {"id": SUBMISSION, "attributes": {"state": final_state}}},
    }
    for identity, version_identity in (related or {}).items():
        reads[f"/v1/reviewSubmissionItems/{identity}/appStoreVersion"] = {
            "data": {"id": version_identity} if version_identity else None,
        }
    return FakeClient(reads, {"/v1/reviewSubmissionItems": {"data": {"id": "new-item"}}})


class ReleaseTestCase(unittest.TestCase):
    def setUp(self):
        self.output = io.StringIO()
        self.redirect = contextlib.redirect_stdout(self.output)
        self.redirect.__enter__()
        self.addCleanup(self.redirect.__exit__, None, None, None)

    def invoke_main(self, client, **overrides):
        settings = {
            "ASC_KEY_ID": "fictional-key", "ASC_ISSUER_ID": "fictional-issuer",
            "ASC_PRIVATE_KEY_BASE64": "fictional-value-not-a-key", "ASC_BUILD_NUMBER": "222.1",
            "ASC_VERSION_STRING": "1.7", "ASC_APP_STORE_ACTION": "inspect",
            "ASC_WHATS_NEW": "Appearance themes and matching widgets.",
        }
        settings.update(overrides)
        with patch.dict(os.environ, settings, clear=True), patch.object(release, "AppStoreConnect", return_value=client) as constructor:
            release.main()
        return constructor


class BuildSelectionTests(ReleaseTestCase):
    def test_exact_valid_ios_release_build_is_accepted_without_mutation(self):
        client = release_client()
        chosen = release.get_build(client, APP, "222.1", "1.7")
        self.assertEqual(chosen["id"], BUILD)
        self.assertEqual(client.calls[0][2]["filter[app]"], APP)
        self.assertEqual(client.calls[0][2]["filter[version]"], "222.1")
        self.assertEqual(client.mutations, [])

    def test_wrong_version_build_or_platform_is_rejected(self):
        for field, value in (("version", "1.6"), ("platform", "MAC_OS"), ("platform", None)):
            with self.subTest(field=field, value=value):
                client = release_client()
                client.reads[f"/v1/builds/{BUILD}/preReleaseVersion"]["data"]["attributes"][field] = value
                with self.assertRaises(RuntimeError):
                    release.get_build(client, APP, "222.1", "1.7")
                self.assertEqual(client.mutations, [])
        client = release_client()
        client.reads["/v1/builds"]["data"][0]["attributes"]["version"] = "223.1"
        with self.assertRaises(RuntimeError):
            release.get_build(client, APP, "222.1", "1.7")

    def test_unprocessed_or_ineligible_build_is_rejected(self):
        for field, value in (("processingState", "PROCESSING"), ("processingState", "FAILED"),
                             ("buildAudienceType", "INTERNAL_ONLY"), ("buildAudienceType", None)):
            with self.subTest(field=field, value=value):
                client = release_client()
                client.reads["/v1/builds"]["data"][0]["attributes"][field] = value
                with self.assertRaises(RuntimeError):
                    release.get_build(client, APP, "222.1", "1.7")
                self.assertEqual(client.mutations, [])

    def test_export_compliance_must_be_explicit_false(self):
        for value in (None, True, 0, "false"):
            with self.subTest(value=value):
                client = release_client()
                client.reads["/v1/builds"]["data"][0]["attributes"]["usesNonExemptEncryption"] = value
                with self.assertRaisesRegex(RuntimeError, "export compliance"):
                    release.get_build(client, APP, "222.1", "1.7")
                self.assertEqual(client.mutations, [])

    def test_missing_or_ambiguous_build_does_not_query_an_arbitrary_build(self):
        for candidates in ([], [build(), {**build(), "id": "another-build"}]):
            with self.subTest(count=len(candidates)):
                client = release_client()
                client.reads["/v1/builds"] = {"data": candidates}
                with self.assertRaises(RuntimeError):
                    release.get_build(client, APP, "222.1", "1.7")
                self.assertEqual(len(client.calls), 1)


class MainActionBoundaryTests(ReleaseTestCase):
    def test_unapproved_version_or_build_fails_before_client_construction(self):
        for override in ({"ASC_VERSION_STRING": "1.5"}, {"ASC_BUILD_NUMBER": "214.1"},
                         {"ASC_VERSION_STRING": "1.8"}, {"ASC_BUILD_NUMBER": "222.2"}):
            with self.subTest(override=override):
                with patch.dict(os.environ, {
                    "ASC_KEY_ID": "key", "ASC_ISSUER_ID": "issuer", "ASC_PRIVATE_KEY_BASE64": "not-a-key",
                    "ASC_BUILD_NUMBER": "222.1", "ASC_VERSION_STRING": "1.7", **override,
                }, clear=True), patch.object(release, "AppStoreConnect") as constructor:
                    with self.assertRaises(RuntimeError):
                        release.main()
                    constructor.assert_not_called()

    def test_inspect_missing_version_does_not_create_or_prepare_it(self):
        client = release_client(target=False)
        self.invoke_main(client)
        self.assertIn('"exists": false', self.output.getvalue())
        self.assertEqual(client.mutations, [])

    def test_inspect_existing_version_is_read_only_even_with_other_attached_build(self):
        client = release_client(attached="another-build")
        self.invoke_main(client)
        self.assertEqual(client.mutations, [])

    def test_submit_wrong_or_missing_attached_build_never_mutates(self):
        for attached in ("another-build", None):
            with self.subTest(attached=attached):
                client = release_client(attached=attached)
                with self.assertRaisesRegex(RuntimeError, "exact requested build"):
                    self.invoke_main(client, ASC_APP_STORE_ACTION="submit")
                self.assertEqual(client.mutations, [])

    def test_prepare_cannot_modify_active_or_published_release(self):
        for state in ("WAITING_FOR_REVIEW", "IN_REVIEW", "READY_FOR_SALE", "PENDING_DEVELOPER_RELEASE"):
            with self.subTest(state=state):
                client = release_client(target=version(state))
                with self.assertRaisesRegex(RuntimeError, "Cannot modify release details"):
                    self.invoke_main(client, ASC_APP_STORE_ACTION="prepare")
                self.assertEqual(client.mutations, [])

    def test_already_submitted_exact_build_is_confirmed_without_new_submission(self):
        for state in ("WAITING_FOR_REVIEW", "IN_REVIEW"):
            with self.subTest(state=state):
                client = release_client(target=version(state))
                self.invoke_main(client, ASC_APP_STORE_ACTION="submit")
                self.assertEqual(client.mutations, [])
        self.assertIn("ALREADY_SUBMITTED", self.output.getvalue())

    def test_already_submitted_does_not_bypass_exact_attachment_check(self):
        client = release_client(target=version("WAITING_FOR_REVIEW"), attached="another-build")
        with self.assertRaisesRegex(RuntimeError, "exact requested build"):
            self.invoke_main(client, ASC_APP_STORE_ACTION="submit")
        self.assertNotIn("ALREADY_SUBMITTED", self.output.getvalue())
        self.assertEqual(client.mutations, [])


class ReviewSubmissionTests(ReleaseTestCase):
    def test_foreign_ready_draft_item_is_not_submitted_or_modified(self):
        client = review_client(items=["foreign-item"], related={"foreign-item": "other-version"})
        with self.assertRaisesRegex(RuntimeError, "different App Store version"):
            release.submit_for_review(client, APP, version())
        self.assertEqual(client.mutations, [])

    def test_unrelated_review_item_is_rejected_without_mutation(self):
        client = review_client(items=["other-content-item"], related={"other-content-item": None})
        with self.assertRaises(RuntimeError):
            release.submit_for_review(client, APP, version())
        self.assertEqual(client.mutations, [])

    def test_exact_existing_draft_reuses_item_and_submits_once(self):
        client = review_client(items=["exact-item"], related={"exact-item": VERSION})
        release.submit_for_review(client, APP, version())
        self.assertEqual([call[0] for call in client.mutations], ["PATCH"])
        self.assertEqual(client.mutations[0][1], f"/v1/reviewSubmissions/{SUBMISSION}")
        self.assertEqual(client.mutations[0][2]["data"]["attributes"], {"submitted": True})
        self.assertIn('"state": "WAITING_FOR_REVIEW"', self.output.getvalue())

    def test_empty_ready_draft_adds_only_requested_version(self):
        client = review_client()
        release.submit_for_review(client, APP, version())
        self.assertEqual([call[0] for call in client.mutations], ["POST", "PATCH"])
        item = client.mutations[0][2]["data"]["relationships"]
        self.assertEqual(item["appStoreVersion"]["data"]["id"], VERSION)
        self.assertEqual(item["reviewSubmission"]["data"]["id"], SUBMISSION)

    def test_foreign_review_in_progress_prevents_new_submission(self):
        for state in ("WAITING_FOR_REVIEW", "IN_REVIEW"):
            with self.subTest(state=state):
                client = review_client(active_state=state)
                with self.assertRaisesRegex(RuntimeError, "already waiting"):
                    release.submit_for_review(client, APP, version())
                self.assertEqual(client.mutations, [])

    def test_unexpected_confirmation_state_is_not_reported_as_submitted(self):
        client = review_client(items=["exact-item"], related={"exact-item": VERSION}, final_state="READY_FOR_REVIEW")
        with self.assertRaisesRegex(RuntimeError, "did not confirm"):
            release.submit_for_review(client, APP, version())
        self.assertEqual([call[0] for call in client.mutations], ["PATCH"])


if __name__ == "__main__":
    unittest.main()
