<?php
// Apache sends every page request here (see .htaccess). It returns index.html with the title and
// the Open Graph tags of that page, because Discord and other link previews do not run JavaScript.
// The page names must match the ones that the React pages give to useTitle().

ini_set('display_errors', '0');

const SITE = 'Solaris Museum';

/** Name, description and color of every room. Keep them in line with src/lib/rooms.ts. */
const ROOMS = [
    'resonator' => ['Hall Resonator', 'Koleksi karakter', '#ff5fa8'],
    'armory' => ['Armory', 'Koleksi senjata', '#ffb86b'],
    'library' => ['Perpustakaan', 'Arsip cerita', '#8f8df7'],
    'glossary' => ['Glosarium', 'Istilah Solaris', '#f5c542'],
    'messages' => ['Pesan', 'Obrolan Resonator', '#c77dff'],
    'documents' => ['Dokumen', 'Catatan Solaris', '#c9976b'],
    'gallery' => ['Galeri', 'Namecard, title, achievement', '#4fd1b5'],
    'map' => ['Ruang Peta', 'Wilayah dan laporan area', '#7ecb55'],
    'bestiary' => ['Bestiary', 'Monster dan catatannya', '#e5544b'],
    'echo' => ['Ruang Echo', 'Echo dan set Sonata', '#46c8ff'],
];

/** A JSON file of data/, or an empty list when it is missing or broken. */
function data($name)
{
    $text = @file_get_contents(__DIR__ . "/data/$name.json");
    $json = $text === false ? null : json_decode($text, true);
    return is_array($json) ? $json : [];
}

function find($list, $id)
{
    foreach (is_array($list) ? $list : [] as $item) {
        if ((string) ($item['id'] ?? '') === $id) {
            return $item;
        }
    }
    return null;
}

/**
 * The preview of one entry, or null when the path names none.
 * "large" asks for a big picture below the text instead of a small one beside it.
 */
function entry($room, $id, $sub)
{
    switch ($room) {
        case 'resonator':
            $item = find(data('characters'), $id);
            if (!$item) {
                return null;
            }
            // The id is one from the list, so it is safe in a file name.
            $profile = data("profiles/$id");
            $facts = "{$item['element']} · {$item['weapon']} · {$item['rarity']}★";
            $art = "art/$id.webp";
            $large = is_file(__DIR__ . "/$art");
            return [
                'name' => $item['name'],
                'text' => trim($facts . '. ' . ($profile['introduction'] ?? '')),
                'picture' => $large ? $art : "art/faces/$id.webp",
                'large' => $large,
            ];

        case 'armory':
            $item = find(data('weapons'), $id);
            return $item ? [
                'name' => $item['name'],
                'text' => "{$item['type']} · {$item['rarity']}★. " . ($item['description'] ?? ''),
                'picture' => "art/weapons/$id.webp",
            ] : null;

        case 'library':
            $item = find(data('story'), $id);
            return $item ? [
                'name' => $item['name'],
                'text' => ($item['summary'] ?? '') ?: ($item['category'] ?? ''),
                'picture' => $item['picture'] ?? null,
                'large' => true,
            ] : null;

        case 'glossary':
            $item = find(data('glossary'), $id);
            return $item ? ['name' => $item['name'], 'text' => $item['text'] ?? ''] : null;

        case 'messages':
            $item = find(data('chat'), $id);
            return $item ? [
                'name' => $item['name'],
                'text' => ($item['description'] ?? '') ?: ($item['preview'] ?? ''),
                'picture' => $item['avatar'] ?? null,
            ] : null;

        case 'documents':
            $item = find(data('documents'), $id);
            return $item ? [
                'name' => $item['title'],
                'text' => $item['text'] ?? '',
                'picture' => $item['pictures'][0] ?? null,
                'large' => true,
            ] : null;

        case 'bestiary':
            $item = find(data('bestiary'), $id);
            return $item ? [
                'name' => $item['name'],
                'text' => "{$item['rank']} · {$item['element']}. " . ($item['rumor'] ?? ''),
                'picture' => $item['icon'] ?? null,
            ] : null;

        case 'echo':
            $item = find(data('echo')['echoes'] ?? [], $id);
            return $item ? [
                'name' => $item['name'],
                'text' => "Cost {$item['cost']} · {$item['element']}. " . ($item['skill']['text'] ?? ''),
                'picture' => $item['icon'] ?? null,
            ] : null;

        case 'gallery':
            $gallery = data('gallery');
            if ($id === 'namecard') {
                $item = find($gallery['cards'] ?? [], $sub);
                return $item ? [
                    'name' => $item['name'],
                    'text' => 'Namecard',
                    'picture' => $item['picture'] ?? null,
                    'large' => true,
                ] : null;
            }
            if ($id === 'title') {
                $item = find($gallery['titles'] ?? [], $sub);
                return $item ? [
                    'name' => $item['name'],
                    'text' => 'Title',
                    'picture' => $item['background'] ?? null,
                ] : null;
            }
            if ($id === 'achievement') {
                foreach ($gallery['achievements'] ?? [] as $category) {
                    $item = find($category['groups'] ?? [], $sub);
                    if ($item) {
                        return [
                            'name' => $item['name'],
                            'text' => 'Achievement · ' . $category['name'],
                            'picture' => $item['icon'] ?? null,
                        ];
                    }
                }
            }
            return null;

        case 'map':
            $region = find(data('map')['regions'] ?? [], $id);
            if (!$region) {
                return null;
            }
            $area = find($region['areas'] ?? [], $sub);
            if ($area) {
                return [
                    'name' => $area['name'],
                    'text' => $region['name'] . '. ' . ($area['reports'][0]['text'] ?? ''),
                    'picture' => $area['picture'] ?? null,
                    'large' => true,
                ];
            }
            return [
                'name' => $region['name'],
                'text' => $region['description'] ?? '',
                'picture' => $region['icon'] ?? null,
            ];
    }
    return null;
}

