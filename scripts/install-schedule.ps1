# 注册 Windows 计划任务：每天 07:05 自动生成当日四板块内容
# 用法（普通 PowerShell 即可，不需要管理员）：
#   powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
# 卸载：
#   powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1 -Uninstall

param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$TaskName = "PersonalLearningWindow-Daily"
$Project  = Split-Path -Parent $PSScriptRoot
$LogFile  = Join-Path $Project "data\daily.log"

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "已卸载计划任务：$TaskName"
  } else {
    Write-Host "计划任务不存在：$TaskName"
  }
  exit 0
}

if (-not (Test-Path (Join-Path $Project "node_modules"))) {
  Write-Host "缺少依赖，先在项目目录执行：npm install" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path $LogFile)) { New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null }

$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c cd /d `"$Project`" && npx tsx src/server/cli/generate-daily.ts >> `"$LogFile`" 2>&1" `
  -WorkingDirectory $Project

$trigger  = New-ScheduledTaskTrigger -Daily -At 07:05
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "个人学习窗口：每天自动生成书籍/AI工具/金融/局势四板块内容并预生成朗读音频" | Out-Null

Write-Host "已注册计划任务：$TaskName" -ForegroundColor Green
Write-Host "  每天 07:05 运行，日志：$LogFile"
Write-Host "  立即试跑：Start-ScheduledTask -TaskName $TaskName"
