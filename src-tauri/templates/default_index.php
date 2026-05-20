<?php
// DevStackBox - PHP Development Environment
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevStackBox - PHP Development Environment</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f4f4f4; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        .status { background: #e8f5e8; padding: 15px; border-left: 4px solid #4caf50; margin: 20px 0; }
        .info-box { background: #e3f2fd; padding: 15px; border-left: 4px solid #2196f3; margin: 20px 0; }
        .links { margin-top: 30px; }
        .links a { display: inline-block; margin: 10px 15px 10px 0; padding: 10px 20px; background: #007cba; color: white; text-decoration: none; border-radius: 4px; }
        .links a:hover { background: #005a87; }
        .info { margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
    </style>
</head>
<body>
    <div class="container">
        <h1>DevStackBox - PHP Development Environment</h1>

        <div class="status">
            <strong>PHP is working!</strong><br>
            Your development environment is ready.
        </div>

        <div class="info-box">
            <h3>Current Configuration:</h3>
            <table>
                <tr><th>Component</th><th>Status</th><th>Version</th></tr>
                <tr><td>PHP</td><td>Running</td><td><?php echo PHP_VERSION; ?></td></tr>
                <tr><td>Apache</td><td>Running</td><td><?php echo $_SERVER['SERVER_SOFTWARE'] ?? 'Apache HTTP Server'; ?></td></tr>
                <tr><td>Server Time</td><td>Active</td><td><?php echo date('Y-m-d H:i:s'); ?></td></tr>
                <tr><td>Document Root</td><td>Active</td><td><?php echo $_SERVER['DOCUMENT_ROOT']; ?></td></tr>
            </table>
        </div>

        <div class="links">
            <a href="phpinfo.php">PHP Info</a>
            <a href="../phpmyadmin/" target="_blank">phpMyAdmin</a>
            <a href="test.html">Test Page</a>
        </div>

        <div class="info">
            <h3>Quick Start:</h3>
            <ul>
                <li>Place your PHP files in the <code>www/</code> directory</li>
                <li>Access them via <a href="http://localhost/">http://localhost/</a></li>
                <li>MySQL is available on port 3306</li>
                <li>Use phpMyAdmin for database management</li>
            </ul>
        </div>

        <div style="margin-top: 30px; color: #666; border-top: 1px solid #eee; padding-top: 20px;">
            <small>DevStackBox - Portable PHP Development Environment<br>
            Access this page at: <a href="http://localhost">http://localhost</a></small>
        </div>
    </div>
</body>
</html>