/** The text of the game without its marks, on one line and short enough for a preview. */
function excerpt($text)
{
    $text = preg_replace(['/<[^<>]*>/', '/^# /m', '/\s+/'], ['', '', ' '], (string) $text);
    $text = trim((string) $text);
    if (preg_match('/^.{200}(?=.)/su', $text, $match)) {
        return rtrim($match[0]) . '…';
    }
    return $text;
}

function escape($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// The folder of the site, with a slash at both ends.
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/';
$path = (string) strtok($_SERVER['REQUEST_URI'] ?? '/', '?');
$route = strpos($path, $base) === 0 ? substr($path, strlen($base)) : '';
$parts = array_map('rawurldecode', explode('/', trim($route, '/')));
$room = $parts[0] ?? '';

list($name, $summary, $color) = ROOMS[$room]
    ?? [SITE, 'Solaris Museum, museum 3D buatan penggemar.', '#8f8df7'];
$page = entry($room, $parts[1] ?? '', $parts[2] ?? '') ?: ['name' => $name, 'text' => $summary];

// The host comes from the visitor, so anything that does not look like one is dropped.
$host = $_SERVER['HTTP_HOST'] ?? '';
$origin = '';
if (preg_match('/^[A-Za-z0-9.\-]+(:\d+)?$/', $host)) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $origin = ($secure ? 'https://' : 'http://') . $host;
}

$title = $page['name'] === SITE ? SITE : "{$page['name']} · " . SITE;
// Some entries have no text of their own.
$description = excerpt($page['text']) ?: $summary;
$picture = $page['picture'] ?? null;
// Preview services need a full address.
$image = $origin && $picture && is_file(__DIR__ . "/$picture")
    ? $origin . $base . implode('/', array_map('rawurlencode', explode('/', $picture)))
    : null;

$tags = [
    ['name', 'description', $description],
    ['name', 'theme-color', $color],
    ['property', 'og:site_name', SITE],
    ['property', 'og:type', 'website'],
    ['property', 'og:title', $page['name']],
    ['property', 'og:description', $description],
    ['property', 'og:url', $origin ? $origin . $path : null],
    ['property', 'og:image', $image],
    ['name', 'twitter:card', $image && !empty($page['large']) ? 'summary_large_image' : 'summary'],
];
$head = '<title>' . escape($title) . "</title>\n";
foreach ($tags as list($key, $label, $value)) {
    if ($value !== null && $value !== '') {
        $head .= "    <meta $key=\"$label\" content=\"" . escape($value) . "\" />\n";
    }
}

$html = (string) file_get_contents(__DIR__ . '/index.html');
$html = preg_replace(['#<title>.*?</title>\s*#s', '#<meta name="description"[^>]*>\s*#'], '', $html);

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache');
echo str_replace('</head>', "  $head  </head>", $html);
