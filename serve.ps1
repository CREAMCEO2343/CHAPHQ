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

# Handles exactly one HTTP request on an already-accepted connection. This
# runs on a background thread (see the main loop below), so it takes its
# own copies of $root/$mimeTypes as parameters rather than reading the
# script's variables directly — a separate thread can't see those.
#
# Wrapped in try/catch/finally so ANY problem with one browser connection
# (a stalled read, a reset connection, a bad request) only closes that one
# connection — it can never take the whole server down or block anyone else.
$handleConnection = {
    param($client, $root, $mimeTypes)

    try {
        # Browsers open several connections in parallel and don't always
        # send a request on every one of them right away (idle/speculative
        # connections). Without a timeout, reading from one of those would
        # block forever. A short timeout means a quiet connection gets
        # abandoned instead of hanging.
        $client.ReceiveTimeout = 3000
        $client.SendTimeout = 3000
        $stream = $client.GetStream()

        $buffer = New-Object byte[] 8192
        $bytesRead = $stream.Read($buffer, 0, $buffer.Length)
        if ($bytesRead -eq 0) { return }

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
            # no-cache = the browser must re-check with us before using an old
            # copy. Without this, edits don't show up until the browser feels
            # like refreshing its cache — maddening during development.
            $headerText = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($fileBytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
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
    } catch {
        # A stalled/reset connection ends up here — nothing to do but move on.
    } finally {
        $client.Close()
    }
}

# A small pool of background threads so multiple browser connections (a
# page load easily opens 6+ at once for all this app's CSS/JS files) are
# handled AT THE SAME TIME instead of one strictly after another.
$runspacePool = [runspacefactory]::CreateRunspacePool(1, 12)
$runspacePool.Open()

# Every in-flight connection's PowerShell handle, so we can release each
# one's resources once its thread finishes (without ever making the main
# loop below wait around for that to happen).
$inFlight = New-Object System.Collections.Generic.List[object]

while ($true) {
    $client = $listener.AcceptTcpClient()

    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $runspacePool
    [void]$ps.AddScript($handleConnection).AddArgument($client).AddArgument($root).AddArgument($mimeTypes)
    $asyncResult = $ps.BeginInvoke()
    $inFlight.Add([pscustomobject]@{ PS = $ps; Handle = $asyncResult })

    # Sweep up any connections that finished since last time through the
    # loop. This never blocks — it only touches handles already marked
    # complete — so it can't reintroduce the original hang.
    for ($i = $inFlight.Count - 1; $i -ge 0; $i--) {
        if ($inFlight[$i].Handle.IsCompleted) {
            try { $inFlight[$i].PS.EndInvoke($inFlight[$i].Handle) } catch {}
            $inFlight[$i].PS.Dispose()
            $inFlight.RemoveAt($i)
        }
    }
}
