"""Prepare and submit Ascend's existing App Store record using App Store Connect.

The script is intentionally idempotent. It only targets the exact Ascend bundle,
iOS version and processed build supplied by the protected release workflow.
"""

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt


BUNDLE_ID = "fit.getascend.app"
DEFAULT_VERSION = "1.4"
ALLOWED_ACTIONS = {"inspect", "prepare", "submit"}
RELEASABLE_STATES = {"PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW"}
ACTIVE_REVIEW_STATES = {"READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW"}


def apple_error(method, path, error):
    body = error.read().decode("utf-8", "replace")
    try:
        parsed = json.loads(body)
        details = []
        for item in parsed.get("errors", []):
            details.append({
                "status": item.get("status"),
                "code": item.get("code"),
                "title": item.get("title"),
                "detail": item.get("detail"),
                "source": item.get("source"),
            })
        body = json.dumps(details, sort_keys=True)
    except json.JSONDecodeError:
        body = body[:2000]
    raise RuntimeError(f"App Store Connect {method} {path}: HTTP {error.code}: {body}") from error


class AppStoreConnect:
    def __init__(self):
        now = int(time.time())
        private_key = base64.b64decode(os.environ["ASC_PRIVATE_KEY_BASE64"], validate=True)
        self.token = jwt.encode(
            {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
            private_key,
            algorithm="ES256",
            headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"},
        )

    def request(self, method, path, *, params=None, payload=None):
        url = "https://api.appstoreconnect.apple.com" + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {"Authorization": f"Bearer {self.token}"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                if response.status == 204:
                    return None
                return json.load(response)
        except urllib.error.HTTPError as error:
            apple_error(method, path, error)

    def get(self, path, **params):
        return self.request("GET", path, params=params)

    def post(self, path, payload):
        return self.request("POST", path, payload=payload)

    def patch(self, path, payload):
        return self.request("PATCH", path, payload=payload)


def require_one(items, label):
    if len(items) != 1:
        raise RuntimeError(f"Expected exactly one {label}; found {len(items)}")
    return items[0]


def version_summary(version):
    attrs = version.get("attributes", {})
    return {
        "id": version["id"],
        "version": attrs.get("versionString"),
        "platform": attrs.get("platform"),
        "state": attrs.get("appStoreState") or attrs.get("appVersionState"),
        "releaseType": attrs.get("releaseType"),
    }


def get_app(client):
    apps = client.get("/v1/apps", **{"filter[bundleId]": BUNDLE_ID, "limit": 5})["data"]
    app = require_one(apps, "Ascend app")
    print("APP", json.dumps({"id": app["id"], "name": app["attributes"].get("name"), "bundleId": BUNDLE_ID}))
    return app


def get_build(client, app_id, build_number, version_string):
    builds = client.get(
        "/v1/builds",
        **{"filter[app]": app_id, "filter[version]": build_number, "limit": 20},
    )["data"]
    build = require_one(builds, f"build {build_number}")
    attrs = build.get("attributes", {})
    pre_release = client.get(f"/v1/builds/{build['id']}/preReleaseVersion")["data"]
    summary = {
        "id": build["id"],
        "version": pre_release.get("attributes", {}).get("version"),
        "buildNumber": attrs.get("version"),
        "processingState": attrs.get("processingState"),
        "audience": attrs.get("buildAudienceType"),
    }
    print("TARGET_BUILD", json.dumps(summary, sort_keys=True))
    if summary["version"] != version_string or summary["buildNumber"] != build_number:
        raise RuntimeError("The selected build does not match the requested App Store version")
    if summary["processingState"] != "VALID" or summary["audience"] != "APP_STORE_ELIGIBLE":
        raise RuntimeError("The selected build is not valid and App Store eligible")
    return build


def list_versions(client, app_id):
    versions = client.get(
        f"/v1/apps/{app_id}/appStoreVersions",
        **{"filter[platform]": "IOS", "limit": 200},
    )["data"]
    for version in versions:
        print("APP_STORE_VERSION", json.dumps(version_summary(version), sort_keys=True))
    return versions


def create_version(client, app_id, source, version_string):
    source_attrs = source.get("attributes", {})
    attributes = {
        "platform": "IOS",
        "versionString": version_string,
        "releaseType": source_attrs.get("releaseType") or "AFTER_APPROVAL",
        "usesIdfa": bool(source_attrs.get("usesIdfa")),
    }
    if source_attrs.get("copyright"):
        attributes["copyright"] = source_attrs["copyright"]
    response = client.post("/v1/appStoreVersions", {
        "data": {
            "type": "appStoreVersions",
            "attributes": attributes,
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
        }
    })
    version = response["data"]
    print("CREATED_APP_STORE_VERSION", json.dumps(version_summary(version), sort_keys=True))
    return version


def update_release_notes(client, version_id):
    localizations = client.get(f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations", limit=200)["data"]
    if not localizations:
        raise RuntimeError("The new App Store version did not inherit any localizations")
    whats_new = os.environ.get("ASC_WHATS_NEW", "").strip()
    if not whats_new:
        raise RuntimeError("ASC_WHATS_NEW is required for the new App Store version")
    for localization in localizations:
        client.patch(f"/v1/appStoreVersionLocalizations/{localization['id']}", {
            "data": {
                "type": "appStoreVersionLocalizations",
                "id": localization["id"],
                "attributes": {"whatsNew": whats_new},
            }
        })
        print("UPDATED_RELEASE_NOTES", json.dumps({"locale": localization["attributes"].get("locale")}))
    return localizations


def attach_build(client, version_id, build_id):
    client.patch(f"/v1/appStoreVersions/{version_id}/relationships/build", {
        "data": {"type": "builds", "id": build_id}
    })
    attached = client.get(f"/v1/appStoreVersions/{version_id}/build")["data"]
    if not attached or attached.get("id") != build_id:
        raise RuntimeError("Could not verify the App Store build attachment")
    print("BUILD_ATTACHMENT", json.dumps({"buildId": build_id, "verified": True}))


def inspect_version_readiness(client, version):
    version_id = version["id"]
    localizations = client.get(f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations", limit=200)["data"]
    if not localizations:
        raise RuntimeError("App Store version has no localization")
    total_sets = 0
    total_screenshots = 0
    locales = []
    for localization in localizations:
        attrs = localization.get("attributes", {})
        locales.append(attrs.get("locale"))
        sets = client.get(f"/v1/appStoreVersionLocalizations/{localization['id']}/appScreenshotSets", limit=200)["data"]
        total_sets += len(sets)
        for screenshot_set in sets:
            total_screenshots += len(client.get(f"/v1/appScreenshotSets/{screenshot_set['id']}/appScreenshots", limit=200)["data"])
    review_detail = client.get(f"/v1/appStoreVersions/{version_id}/appStoreReviewDetail").get("data")
    build = client.get(f"/v1/appStoreVersions/{version_id}/build").get("data")
    readiness = {
        "locales": sorted(locale for locale in locales if locale),
        "screenshotSets": total_sets,
        "screenshots": total_screenshots,
        "hasReviewDetail": bool(review_detail),
        "attachedBuildId": build.get("id") if build else None,
    }
    print("VERSION_READINESS", json.dumps(readiness, sort_keys=True))
    if total_screenshots < 1:
        raise RuntimeError("App Store version has no inherited screenshots")
    if not review_detail:
        raise RuntimeError("App Store version has no inherited review details")
    return readiness


def submit_for_review(client, app_id, version):
    state = version_summary(version)["state"]
    if state not in RELEASABLE_STATES:
        raise RuntimeError(f"Version is not ready to submit from state {state}")

    submissions = client.get(
        f"/v1/apps/{app_id}/reviewSubmissions",
        **{"filter[platform]": "IOS", "limit": 200},
    )["data"]
    active = [item for item in submissions if item.get("attributes", {}).get("state") in ACTIVE_REVIEW_STATES]
    waiting = [item for item in active if item.get("attributes", {}).get("state") in {"WAITING_FOR_REVIEW", "IN_REVIEW"}]
    if waiting:
        raise RuntimeError("Another iOS review submission is already waiting for review or in review")
    ready = [item for item in active if item.get("attributes", {}).get("state") == "READY_FOR_REVIEW"]
    if len(ready) > 1:
        raise RuntimeError("More than one ready iOS review submission exists")
    if ready:
        submission = ready[0]
    else:
        submission = client.post("/v1/reviewSubmissions", {
            "data": {
                "type": "reviewSubmissions",
                "attributes": {"platform": "IOS"},
                "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
            }
        })["data"]
        print("CREATED_REVIEW_SUBMISSION", json.dumps({"id": submission["id"]}))

    items = client.get(f"/v1/reviewSubmissions/{submission['id']}/items", limit=200)["data"]
    version_ids = set()
    for item in items:
        related = client.get(f"/v1/reviewSubmissionItems/{item['id']}/appStoreVersion").get("data")
        if related:
            version_ids.add(related["id"])
    if version["id"] not in version_ids:
        client.post("/v1/reviewSubmissionItems", {
            "data": {
                "type": "reviewSubmissionItems",
                "relationships": {
                    "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": submission["id"]}},
                    "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version["id"]}},
                },
            }
        })
        print("ADDED_REVIEW_ITEM", json.dumps({"versionId": version["id"]}))

    client.patch(f"/v1/reviewSubmissions/{submission['id']}", {
        "data": {
            "type": "reviewSubmissions",
            "id": submission["id"],
            "attributes": {"submitted": True},
        }
    })
    verified = client.get(f"/v1/reviewSubmissions/{submission['id']}")["data"]
    verified_state = verified.get("attributes", {}).get("state")
    print("REVIEW_SUBMISSION", json.dumps({"id": submission["id"], "state": verified_state}))
    if verified_state not in {"WAITING_FOR_REVIEW", "IN_REVIEW"}:
        raise RuntimeError(f"Apple did not confirm review submission; state is {verified_state}")


def main():
    required = ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY_BASE64", "ASC_BUILD_NUMBER"]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError("Missing protected release settings: " + ", ".join(missing))
    action = os.environ.get("ASC_APP_STORE_ACTION", "inspect").strip().lower()
    if action not in ALLOWED_ACTIONS:
        raise RuntimeError(f"Unsupported App Store action: {action}")
    version_string = os.environ.get("ASC_VERSION_STRING", DEFAULT_VERSION).strip()
    build_number = os.environ["ASC_BUILD_NUMBER"].strip()
    if version_string != DEFAULT_VERSION:
        raise RuntimeError("This release automation is restricted to Ascend iOS 1.4")

    client = AppStoreConnect()
    app = get_app(client)
    build = get_build(client, app["id"], build_number, version_string)
    versions = list_versions(client, app["id"])
    targets = [item for item in versions if item.get("attributes", {}).get("versionString") == version_string]
    if len(targets) > 1:
        raise RuntimeError("More than one iOS 1.4 App Store version exists")

    target = targets[0] if targets else None
    if action in {"prepare", "submit"} and not target:
        sources = [item for item in versions if item.get("attributes", {}).get("appStoreState") == "READY_FOR_SALE"]
        if not sources:
            raise RuntimeError("No live App Store version is available to transfer metadata from")
        source = max(sources, key=lambda item: tuple(int(part) for part in item["attributes"]["versionString"].split(".")))
        target = create_version(client, app["id"], source, version_string)

    if not target:
        print("TARGET_VERSION", json.dumps({"version": version_string, "exists": False}))
        return

    if action == "prepare":
        update_release_notes(client, target["id"])
        attach_build(client, target["id"], build["id"])
        target = client.get(f"/v1/appStoreVersions/{target['id']}")["data"]

    readiness = inspect_version_readiness(client, target)
    if readiness["attachedBuildId"] != build["id"]:
        if action == "submit":
            raise RuntimeError("The exact requested build is not attached to iOS 1.4")
    if action == "submit":
        submit_for_review(client, app["id"], target)


if __name__ == "__main__":
    main()
