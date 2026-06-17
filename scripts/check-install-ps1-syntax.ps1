$path = 'C:\Users\arsas\AntigravityProjects\claude-code-router\install.ps1'
$errors = $null
$tokens = $null
[System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors) {
  Write-Host "PARSE ERRORS:" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host ("  line {0}: {1}" -f $_.Extent.StartLineNumber, $_.Message) -ForegroundColor Red }
  exit 1
} else {
  Write-Host "CLEAN" -ForegroundColor Green
}
