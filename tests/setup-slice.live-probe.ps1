param(
  [string]$BaseUrl = "http://127.0.0.1:8789"
)

$ErrorActionPreference = "Stop"

function Assert-Qa {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Invoke-QaJson {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body,
    [string]$Token
  )

  $headers = @{}
  if ($Token) { $headers.Authorization = "Bearer $Token" }
  $request = @{
    Uri = "$BaseUrl$Path"
    Method = $Method
    Headers = $headers
    SkipHttpErrorCheck = $true
    TimeoutSec = 10
  }
  if ($null -ne $Body) {
    $request.ContentType = "application/json"
    $request.Body = $Body | ConvertTo-Json -Depth 10 -Compress
  }
  $response = Invoke-WebRequest @request
  $json = $response.Content | ConvertFrom-Json -Depth 20
  return [pscustomobject]@{ Status = [int]$response.StatusCode; Json = $json }
}

function Invoke-QaCommand {
  param([string]$RoomCode, [string]$Token, [object]$Body)
  return Invoke-QaJson -Method POST -Path "/api/rooms/$RoomCode/commands" -Body $Body -Token $Token
}

$unsupported = Invoke-QaJson -Method POST -Path "/api/rooms" -Body @{
  nickname = "ExpansionProbe"
  mode = "setup_demo"
  enabledSetIds = @("fixture.expansion")
} -Token ""
Assert-Qa ($unsupported.Status -ne 201) "SL-F01: unsupported config unexpectedly returned 201"
Assert-Qa ($null -eq $unsupported.Json.sessionToken) "SL-F01: unsupported config leaked a session token"

$created = Invoke-QaJson -Method POST -Path "/api/rooms" -Body @{
  nickname = "LiveHost"
  mode = "setup_demo"
} -Token ""
Assert-Qa ($created.Status -eq 201) "setup create did not return 201"
Assert-Qa ($created.Json.snapshot.mode -eq "setup_demo") "setup create returned wrong mode"
$roomCode = [string]$created.Json.roomCode
$hostToken = [string]$created.Json.sessionToken
$hostId = [string]$created.Json.snapshot.you.playerId

$joined = Invoke-QaJson -Method POST -Path "/api/rooms/$roomCode/join" -Body @{ nickname = "LiveGuest" } -Token ""
Assert-Qa ($joined.Status -eq 201) "join did not return 201"
$guestToken = [string]$joined.Json.sessionToken
$guestId = [string]$joined.Json.snapshot.you.playerId

$begun = Invoke-QaCommand -RoomCode $roomCode -Token $hostToken -Body @{
  commandId = "live-begin"
  expectedRevision = $joined.Json.snapshot.revision
  kind = "BEGIN_LEADER_SELECTION"
  payload = @{}
}
Assert-Qa ($begun.Json.outcome.accepted -eq $true) "BEGIN_LEADER_SELECTION rejected"
$leaders = @($begun.Json.snapshot.setup.leaderPool)
Assert-Qa ($leaders.Count -ge 2) "leader pool has fewer than two choices"

$hostSelected = Invoke-QaCommand -RoomCode $roomCode -Token $hostToken -Body @{
  commandId = "live-host-leader"
  expectedRevision = $begun.Json.snapshot.revision
  kind = "SELECT_PARTY_LEADER"
  payload = @{ leaderId = $leaders[0] }
}
Assert-Qa ($hostSelected.Json.outcome.accepted -eq $true) "host Leader selection rejected"

$guestSelected = Invoke-QaCommand -RoomCode $roomCode -Token $guestToken -Body @{
  commandId = "live-guest-leader"
  expectedRevision = $hostSelected.Json.snapshot.revision
  kind = "SELECT_PARTY_LEADER"
  payload = @{ leaderId = $leaders[1] }
}
Assert-Qa ($guestSelected.Json.outcome.accepted -eq $true) "guest Leader selection rejected"

$started = Invoke-QaCommand -RoomCode $roomCode -Token $hostToken -Body @{
  commandId = "live-start"
  expectedRevision = $guestSelected.Json.snapshot.revision
  kind = "START_GAME"
  payload = @{}
}
Assert-Qa ($started.Json.outcome.accepted -eq $true) "START_GAME rejected"
Assert-Qa ($started.Json.snapshot.setup.phase -eq "turn_active") "game did not enter turn_active"
Assert-Qa ($started.Json.snapshot.setup.actionPoints -eq 3) "game did not start with 3 AP"
Assert-Qa ($started.Json.snapshot.setup.mainDeckCount -eq 105) "two-player deal did not leave 105 cards"
Assert-Qa ($started.Json.snapshot.setup.faceUpMonsterIds.Count -eq 3) "setup did not expose three Monsters"

