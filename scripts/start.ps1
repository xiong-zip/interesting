param([switch]$Check, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
try { $Host.UI.RawUI.WindowTitle = 'Creator Studio' } catch {}

$backendPort = 3001
$webPort = 7200

function Test-Port([int]$port) {
  try {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return [bool](netstat -ano | Select-String ":$port\s+.*LISTENING")
  }
}

function Get-PortOwner([int]$port) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { return $conn.OwningProcess }
  } catch {}
  return $null
}

function Stop-WithMessage([string]$message) {
  Write-Host $message -ForegroundColor Red
  Read-Host '按回车退出' | Out-Null
}

Write-Host '=========================================='
Write-Host '  Creator Studio · 个人自媒体工作台'
Write-Host '=========================================='
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-WithMessage '[错误] 没有找到 Node.js，请先安装 Node.js 18 或更高版本。下载地址：https://nodejs.org/'
  exit 1
}

$backendRunning = Test-Port $backendPort
$webRunning = Test-Port $webPort

if ($backendRunning -and $webRunning) {
  Write-Host "服务已经在运行：http://localhost:$webPort" -ForegroundColor Green
  if (-not $Check) { Start-Process "http://localhost:$webPort" }
  exit 0
}

if ($backendRunning) {
  $ownerPid = Get-PortOwner $backendPort
  Write-Host "[提示] 端口 $backendPort 被旧进程占用，可能是之前没关掉的后端。" -ForegroundColor Yellow
  if ($ownerPid) {
    Write-Host "       占用进程 PID：$ownerPid"
    Write-Host "       先关闭旧窗口，或执行：taskkill /PID $ownerPid /F"
  }
  if (-not $Check) { Read-Host '按回车退出' | Out-Null }
  exit 1
}

if ($webRunning) {
  $ownerPid = Get-PortOwner $webPort
  Write-Host "[提示] 端口 $webPort 被旧进程占用，可能是之前没关掉的前端。" -ForegroundColor Yellow
  if ($ownerPid) {
    Write-Host "       占用进程 PID：$ownerPid"
    Write-Host "       先关闭旧窗口，或执行：taskkill /PID $ownerPid /F"
  }
  if (-not $Check) { Read-Host '按回车退出' | Out-Null }
  exit 1
}

if ($Check) {
  Write-Host '[检查模式] Node.js 和端口检测通过，可以正常启动。' -ForegroundColor Green
  exit 0
}

if (-not (Test-Path -LiteralPath 'node_modules')) {
  Write-Host '首次启动，正在安装依赖，只执行一次……'
  npm install
  if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage '[错误] 依赖安装失败，请检查网络后重试。'
    exit 1
  }
  Write-Host ''
}

$pythonOk = $false
if (Get-Command python -ErrorAction SilentlyContinue) {
  & python -c "import pyJianYingDraft, imageio_ffmpeg" 2>$null
  $pythonOk = $LASTEXITCODE -eq 0
}
if (-not $pythonOk) {
  Write-Host '[提示] 未检测到 Python 剪映/封面依赖，草稿导出和封面抽帧会不可用。' -ForegroundColor Yellow
  Write-Host '       需要时执行：python -m pip install pyJianYingDraft imageio-ffmpeg'
  Write-Host ''
}

Write-Host '正在启动后端 3001 与前端 7200……'
Write-Host "浏览器稍后会自动打开：http://localhost:$webPort"

# 前端按 vite.config.js 的 host: true 监听 0.0.0.0，同网段设备可直接访问
$lanIp = $null
try {
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -First 1).IPAddress
} catch {}
if ($lanIp) {
  Write-Host "同一局域网的手机/电脑可访问：http://${lanIp}:$webPort" -ForegroundColor Green
}

Write-Host '关闭这个窗口即可停止服务。'
Write-Host ''

if (-not $NoBrowser) {
  Start-Job -ScriptBlock {
    param($url)
    Start-Sleep -Seconds 5
    Start-Process $url
  } -ArgumentList "http://localhost:$webPort" | Out-Null
}

npm run dev
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[错误] 服务异常退出，请查看上面的日志。' -ForegroundColor Red
  Read-Host '按回车退出' | Out-Null
}
