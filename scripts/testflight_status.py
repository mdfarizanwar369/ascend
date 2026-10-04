"""Read Ascend's TestFlight processing and group assignment using App Store Connect."""

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt


def get(path, **params):
    query = urllib.parse.urlencode(params)
    url = "https://api.appstoreconnect.apple.com" + path
    if query:
        url += "?" + query
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"App Store Connect {path}: HTTP {error.code}: {body[:1200]}") from error


def assign_build_to_group(group_id, build_id):
    path = f"/v1/betaGroups/{group_id}/relationships/builds"
    request = urllib.request.Request(
        "https://api.appstoreconnect.apple.com" + path,
        data=json.dumps({"data": [{"type": "builds", "id": build_id}]}).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"App Store Connect {path}: HTTP {error.code}: {body[:1200]}") from error


def assign_build_to_tester(build_id, tester_id):
    path = f"/v1/builds/{build_id}/relationships/individualTesters"
    request = urllib.request.Request(
        "https://api.appstoreconnect.apple.com" + path,
        data=json.dumps({"data": [{"type": "betaTesters", "id": tester_id}]}).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"App Store Connect {path}: HTTP {error.code}: {body[:1200]}") from error


now = int(time.time())
private_key = base64.b64decode(os.environ["ASC_PRIVATE_KEY_BASE64"], validate=True)
TOKEN = jwt.encode(
    {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
    private_key,
    algorithm="ES256",
    headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"},
)

apps = get("/v1/apps", **{"filter[bundleId]": "fit.getascend.app", "limit": 5})["data"]
if len(apps) != 1:
    raise SystemExit(f"Expected one Ascend app; found {len(apps)}")
app = apps[0]
app_id = app["id"]
print("APP", json.dumps({"id": app_id, "name": app["attributes"].get("name"), "bundleId": app["attributes"].get("bundleId")}))

try:
    uploads = get(f"/v1/apps/{app_id}/buildUploads", limit=20)["data"]
    for upload in uploads[:10]:
        attrs = upload.get("attributes", {})
        print("UPLOAD", json.dumps({"id": upload["id"], "attributes": attrs}, sort_keys=True))
except RuntimeError as error:
    print("UPLOAD_QUERY_ERROR", str(error))

build_number = os.environ.get("ASC_BUILD_NUMBER", "66.1")
builds = get(
    "/v1/builds",
    **{"filter[app]": app_id, "filter[version]": build_number, "include": "preReleaseVersion", "limit": 20},
)["data"]
print("MATCHING_BUILDS", build_number, len(builds))
groups = get(f"/v1/apps/{app_id}/betaGroups", limit=200)["data"]
try:
    account_holders = get("/v1/users", **{"filter[roles]": "ACCOUNT_HOLDER", "limit": 200})["data"]
    account_holder_emails = {
        user.get("attributes", {}).get("username", "").strip().lower() for user in account_holders
    }
    print("ACCOUNT_HOLDERS", len(account_holder_emails))
except RuntimeError as error:
    print("ACCOUNT_HOLDER_QUERY_ERROR", str(error))
    account_holder_emails = set()
for build in builds:
    attrs = build.get("attributes", {})
    build_id = build["id"]
    version = get(f"/v1/builds/{build_id}/preReleaseVersion")["data"]["attributes"].get("version")
    try:
        detail = get(f"/v1/builds/{build_id}/buildBetaDetail")["data"]["attributes"]
    except RuntimeError as error:
        print("BETA_DETAIL_QUERY_ERROR", str(error))
        detail = {}
    print("BUILD", json.dumps({
        "id": build_id,
        "appVersion": version,
        "buildNumber": attrs.get("version"),
        "uploadedDate": attrs.get("uploadedDate"),
        "processingState": attrs.get("processingState"),
        "buildAudienceType": attrs.get("buildAudienceType"),
        "usesNonExemptEncryption": attrs.get("usesNonExemptEncryption"),
        "internalBuildState": detail.get("internalBuildState"),
        "externalBuildState": detail.get("externalBuildState"),
    }, sort_keys=True))
    matching_owner_testers = []
    for group in groups:
        group_id = group["id"]
        testers = get(f"/v1/betaGroups/{group_id}/betaTesters", limit=200)["data"]
        try:
            assigned_ids = {
                item["id"] for item in get(f"/v1/betaGroups/{group_id}/relationships/builds", limit=200)["data"]
            }
        except RuntimeError as error:
            print("GROUP_BUILDS_QUERY_ERROR", str(error))
            assigned_ids = set()
        group_attrs = group["attributes"]
        matching_owner_testers.extend(
            tester for tester in testers
            if tester.get("attributes", {}).get("email", "").strip().lower() in account_holder_emails
        )
        print("GROUP", json.dumps({
            "name": group_attrs.get("name"),
            "internal": group_attrs.get("isInternalGroup"),
            "allBuilds": group_attrs.get("hasAccessToAllBuilds"),
            "buildAssigned": build_id in assigned_ids,
            "testerCount": len(testers),
            "testerStates": [tester.get("attributes", {}).get("state") for tester in testers],
        }, sort_keys=True))
        if os.environ.get("ASC_ASSIGN_INTERNAL_BUILD") == "true" and (
            version == "1.4"
            and attrs.get("version") == "66.1"
            and attrs.get("processingState") == "VALID"
            and detail.get("internalBuildState") == "READY_FOR_BETA_TESTING"
            and group_attrs.get("name") == "Ascend Internal"
            and group_attrs.get("isInternalGroup") is True
            and len(testers) == 1
            and build_id not in assigned_ids
        ):
            status = assign_build_to_group(group_id, build_id)
            new_ids = {
                item["id"] for item in get(f"/v1/betaGroups/{group_id}/relationships/builds", limit=200)["data"]
            }
            print("ASSIGNMENT", json.dumps({"status": status, "verified": build_id in new_ids}))
    matching_owner_testers = {tester["id"]: tester for tester in matching_owner_testers}
    print("OWNER_TESTER_MATCHES", len(matching_owner_testers))
    if os.environ.get("ASC_ASSIGN_OWNER_BUILD") == "true" and (
        version == "1.4"
        and attrs.get("version") == "66.1"
        and attrs.get("processingState") == "VALID"
        and detail.get("internalBuildState") == "READY_FOR_BETA_TESTING"
        and len(matching_owner_testers) == 1
    ):
        owner_tester = next(iter(matching_owner_testers.values()))
        if owner_tester.get("attributes", {}).get("state") not in {"INSTALLED", "ACCEPTED"}:
            raise SystemExit("Account holder has not accepted the TestFlight invitation")
        existing_ids = {
            item["id"] for item in get(f"/v1/builds/{build_id}/relationships/individualTesters", limit=200)["data"]
        }
        if owner_tester["id"] not in existing_ids:
            status = assign_build_to_tester(build_id, owner_tester["id"])
        else:
            status = "already assigned"
        assigned_ids = {
            item["id"] for item in get(f"/v1/builds/{build_id}/relationships/individualTesters", limit=200)["data"]
        }
        print("OWNER_ASSIGNMENT", json.dumps({
            "status": status,
            "verified": owner_tester["id"] in assigned_ids,
        }))
