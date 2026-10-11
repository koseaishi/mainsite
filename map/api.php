<?php
declare(strict_types=1);

const MAP_API_DEV_TOOLS_ENABLED = false;
const MAP_API_ROLE_NAMES = ['top', 'jungle', 'mid', 'bot', 'support'];
const MAP_API_TEAM_POSITIONS = [
    'red' => [
        'top' => [0.2135, 0.1042],
        'jungle' => [0.4954, 0.2270],
        'mid' => [0.5502, 0.4649],
        'bot' => [0.8491, 0.7533],
        'support' => [0.9224, 0.8269],
    ],
    'blue' => [
        'top' => [0.1193, 0.2039],
        'jungle' => [0.2282, 0.4772],
        'mid' => [0.4498, 0.5297],
        'bot' => [0.7718, 0.8267],
        'support' => [0.8452, 0.9011],
    ],
];
const MAP_API_ID_TO_ROLE = [
    1 => 'top', 2 => 'jungle', 3 => 'mid', 4 => 'bot', 5 => 'support',
    6 => 'top', 7 => 'jungle', 8 => 'mid', 9 => 'bot', 10 => 'support',
];
const MAP_API_SUPPORT_ITEMS = [
    'world atlas', 'runic compass', 'bounty of worlds', 'bloodsong',
    'celestial opposition', 'dream maker', 'solstice sleigh', "zaz'zak's realmspike",
    "spellthief's edge", 'frostfang', 'shard of true ice',
    'relic shield', "targon's buckler", 'bulwark of the mountain',
    'steel shoulderguards', 'runesteel spaulders', 'pauldrons of whiterock',
    'spectral sickle', 'harrowing crescent', 'black mist scythe',
];

function map_api_json(mixed $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function map_api_static_path(string $relative): string
{
    return __DIR__ . '/static/' . $relative;
}

function map_api_champion_entries(): array
{
    $path = map_api_static_path('champions.json');
    $contents = file_get_contents($path);
    if ($contents === false) {
        throw new RuntimeException('Champion data is unavailable');
    }

    $entries = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($entries)) {
        throw new RuntimeException('Champion data is invalid');
    }

    return $entries;
}

function map_api_champion_names(): array
{
    $names = [];
    foreach (map_api_champion_entries() as $entry) {
        $name = is_string($entry) ? $entry : ($entry['name'] ?? null);
        if (is_string($name) && $name !== '') {
            $names[] = $name;
        }
    }

    return $names;
}

function map_api_spell_names(): array
{
    $paths = glob(map_api_static_path('spells/*.png')) ?: [];
    $spells = [];
    foreach ($paths as $path) {
        $name = pathinfo($path, PATHINFO_FILENAME);
        $spells[strtolower($name)] = $name;
    }

    return $spells;
}

function map_api_is_opgg_url(string $url): bool
{
    try {
        $parts = parse_url($url);
    } catch (ValueError) {
        return false;
    }
    if (!is_array($parts)) {
        return false;
    }

    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower(rtrim((string)($parts['host'] ?? ''), '.'));
    $port = $parts['port'] ?? null;
    $validPort = $port === null || $port === ($scheme === 'https' ? 443 : 80);

    return in_array($scheme, ['http', 'https'], true)
        && ($host === 'op.gg' || str_ends_with($host, '.op.gg'))
        && !isset($parts['user'])
        && !isset($parts['pass'])
        && $validPort;
}

function map_api_resolve_url(string $base, string $location): string
{
    if (preg_match('~^https?://~i', $location)) {
        return $location;
    }

    $baseParts = parse_url($base);
    if (!is_array($baseParts) || !isset($baseParts['scheme'], $baseParts['host'])) {
        throw new RuntimeException('OP.GG returned an invalid redirect');
    }

    $origin = $baseParts['scheme'] . '://' . $baseParts['host'];
    if (isset($baseParts['port'])) {
        $origin .= ':' . $baseParts['port'];
    }
    if (str_starts_with($location, '//')) {
        return $baseParts['scheme'] . ':' . $location;
    }
    if (str_starts_with($location, '/')) {
        return $origin . $location;
    }

    $basePath = $baseParts['path'] ?? '/';
    $directory = substr($basePath, 0, (int)strrpos($basePath, '/') + 1);
    return $origin . $directory . $location;
}

