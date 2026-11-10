$ErrorActionPreference='Stop'
$workspacePath=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspacePath

function Test-LocalEmulators {
  try {
    $response=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9099/emulator/v1/projects/demo-zorifi-openai/config' -TimeoutSec 2
    if($response.StatusCode -ne 200){return $false}
    $client=New-Object System.Net.Sockets.TcpClient
    try {
      $pending=$client.ConnectAsync('127.0.0.1',8085)
      if(-not $pending.Wait(500)){return $false}
      return $client.Connected
    } finally {$client.Dispose()}
  } catch {return $false}
}

try {
  Write-Host 'Preparing the local Vanessa connection test. No deployment or Firebase upgrade.'
  if(-not (Test-LocalEmulators)) {
    $nodePath=(Get-Command node.exe -ErrorAction Stop).Source
    $helperPath=Join-Path $PSScriptRoot 'firebase-emulators.cjs'
    $artifactPath=Join-Path $workspacePath 'artifacts'
    New-Item -ItemType Directory -Path $artifactPath -Force > $null
    $helper=Start-Process -FilePath $nodePath -ArgumentList @(('"'+$helperPath+'"')) -WorkingDirectory $workspacePath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $artifactPath 'openai-connect-emulators.log') -RedirectStandardError (Join-Path $artifactPath 'openai-connect-emulators-error.log') -PassThru
    $ready=$false
    for($attempt=0;$attempt -lt 90;$attempt++) {
      if(Test-LocalEmulators){$ready=$true;break}
      if($helper.HasExited){throw 'The local emulators could not start. Check artifacts/openai-connect-emulators-error.log.'}
      Start-Sleep -Milliseconds 1000
    }
    if(-not $ready){throw 'The local emulators did not become ready. No OpenAI request was sent.'}
  }
  # Force hidden input for this launcher; never reuse an inherited credential.
  Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
  & (Join-Path $PSScriptRoot 'Start-ZorifiOpenAI.ps1') -Mode LiveTest
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
} catch {
  Write-Host ('Connection test stopped: '+$_.Exception.Message)
  exit 1
}
