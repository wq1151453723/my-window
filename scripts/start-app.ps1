# 一条命令把「个人学习窗口」跑起来（生产模式，单端口 4399）
#   powershell -ExecutionPolicy Bypass -File scripts\start-app.ps1
# 手机在同一 WiFi 下打开：http://<本机局域网IP>:4399

$ErrorActionPreference = "Stop"
$Project = Split-Path -Parent $PSScriptRoot
Set-Location $Project

if (-not (Test-Path "node_modules")) { npm install }

Write-Host "构建前端..." -ForegroundColor Cyan
npx vite build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -like "192.168.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host "" -ForegroundColor Cyan
Write-Host "个人学习窗口已启动：" -ForegroundColor Green
Write-Host "  本机：http://localhost:4399"
if ($ip) { Write-Host "  手机：http://$ip:4399  （需与电脑同一 WiFi）" }
Write-Host "  按 Ctrl+C 停止" -ForegroundColor Cyan
Write-Host ""

npx tsx src/server/index.ts