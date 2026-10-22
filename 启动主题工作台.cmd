@echo off
rem Start the local workspace using the existing Python runtime.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start_workspace.ps1" %*
if not "%~1"=="-CheckOnly" pause
