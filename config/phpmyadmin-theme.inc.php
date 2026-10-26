<?php
// DevStackBox's packaged phpMyAdmin has one supported theme.
$cfg['ThemeDefault'] = 'pmahomme';
$cfg['ThemeManager'] = false;
$cfg['ThemePerServer'] = false;
// Old HTTP/HTTPS theme cookies otherwise trigger a missing-theme error in 5.2.x.
// Ignore only theme cookies for this request; leave authentication cookies intact.
foreach (array_keys($_COOKIE) as $themeCookie) {
    if (preg_match('/^(?:__Secure-)?pma_theme(?:-[0-9]+)?(?:_https)?$/D', $themeCookie)) {
        unset($_COOKIE[$themeCookie]);
    }
}
unset($themeCookie);