function map_api_fetch_opgg(string $url): string
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException(
            'The PHP cURL extension is required for OP.GG match import. Enable it in konsoleH.'
        );
    }

    for ($redirects = 0; $redirects <= 5; $redirects++) {
        if (!map_api_is_opgg_url($url)) {
            throw new InvalidArgumentException('Only OP.GG links are supported');
        }

        $body = '';
        $location = null;
        $handle = curl_init($url);
        if ($handle === false) {
            throw new RuntimeException('Could not initialize the OP.GG request');
        }

        curl_setopt_array($handle, [
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'Mozilla/5.0',
            CURLOPT_HTTPHEADER => ['Accept: text/html,application/json'],
            CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body): int {
                if (strlen($body) + strlen($chunk) > 4 * 1024 * 1024) {
                    return 0;
                }
                $body .= $chunk;
                return strlen($chunk);
            },
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$location): int {
                if (stripos($line, 'Location:') === 0) {
                    $location = trim(substr($line, strlen('Location:')));
                }
                return strlen($line);
            },
        ]);

        $ok = curl_exec($handle);
        $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $error = curl_error($handle);
        curl_close($handle);

        if ($ok === false) {
            throw new RuntimeException(
                $error !== '' ? $error : 'Could not read the OP.GG response'
            );
        }
        if (in_array($status, [301, 302, 303, 307, 308], true) && $location !== null) {
            if ($redirects === 5) {
                throw new RuntimeException('OP.GG redirected too many times');
            }
            $url = map_api_resolve_url($url, $location);
            continue;
        }
        if ($status < 200 || $status >= 300) {
            throw new RuntimeException('OP.GG returned HTTP ' . $status);
        }

        return $body;
    }

    throw new RuntimeException('Could not read the OP.GG response');
}

function map_api_value(array $data, array $keys): mixed
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $data) && $data[$key] !== null && $data[$key] !== '') {
            return $data[$key];
        }
    }

    return null;
}

function map_api_normalize_role(mixed $value): ?string
{
    $role = strtolower(trim(str_replace('_', ' ', (string)($value ?? ''))));
    $aliases = [
        'top lane' => 'top', 'toplaner' => 'top',
        'jg' => 'jungle',
        'mid lane' => 'mid', 'middle' => 'mid',
        'bottom' => 'bot', 'bottom lane' => 'bot', 'adc' => 'bot', 'carry' => 'bot',
        'utility' => 'support',
    ];
    if (isset($aliases[$role])) {
        return $aliases[$role];
    }

    return in_array($role, MAP_API_ROLE_NAMES, true) ? $role : null;
}

function map_api_normalize_team(mixed $value): ?string
{
    $team = strtolower((string)($value ?? ''));
    if (in_array($team, ['100', 'blue', 'blue team'], true)) {
        return 'blue';
    }
    if (in_array($team, ['200', 'red', 'red team'], true)) {
        return 'red';
    }

    return null;
}

function map_api_participant(array $data): ?array
{
    $champion = map_api_value($data, ['championName', 'champion_name', 'champion']);
    if (is_array($champion)) {
        $champion = map_api_value($champion, ['name', 'key']);
    }
    $team = map_api_normalize_team(
        map_api_value($data, ['teamId', 'team_id', 'team', 'side', 'teamSide'])
    );
    $role = map_api_normalize_role(map_api_value($data, ['position', 'role', 'lane']));
    $spells = map_api_value($data, ['summonerSpells', 'summoner_spells', 'spells']);
    if (is_array($spells) && !array_is_list($spells)) {
        $spells = array_values($spells);
    }

    $spellNames = [];
    foreach (is_array($spells) ? $spells : [] as $spell) {
        if (is_array($spell)) {
            $spell = map_api_value($spell, ['name', 'spellName', 'key', 'image']);
        }
        if (!is_string($spell) && !is_numeric($spell)) {
            continue;
        }
        $name = pathinfo((string)$spell, PATHINFO_FILENAME);
        $name = preg_replace('/^Summoner/', '', $name) ?? $name;
        if ($name !== '') {
            $spellNames[] = $name;
        }
    }

    if (!is_string($champion) || $champion === '' || $team === null || count($spellNames) < 2) {
        return null;
    }

    return [
        'champion' => $champion,
        'team' => $team,
        'role' => $role,
        'spells' => array_slice($spellNames, 0, 2),
        'participantId' => map_api_value($data, ['participantId', 'participant_id', 'id']),
        'cs' => map_api_value($data, ['cs', 'minionsKilled', 'totalMinionsKilled']),
        'visionScore' => map_api_value($data, ['visionScore', 'vision_score']),
        'items' => map_api_value($data, ['items', 'item_list']),
    ];
}