$hostView = Invoke-QaJson -Method GET -Path "/api/rooms/$roomCode/snapshot" -Body $null -Token $hostToken
$guestView = Invoke-QaJson -Method GET -Path "/api/rooms/$roomCode/snapshot" -Body $null -Token $guestToken
Assert-Qa ($hostView.Status -eq 200 -and $guestView.Status -eq 200) "private snapshots did not return 200"
Assert-Qa ($hostView.Json.snapshot.yourHand.Count -eq 5) "host private hand count is not five"
Assert-Qa ($guestView.Json.snapshot.yourHand.Count -eq 5) "guest private hand count is not five"
$hostSerialized = $hostView.Json.snapshot | ConvertTo-Json -Depth 20 -Compress
$guestSerialized = $guestView.Json.snapshot | ConvertTo-Json -Depth 20 -Compress
Assert-Qa (-not $hostSerialized.Contains($guestToken)) "host snapshot leaked guest token"
Assert-Qa (-not $guestSerialized.Contains($hostToken)) "guest snapshot leaked host token"
foreach ($card in @($guestView.Json.snapshot.yourHand)) {
  Assert-Qa (-not $hostSerialized.Contains([string]$card.cardId)) "host snapshot leaked guest card ID"
}
foreach ($card in @($hostView.Json.snapshot.yourHand)) {
  Assert-Qa (-not $guestSerialized.Contains([string]$card.cardId)) "guest snapshot leaked host card ID"
}

$activeId = [string]$started.Json.snapshot.setup.currentPlayerId
if ($activeId -eq $hostId) {
  $activeToken = $hostToken
  $observerToken = $guestToken
} elseif ($activeId -eq $guestId) {
  $activeToken = $guestToken
  $observerToken = $hostToken
} else {
  throw "current player is not one of the two sessions"
}
$drawBody = @{
  commandId = "live-draw-replay"
  expectedRevision = $started.Json.snapshot.revision
  kind = "DRAW_CARD"
  payload = @{}
}
$drawn = Invoke-QaCommand -RoomCode $roomCode -Token $activeToken -Body $drawBody
Assert-Qa ($drawn.Json.outcome.accepted -eq $true) "DRAW_CARD rejected"
Assert-Qa ($drawn.Json.snapshot.setup.actionPoints -eq 2) "DRAW_CARD did not cost one AP"
Assert-Qa ($drawn.Json.snapshot.yourHand.Count -eq 6) "active private hand did not grow to six"
$replayed = Invoke-QaCommand -RoomCode $roomCode -Token $activeToken -Body $drawBody
Assert-Qa ($replayed.Json.outcome.replayed -eq $true) "exact DRAW_CARD retry was not replayed"
Assert-Qa ($replayed.Json.snapshot.revision -eq $drawn.Json.snapshot.revision) "replay changed revision"
Assert-Qa ($replayed.Json.snapshot.setup.mainDeckCount -eq $drawn.Json.snapshot.setup.mainDeckCount) "replay drew twice"
Assert-Qa ($replayed.Json.snapshot.yourHand.Count -eq 6) "replay changed private hand"

$observer = Invoke-QaJson -Method GET -Path "/api/rooms/$roomCode/snapshot" -Body $null -Token $observerToken
$activeRow = @($observer.Json.snapshot.players) | Where-Object { $_.playerId -eq $activeId }
Assert-Qa ($activeRow.handCount -eq 6) "observer roster did not expose updated handCount"
foreach ($card in @($drawn.Json.snapshot.yourHand)) {
  $observerSerialized = $observer.Json.snapshot | ConvertTo-Json -Depth 20 -Compress
  Assert-Qa (-not $observerSerialized.Contains([string]$card.cardId)) "observer snapshot leaked active card ID"
}

[pscustomobject]@{
  actualUrl = $BaseUrl
  health = "PASS"
  unsupportedConfig = "PASS"
  setupCore = "PASS"
  replay = "PASS"
  privacy = "PASS"
  roomPlayers = $observer.Json.snapshot.players.Count
  phase = $observer.Json.snapshot.setup.phase
  actionPointsAfterDraw = $observer.Json.snapshot.setup.actionPoints
  activeHandCountAfterDraw = $activeRow.handCount
} | ConvertTo-Json -Compress
