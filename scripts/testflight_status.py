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


def create_owner_group(app_id):
    path = "/v1/betaGroups"
    payload = {"data": {"type": "betaGroups", "attributes": {
        "name": "Ascend Owner", "isInternalGroup": True, "hasAccessToAllBuilds": False,
    }, "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}}
    request = urllib.request.Request(
        "https://api.appstoreconnect.apple.com" + path,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)["data"]
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"App Store Connect {path}: HTTP {error.code}: {body[:1200]}") from error


def add_owner_to_group(group_id, tester_id):
    path = f"/v1/betaGroups/{group_id}/relationships/betaTesters"
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


def resend_owner_invitation(app_id, tester_id):
    path = "/v1/betaTesterInvitations"
    payload = {
        "data": {
            "type": "betaTesterInvitations",
            "relationships": {
                "app": {"data": {"type": "apps", "id": app_id}},
                "betaTester": {"data": {"type": "betaTesters", "id": tester_id}},
            },
        }
    }
    request = urllib.request.Request(
        "https://api.appstoreconnect.apple.com" + path,
        data=json.dumps(payload).encode(),
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
    owner_in_assigned_internal_group = False
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
        if (group_attrs.get("name") == "Ascend Internal" and group_attrs.get("isInternalGroup") is True
                and build_id in assigned_ids
                and any(tester.get("attributes", {}).get("email", "").strip().lower() in account_holder_emails
                        for tester in testers)):
            owner_in_assigned_internal_group = True
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
            and attrs.get("version") == build_number
            and attrs.get("processingState") == "VALID"
            and detail.get("internalBuildState") == "READY_FOR_BETA_TESTING"
            and group_attrs.get("name") == "Ascend Internal"
            and group_attrs.get("isInternalGroup") is True
            and sorted(tester.get("attributes", {}).get("state") for tester in testers) == ["INSTALLED", "INVITED"]
            and build_id not in assigned_ids
        ):
            status = assign_build_to_group(group_id, build_id)
            new_ids = {
                item["id"] for item in get(f"/v1/betaGroups/{group_id}/relationships/builds", limit=200)["data"]
            }
            print("ASSIGNMENT", json.dumps({"status": status, "verified": build_id in new_ids}))
    matching_owner_testers = {tester["id"]: tester for tester in matching_owner_testers}
    print("OWNER_TESTER_MATCHES", len(matching_owner_testers))
    print("OWNER_TESTER_STATES", sorted(
        tester.get("attributes", {}).get("state", "UNKNOWN") for tester in matching_owner_testers.values()
    ))
    if os.environ.get("ASC_RESEND_OWNER_INVITE") == "true" and (
        version == "1.4"
        and attrs.get("version") == build_number
        and attrs.get("processingState") == "VALID"
        and detail.get("internalBuildState") == "IN_BETA_TESTING"
        and owner_in_assigned_internal_group
        and len(matching_owner_testers) == 1
    ):
        owner_tester = next(iter(matching_owner_testers.values()))
        if owner_tester.get("attributes", {}).get("state") == "INVITED":
            print("OWNER_INVITATION", json.dumps({
                "status": resend_owner_invitation(app_id, owner_tester["id"])
            }))
    if os.environ.get("ASC_ASSIGN_OWNER_BUILD") == "true" and (
        version == "1.4"
        and attrs.get("version") == build_number
        and attrs.get("processingState") == "VALID"
        and detail.get("internalBuildState") in {"READY_FOR_BETA_TESTING", "IN_BETA_TESTING"}
        and len(matching_owner_testers) == 1
    ):
        owner_tester = next(iter(matching_owner_testers.values()))
        # Apple can attach a ready build to an invited individual tester. The
        # tester still needs to accept their invitation before installing it.
        if owner_tester.get("attributes", {}).get("state") not in {"INSTALLED", "ACCEPTED", "INVITED"}:
            raise SystemExit("Account holder is not eligible for TestFlight assignment")
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
    if os.environ.get("ASC_ASSIGN_OWNER_GROUP_BUILD") == "true" and (
        version == "1.4"
        and attrs.get("version") == build_number
        and attrs.get("processingState") == "VALID"
        and detail.get("internalBuildState") in {"READY_FOR_BETA_TESTING", "IN_BETA_TESTING"}
        and len(matching_owner_testers) == 1
    ):
        owner_tester = next(iter(matching_owner_testers.values()))
        if owner_tester.get("attributes", {}).get("state") not in {"INSTALLED", "ACCEPTED", "INVITED"}:
            raise SystemExit("Account holder is not eligible for TestFlight")
        owner_groups = [group for group in groups if group["attributes"].get("name") == "Ascend Owner"]
        if len(owner_groups) > 1:
            raise SystemExit("More than one Ascend Owner TestFlight group exists")
        owner_group = owner_groups[0] if owner_groups else create_owner_group(app_id)
        owner_group = get(f"/v1/betaGroups/{owner_group['id']}")["data"]
        group_attrs = owner_group["attributes"]
        if group_attrs.get("isInternalGroup") is not True or group_attrs.get("hasAccessToAllBuilds") is not False:
            raise SystemExit("Ascend Owner group is not limited to selected internal builds")
        group_id = owner_group["id"]
        tester_ids = {item["id"] for item in get(f"/v1/betaGroups/{group_id}/relationships/betaTesters", limit=200)["data"]}
        if tester_ids - {owner_tester["id"]}:
            raise SystemExit("Ascend Owner group includes another tester")
        if owner_tester["id"] not in tester_ids:
            add_owner_to_group(group_id, owner_tester["id"])
        tester_ids = {item["id"] for item in get(f"/v1/betaGroups/{group_id}/relationships/betaTesters", limit=200)["data"]}
        if tester_ids != {owner_tester["id"]}:
            raise SystemExit("Could not verify owner-only TestFlight group membership")
        assigned_ids = {item["id"] for item in get(f"/v1/betaGroups/{group_id}/relationships/builds", limit=200)["data"]}
        if build_id not in assigned_ids:
            assign_build_to_group(group_id, build_id)
        assigned_ids = {item["id"] for item in get(f"/v1/betaGroups/{group_id}/relationships/builds", limit=200)["data"]}
        if build_id not in assigned_ids:
            raise SystemExit("Could not verify owner-only TestFlight build assignment")
        print("OWNER_GROUP_ASSIGNMENT", json.dumps({
            "group": group_attrs["name"], "testerCount": len(tester_ids), "verified": True,
        }))
