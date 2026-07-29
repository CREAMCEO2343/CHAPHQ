# serve.ps1
# ---------------------------------------------------------------------
# A tiny local web server for previewing the app, written in PowerShell
# so it works with zero extra installs (no Node.js or Python needed,
# and no administrator rights needed either).
#
# HOW TO RUN IT:
#   1. Right-click this file's folder in File Explorer, choose
#      "Open in Terminal" (or open PowerShell and `cd` into life-app).
#   2. Run:  .\serve.ps1
#   3. It will print a web address. Open that address in your browser
#      on this PC, or (for iPhone testing) open it in Safari on your
#      iPhone while connected to the same WiFi network as this PC.
#   4. Press Ctrl+C in the terminal to stop the server when you're done.

param(
    [int]$Port = 8080
)

$root = $PSScriptRoot

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css"
    ".js"   = "text/javascript"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".webmanifest" = "application/manifest+json"
}

$lanIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notlike "169.254*"
} | Select-Object -First 1 -ExpandProperty IPAddress)

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()

Write-Host ""
Write-Host "Serving $root" -ForegroundColor Cyan
Write-Host "  On this PC:      http://localhost:$Port/" -ForegroundColor Green
if ($lanIP) {
    Write-Host "  On your iPhone:  http://$($lanIP):$Port/  (same WiFi network)" -ForegroundColor Green
}
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()

    # Read just the request line (e.g. "GET /index.html HTTP/1.1") — we
    # don't need headers/body since this only ever serves static files.
    $buffer = New-Object byte[] 8192
    $bytesRead = $stream.Read($buffer, 0, $buffer.Length)
    $requestText = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $bytesRead)
    $requestLine = ($requestText -split "`r`n")[0]

    $urlPath = "/index.html"
    if ($requestLine -match '^[A-Z]+\s+(\S+)\s+HTTP') {
        $urlPath = [System.Uri]::UnescapeDataString($matches[1])
        if ($urlPath -eq "/") { $urlPath = "/index.html" }
        $urlPath = $urlPath.Split('?')[0] # drop any query string
    }

    $filePath = Join-Path $root ($urlPath.TrimStart("/") -replace "/", "\")
    $filePath = [System.IO.Path]::GetFullPath($filePath)

    # Safety check: never serve a file outside the project folder.
    if (-not $filePath.StartsWith((Get-Item $root).FullName)) {
        $filePath = ""
    }

    if ($filePath -and (Test-Path $filePath -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = $mimeTypes[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }

        $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
        $headerText = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($fileBytes.Length)`r`nConnection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerText)

        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($fileBytes, 0, $fileBytes.Length)
    } else {
        $body = "404 Not Found: $urlPath"
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
        $headerText = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($bodyBytes.Length)`r`nConnection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerText)

        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($bodyBytes, 0, $bodyBytes.Length)
    }

    $stream.Close()
    $client.Close()
}
