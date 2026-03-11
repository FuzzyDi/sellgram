$scriptRoot = 'E:\Projects\sellgram\deploy\production'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptRoot\\Backup-Db.ps1`" -BackupDir `"$scriptRoot\\backups`""
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00AM
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'SellGram PostgreSQL Backup' -Action $action -Trigger $trigger -Principal $principal
