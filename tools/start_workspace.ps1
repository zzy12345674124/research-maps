param([switch]$CheckOnly)
# 功能：选用已有Python启动本机工作台；不安装依赖、不修改环境配置。
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonCandidates = @(
    (Join-Path $projectRoot 'runtime\bertopic-env\Scripts\python.exe'),
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe')
)
$pythonRuntime = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $pythonRuntime) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) { $pythonRuntime = $pythonCommand.Source }
}
if (-not $pythonRuntime) { throw '未找到已有Python，请配置Python后再启动。不会自动安装。' }
# 功能：只检查启动入口，供验证批处理和Windows PowerShell解析，不启动服务或读取论文。
if ($CheckOnly) { Write-Host "Launcher check OK: $pythonRuntime"; exit 0 }
# 功能：已有工作台服务时复用入口，避免重复双击产生端口占用报错。
try {
    $workspaceStatus = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/topics' -TimeoutSec 2
    if ($workspaceStatus.status -in @('idle', 'running', 'done', 'error')) {
        Write-Host '工作台已运行：http://127.0.0.1:8765/'
        exit 0
    }
} catch { }
Write-Host '工作台地址：http://127.0.0.1:8765/（关闭此窗口停止服务）'
& $pythonRuntime (Join-Path $projectRoot 'server\topic_server.py')