function map_api_find_participants(mixed $value, array &$found): void
{
    if (!is_array($value)) {
        return;
    }

    if (!array_is_list($value)) {
        $participant = map_api_participant($value);
        if ($participant !== null) {
            $found[] = $participant;
        }
    }
    foreach ($value as $child) {
        map_api_find_participants($child, $found);
    }
}

function map_api_participants_from_ai(array $aiData, string $pageHtml): array
{
    $teams = is_array($aiData['teams'] ?? null) ? $aiData['teams'] : [];
    $raw = html_entity_decode(str_replace('\\"', '"', $pageHtml), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $spellIds = [
        1 => 'Cleanse', 3 => 'Exhaust', 4 => 'Flash', 6 => 'Ghost',
        7 => 'Heal', 11 => 'Smite', 12 => 'Teleport', 13 => 'Clarity',
        14 => 'Ignite', 21 => 'Barrier',
    ];
    $spellPattern = '~"champion":\{"id":\d+,(?:"key":"[^"]*",)?"name":"([^"]+)".*?'
        . '"team_key":"(?:RED|BLUE)".*?"spells":\[([^\]]*)\]~s';
    preg_match_all($spellPattern, $raw, $matches, PREG_SET_ORDER);

    $spellsByChampion = [];
    foreach ($matches as $match) {
        preg_match_all('/\d+/', $match[2], $ids);
        $spellsByChampion[$match[1]] = [];
        foreach (array_slice($ids[0], 0, 2) as $id) {
            $spellsByChampion[$match[1]][] = $spellIds[(int)$id] ?? '';
        }
    }

    $participants = [];
    foreach ($teams as $teamName => $teamData) {
        if (!is_array($teamData) || !is_array($teamData['participants'] ?? null)) {
            continue;
        }
        foreach ($teamData['participants'] as $participant) {
            if (!is_array($participant) || empty($participant['champion'])) {
                continue;
            }
            $champion = $participant['champion'];
            $participants[] = [
                'champion' => $champion,
                'team' => (string)$teamName,
                'role' => map_api_normalize_role($participant['position'] ?? $participant['role'] ?? null),
                'spells' => $spellsByChampion[$champion] ?? [],
                'participantId' => $participant['participantId'] ?? null,
                'cs' => $participant['cs'] ?? null,
                'visionScore' => $participant['visionScore'] ?? null,
                'items' => $participant['items'] ?? null,
            ];
        }
    }

    if (count($participants) !== 10) {
        return [];
    }
    foreach ($participants as $participant) {
        if (count($participant['spells']) < 2) {
            return [];
        }
    }

    return map_api_infer_missing_roles($participants);
}

function map_api_permutations(array $items): array
{
    if (count($items) <= 1) {
        return [$items];
    }

    $result = [];
    foreach ($items as $index => $item) {
        $remaining = $items;
        array_splice($remaining, $index, 1);
        foreach (map_api_permutations($remaining) as $tail) {
            $result[] = array_merge([$item], $tail);
        }
    }

    return $result;
}

function map_api_infer_missing_roles(array $participants): array
{
    foreach (['blue', 'red'] as $team) {
        $indexes = [];
        foreach ($participants as $index => $participant) {
            if ($participant['team'] === $team) {
                $indexes[] = $index;
            }
        }
        if (count($indexes) !== 5) {
            continue;
        }

        $roles = array_map(
            static fn(int $index): ?string => $participants[$index]['role'] ?? null,
            $indexes
        );
        if (count(array_filter($roles, static fn(?string $role): bool =>
            $role !== null && in_array($role, MAP_API_ROLE_NAMES, true)
        )) === 5 && count(array_unique($roles)) === 5) {
            continue;
        }

        $group = array_map(static fn(int $index): array => $participants[$index], $indexes);
        $teamHasSmite = false;
        foreach ($group as $participant) {
            foreach ($participant['spells'] ?? [] as $spell) {
                if (str_contains(strtolower((string)$spell), 'smite')) {
                    $teamHasSmite = true;
                }
            }
        }

        $score = static function (array $participant, string $role) use ($teamHasSmite): int {
            if (!empty($participant['role'])) {
                return $participant['role'] === $role ? 10000 : -10000;
            }

            $spells = array_map('strtolower', array_map('strval', $participant['spells'] ?? []));
            $hasSmite = count(array_filter($spells, static fn(string $spell): bool =>
                str_contains($spell, 'smite')
            )) > 0;
            $value = 0;
            if ($hasSmite) {
                $value += $role === 'jungle' ? 3000 : -3000;
            } elseif ($teamHasSmite && $role === 'jungle') {
                $value -= 3000;
            }

            $participantId = $participant['participantId'] ?? null;
            if (is_numeric($participantId)
                && (MAP_API_ID_TO_ROLE[(int)$participantId] ?? null) === $role
            ) {
                $value += 200;
            }

            $items = $participant['items'] ?? [];
            if (!is_array($items)) {
                $items = [];
            }
            $hasSupportItem = false;
            foreach ($items as $item) {
                foreach (MAP_API_SUPPORT_ITEMS as $supportItem) {
                    if (str_contains(strtolower((string)$item), $supportItem)) {
                        $hasSupportItem = true;
                        break 2;
                    }
                }
            }
            if ($hasSupportItem) {
                $value += $role === 'support' ? 500 : -500;
            }
            if (in_array('teleport', $spells, true) && in_array($role, ['top', 'mid'], true)) {
                $value += 20;
            }
            if (in_array('heal', $spells, true) && in_array($role, ['bot', 'support'], true)) {
                $value += 15;
            }

            return $value;
        };

        $bestPermutation = null;
        $bestScore = PHP_INT_MIN;
        foreach (map_api_permutations(MAP_API_ROLE_NAMES) as $permutation) {
            $total = 0;
            foreach ($group as $index => $participant) {
                $total += $score($participant, $permutation[$index]);
            }
            if ($total > $bestScore) {
                $bestScore = $total;
                $bestPermutation = $permutation;
            }
        }

        if ($bestPermutation !== null) {
            foreach ($indexes as $index => $participantIndex) {
                $participants[$participantIndex]['role'] = $bestPermutation[$index];
            }
        }
    }

    return $participants;
}

function map_api_parse_match(string $url): array
{
    if (!map_api_is_opgg_url($url)) {
        throw new InvalidArgumentException('Only OP.GG links are supported');
    }

    $html = map_api_fetch_opgg($url);
    $candidates = [];
    $scriptPattern = '~<script\b[^>]*type=["\']application/json["\'][^>]*>(.*?)</script>~is';
    preg_match_all($scriptPattern, $html, $scripts);
    foreach ($scripts[1] as $script) {
        $decoded = json_decode($script, true);
        if (is_array($decoded)) {
            map_api_find_participants($decoded, $candidates);
        }
    }

    if (count($candidates) === 10) {
        $candidates = map_api_infer_missing_roles($candidates);
    } else {
        $candidates = [];
    }

    if ($candidates === []) {
        $aiUrl = rtrim($url, '/') . '/ai.json';
        try {
            $aiData = json_decode(map_api_fetch_opgg($aiUrl), true, 512, JSON_THROW_ON_ERROR);
            if (is_array($aiData)) {
                $candidates = map_api_participants_from_ai($aiData, $html);
            }
        } catch (Throwable) {
            $candidates = [];
        }
    }
    if (count($candidates) !== 10) {
        throw new RuntimeException('The match page did not expose structured participant data');
    }

    $availableChampions = map_api_champion_names();
    $availableSpells = map_api_spell_names();
    $missingChampions = [];
    foreach ($candidates as $candidate) {
        if (!in_array($candidate['champion'], $availableChampions, true)) {
            $missingChampions[] = $candidate['champion'];
        }
    }
    $missingChampions = array_values(array_unique($missingChampions));
    sort($missingChampions);
    if ($missingChampions !== []) {
        throw new RuntimeException(
            'Missing champion PNGs in static/champions: ' . implode(', ', $missingChampions)
        );
    }

    $missingSpells = [];
    foreach ($candidates as $candidate) {
        foreach ($candidate['spells'] as $spell) {
            if (!isset($availableSpells[strtolower($spell)])) {
                $missingSpells[] = $spell;
            }
        }
    }
    $missingSpells = array_values(array_unique($missingSpells));
    sort($missingSpells);
    if ($missingSpells !== []) {
        throw new RuntimeException(
            'Missing spell PNGs in static/spells: ' . implode(', ', $missingSpells)
        );
    }

    $unique = [];
    foreach ($candidates as $candidate) {
        $team = $candidate['team'];
        $role = $candidate['role'];
        if (isset(MAP_API_TEAM_POSITIONS[$team][$role])) {
            $unique[$team . ':' . $role] = $candidate;
        }
    }
    if (count($unique) !== 10) {
        throw new RuntimeException('Could not identify all ten champions, teams, and roles');
    }

    $layout = [];
    foreach ($unique as $candidate) {
        [$x, $y] = MAP_API_TEAM_POSITIONS[$candidate['team']][$candidate['role']];
        $layout[] = [
            'champion' => $candidate['champion'],
            'x' => $x,
            'y' => $y,
            'border' => $candidate['team'] === 'red' ? 2 : 1,
            'spells' => array_map(
                static fn(string $spell): string => $availableSpells[strtolower($spell)],
                $candidate['spells']
            ),
        ];
    }

    return ['layout' => $layout, 'strokes' => []];
}

function map_api_dispatch(): never
{
    $route = trim((string)($_GET['route'] ?? ''), '/');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($route === 'spells' && $method === 'GET') {
        $spells = array_values(map_api_spell_names());
        sort($spells, SORT_NATURAL | SORT_FLAG_CASE);
        map_api_json($spells);
    }

    if ($route === 'import-match' && $method === 'POST') {
        $rawBody = file_get_contents('php://input');
        if ($rawBody === false || strlen($rawBody) > 16 * 1024) {
            map_api_json(['error' => 'Request body is too large'], 413);
        }
        $payload = json_decode($rawBody, true);
        if (!is_array($payload) || !is_string($payload['url'] ?? null)) {
            map_api_json(['error' => 'Expected a JSON object with a match URL'], 400);
        }

        try {
            map_api_json(map_api_parse_match($payload['url']));
        } catch (InvalidArgumentException $error) {
            map_api_json(['error' => $error->getMessage()], 400);
        } catch (RuntimeException $error) {
            error_log('Map match import failed: ' . $error->getMessage());
            $status = str_contains($error->getMessage(), 'cURL extension is required') ? 503 : 502;
            map_api_json(['error' => $error->getMessage()], $status);
        } catch (Throwable $error) {
            error_log('Map match import failed: ' . $error->getMessage());
            map_api_json(['error' => 'Could not read that match page'], 502);
        }
    }

    if ($route === 'champions/settings' && $method === 'POST') {
        if (!MAP_API_DEV_TOOLS_ENABLED) {
            map_api_json(['error' => 'Developer tools are disabled'], 403);
        }

        $rawBody = file_get_contents('php://input');
        $entries = is_string($rawBody) && strlen($rawBody) <= 256 * 1024
            ? json_decode($rawBody, true)
            : null;
        if (!is_array($entries) || !array_is_list($entries)) {
            map_api_json(['error' => 'Expected a list of champions'], 400);
        }

        try {
            $validNames = map_api_champion_names();
            $updated = [];
            foreach ($entries as $entry) {
                if (!is_array($entry)
                    || !is_string($entry['name'] ?? null)
                    || !in_array($entry['name'], $validNames, true)
                ) {
                    map_api_json(['error' => 'Invalid champion settings'], 400);
                }
                $updatedEntry = ['name' => $entry['name']];
                foreach (MAP_API_ROLE_NAMES as $role) {
                    $updatedEntry[$role] = (bool)($entry[$role] ?? false);
                }
                $updated[] = $updatedEntry;
            }

            $json = json_encode(
                $updated,
                JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );
            if ($json === false
                || file_put_contents(
                    map_api_static_path('champions.json'),
                    $json . "\n",
                    LOCK_EX
                ) === false
            ) {
                throw new RuntimeException('Could not save champion settings');
            }
        } catch (Throwable $error) {
            error_log('Map champion settings save failed: ' . $error->getMessage());
            map_api_json(['error' => 'Could not save champion settings'], 500);
        }

        map_api_json(['saved' => count($updated)]);
    }

    if (in_array($route, ['spells', 'import-match', 'champions/settings'], true)) {
        header('Allow: ' . ($route === 'spells' ? 'GET' : 'POST'));
        map_api_json(['error' => 'Method not allowed'], 405);
    }

    map_api_json(['error' => 'Not found'], 404);
}

if (isset($_GET['route']) || (
    isset($_SERVER['SCRIPT_FILENAME'])
    && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__
)) {
    map_api_dispatch();
}
