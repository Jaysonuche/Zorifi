param([ValidateSet('Mock','LiveTest','LiveServer','LiveModalityTest')][string]$Mode='Mock', [ValidateSet('voice','image','video','files','retrieval','realtime')][string]$Capability='voice')
$ErrorActionPreference='Stop'
$addedSecret=$false
$secretText=$null
$secretPointer=[IntPtr]::Zero
try {
  if($Mode -ne 'Mock' -and -not $env:OPENAI_API_KEY) {
    $secretText=Read-Host 'Enter OPENAI_API_KEY for this local process only (hidden input)' -AsSecureString
    $secretPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretText)
    $env:OPENAI_API_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    $addedSecret=$true
  }
  $taskArgument=if($Mode -eq 'LiveTest'){'--live-test'}elseif($Mode -eq 'LiveServer'){'--serve-live'}else{'--serve-mock'}
  if($Mode -eq 'LiveModalityTest'){Write-Host ('Running one local '+$Capability+' test. Provider usage may be billed; production is unchanged.'); & node (Join-Path $PSScriptRoot 'test-openai-modality.cjs') $Capability}
  else {& node (Join-Path $PSScriptRoot 'vanessa-openai-local.cjs') $taskArgument}
  if($LASTEXITCODE -ne 0){throw 'The local OpenAI task failed. Check the sanitized result above.'}
} finally {
  if($addedSecret){Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue}
  if($secretPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)}
  if($null -ne $secretText){$secretText.Dispose()}
}
