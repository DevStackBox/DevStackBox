<?php
// DevStackBox - PHP Information Page
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PHP Info - DevStackBox</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f4f4f4; }
        .header { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .back-link { display: inline-block; margin-bottom: 15px; padding: 8px 16px; background: #007cba; color: white; text-decoration: none; border-radius: 4px; }
        .back-link:hover { background: #005a87; }
    </style>
</head>
<body>
    <div class="header">
        <a href="index.php" class="back-link">Back to Home</a>
        <h1>PHP Configuration Information</h1>
        <p>Complete PHP configuration for your DevStackBox environment</p>
    </div>

    <?php
    // Display full PHP configuration
    phpinfo();
    ?>
</body>
</html>
