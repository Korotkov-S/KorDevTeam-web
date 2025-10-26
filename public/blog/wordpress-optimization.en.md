# WordPress Site Performance Optimization

## Introduction

WordPress is one of the most popular CMS in the world, but without proper optimization, sites can run slowly. In this article, we'll look at key methods for improving performance.

## 1. Hosting Selection

### Don't skimp on hosting

Quality hosting is the foundation of a fast site:

- **VPS or dedicated server** for high-load projects
- **Managed WordPress** for management simplicity
- **CDN** for global content delivery

### Recommended requirements:

- PHP 8.1 or higher
- MySQL 8.0+ or MariaDB 10.5+
- Minimum 512 MB RAM (preferably 1GB+)
- SSD drives

## 2. Caching

### Caching plugins

Install one of the popular plugins:

- **WP Rocket** (paid, but simplest)
- **W3 Total Cache** (free, many settings)
- **LiteSpeed Cache** (for LiteSpeed servers)

### Server-level cache configuration

For Nginx, add to configuration:

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## 3. Image Optimization

### Automatic optimization

Use plugins:

- **Imagify**
- **ShortPixel**
- **Smush**

### WebP format

Convert images to WebP to reduce size by 25-35%:

```php
add_filter('wp_generate_attachment_metadata', function($metadata, $attachment_id) {
    $file = get_attached_file($attachment_id);
    $webp_file = preg_replace('/\.(jpg|jpeg|png)$/i', '.webp', $file);
    
    // Convert to WebP
    $image = wp_get_image_editor($file);
    if (!is_wp_error($image)) {
        $image->save($webp_file, 'image/webp');
    }
    
    return $metadata;
}, 10, 2);
```

## 4. Minification and File Consolidation

### CSS and JavaScript

Combine and minify files:

```php
// functions.php
function optimize_scripts() {
    // Remove emoji
    remove_action('wp_head', 'print_emoji_detection_script', 7);
    remove_action('wp_print_styles', 'print_emoji_styles');
    
    // Disable jQuery Migrate
    wp_deregister_script('jquery');
    wp_register_script('jquery', 
        'https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js', 
        false, 
        '3.6.0', 
        true
    );
}
add_action('init', 'optimize_scripts');
```

## 5. Database Optimization

### Regular cleanup

Delete unnecessary data:

```sql
-- Delete revisions
DELETE FROM wp_posts WHERE post_type = 'revision';

-- Clear transients
DELETE FROM wp_options WHERE option_name LIKE '%_transient_%';

-- Optimize tables
OPTIMIZE TABLE wp_posts, wp_postmeta, wp_options;
```

### Database optimization plugins

- **WP-Optimize**
- **Advanced Database Cleaner**

## 6. Lazy Loading

Lazy loading images:

```php
add_filter('the_content', function($content) {
    return str_replace('<img ', '<img loading="lazy" ', $content);
});
```

## 7. Disable Unused Features

```php
// Disable XML-RPC
add_filter('xmlrpc_enabled', '__return_false');

// Disable REST API for unauthorized
add_filter('rest_authentication_errors', function($result) {
    if (!is_user_logged_in()) {
        return new WP_Error(
            'rest_disabled',
            __('REST API disabled'),
            ['status' => 401]
        );
    }
    return $result;
});
```

## Performance Monitoring

### Testing tools:

1. **Google PageSpeed Insights**
2. **GTmetrix**
3. **WebPageTest**
4. **Pingdom**

### Target metrics:

- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

## Conclusion

WordPress optimization is an ongoing process. Regularly check performance, update plugins, and stay informed about new technologies. Fast site = satisfied users and better search rankings.

---

**Tags**: WordPress, Optimization, Performance, PHP
**Publication Date**: October 10, 2025
