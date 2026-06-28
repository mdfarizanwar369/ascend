param(
  [string]$StoreFile = "android/keystore/ascend-upload.jks",
  [string]$Alias = "ascendupload",
  [string]$StorePassword = "",
  [string]$KeyPassword = "",
  [string]$Dname = "CN=Ascend, OU=Mobile, O=Ascend, L=Kuala Lumpur, ST=Selangor, C=MY",
  [int]$ValidityDays = 9125
)

$ErrorActionPreference = "Stop"

if (-not $StorePassword) {
  $StorePassword = [Guid]::NewGuid().ToString("N") + "A9!"
}

if (-not $KeyPassword) {
  $KeyPassword = [Guid]::NewGuid().ToString("N") + "B8!"
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$storePath = Join-Path $root $StoreFile
$storeDir = Split-Path $storePath -Parent

if (-not (Test-Path $storeDir)) {
  New-Item -ItemType Directory -Path $storeDir | Out-Null
}

$javaHome = $env:JAVA_HOME
if (-not $javaHome) {
  throw "JAVA_HOME is not set. Point it to Android Studio jbr or a JDK before generating the upload keystore."
}

$keytool = Join-Path $javaHome "bin\keytool.exe"
if (-not (Test-Path $keytool)) {
  throw "Could not find keytool.exe at $keytool"
}

if (Test-Path $storePath) {
  throw "Keystore already exists at $storePath. Delete it first only if you intentionally want a new upload key."
}

& $keytool -genkeypair `
  -v `
  -keystore $storePath `
  -storetype JKS `
  -storepass $StorePassword `
  -keypass $KeyPassword `
  -alias $Alias `
  -keyalg RSA `
  -keysize 4096 `
  -validity $ValidityDays `
  -dname $Dname

$signingPropertiesStoreFile = if ($StoreFile -like "android/*" -or $StoreFile -like "android\*") {
  $StoreFile.Substring(8)
} else {
  $StoreFile
}

$signingPropertiesPath = Join-Path $root "android\signing.properties"
@(
  "STORE_FILE=$signingPropertiesStoreFile"
  "STORE_PASSWORD=$StorePassword"
  "KEY_ALIAS=$Alias"
  "KEY_PASSWORD=$KeyPassword"
) | Set-Content -Path $signingPropertiesPath -Encoding ASCII

Write-Output "Generated Android upload keystore:"
Write-Output "  Keystore: $storePath"
Write-Output "  Signing properties: $signingPropertiesPath"
Write-Output "Back up both files securely before publishing to Google Play."
