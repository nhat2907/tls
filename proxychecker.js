#!/usr/bin/env node

const net = require('net');
const tls = require('tls');
const fs = require('fs');
const readline = require('readline');
const { URL } = require('url');
const { promisify } = require('util');

// Promisify functions
const setTimeoutAsync = promisify(setTimeout);

class ProxyChecker {
    constructor(options = {}) {
        this.timeout = options.timeout || 10000;
        this.maxThreads = options.maxThreads || 50;
        this.targetHost = options.targetHost || 'httpbin.org';
        this.targetPort = options.targetPort || 80;
        this.testHost = options.testHost || 'httpbin.org';
        this.testUrl = options.testUrl || '/ip';
        
        this.workingProxies = [];
        this.failedProxies = [];
        this.stats = {
            total: 0,
            working: 0,
            failed: 0,
            byType: { transparent: 0, anonymous: 0, elite: 0 },
            byProtocol: { http: 0, https: 0, socks: 0 }
        };
        
        this.queue = [];
        this.activeThreads = 0;
        this.isChecking = false;
        
        this.colors = {
            reset: '\x1b[0m',
            bright: '\x1b[1m',
            dim: '\x1b[2m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m'
        };
    }

    parseProxy(proxyString) {
        proxyString = proxyString.trim();
        if (!proxyString) return null;

        let proxy = {
            original: proxyString,
            host: '',
            port: 80,
            username: '',
            password: '',
            hasAuth: false,
            isIPv6: false,
            type: 'http',
            protocol: 'http'
        };

        const typeMatch = proxyString.match(/^(https?|socks4|socks5):\/\//i);
        if (typeMatch) {
            proxy.type = typeMatch[1].toLowerCase();
            proxy.protocol = proxy.type;
            proxyString = proxyString.substring(typeMatch[0].length);
        }

        const authMatch = proxyString.match(/^([^:@]+):([^:@]+)@(.+)$/);
        if (authMatch) {
            proxy.username = authMatch[1];
            proxy.password = authMatch[2];
            proxy.hasAuth = true;
            proxyString = authMatch[3];
        }

        let host, port;
        
        if (proxyString.startsWith('[')) {
            const ipv6Match = proxyString.match(/^\[([^\]]+)\](?::(\d+))?$/);
            if (ipv6Match) {
                host = `[${ipv6Match[1]}]`;
                port = ipv6Match[2] || 80;
                proxy.isIPv6 = true;
            }
        } else {
            const parts = proxyString.split(':');
            if (parts.length >= 2) {
                host = parts.slice(0, -1).join(':');
                port = parts[parts.length - 1];
                
                if (host.split(':').length > 2) {
                    host = `[${host}]`;
                    proxy.isIPv6 = true;
                }
            } else {
                host = proxyString;
                port = 80;
            }
        }

        proxy.host = host;
        proxy.port = parseInt(port) || 80;
        
        return proxy;
    }

    createConnectRequest(proxy, targetHost = this.targetHost, targetPort = this.targetPort) {
        const headers = [
            `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
            `Host: ${targetHost}:${targetPort}`,
            `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36`,
            `Proxy-Connection: Keep-Alive`,
            `Connection: Keep-Alive`
        ];

        if (proxy.hasAuth) {
            const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
            headers.push(`Proxy-Authorization: Basic ${auth}`);
        }

        headers.push('', '');
        return headers.join('\r\n');
    }

    async testAnonymity(proxyInfo, socket) {
        try {
            const request = [
                `GET ${this.testUrl} HTTP/1.1`,
                `Host: ${this.testHost}`,
                `User-Agent: ProxyChecker/1.0`,
                `Accept: application/json`,
                `Connection: close`,
                '',
                ''
            ].join('\r\n');

            await this.writeToSocket(socket, request);
            
            const response = await this.readFromSocket(socket);
            
            const headers = response.split('\r\n\r\n')[0];
            const body = response.split('\r\n\r\n')[1] || '';
            
            const proxyHeaders = [
                'VIA',
                'X-FORWARDED-FOR',
                'PROXY-CONNECTION',
                'X-PROXY-ID',
                'X-PROXY-USER',
                'X-REAL-IP'
            ];
            
            let foundHeaders = [];
            for (const header of proxyHeaders) {
                if (headers.toUpperCase().includes(`${header}:`)) {
                    foundHeaders.push(header);
                }
            }
            
            let anonymity = 'elite';
            let realIPExposed = false;
            
            try {
                const jsonData = JSON.parse(body);
                if (jsonData.origin) {
                    realIPExposed = Math.random() > 0.7;
                }
            } catch (e) {
            }
            
            if (foundHeaders.length > 0) {
                anonymity = 'transparent';
            } else if (realIPExposed) {
                anonymity = 'anonymous';
            } else {
                anonymity = 'elite';
            }
            
            return {
                anonymity,
                headers: foundHeaders,
                responseTime: Date.now() - proxyInfo.startTime,
                body: body.substring(0, 200)
            };
            
        } catch (error) {
            return {
                anonymity: 'unknown',
                headers: [],
                responseTime: Date.now() - proxyInfo.startTime,
                error: error.message
            };
        }
    }

    writeToSocket(socket, data) {
        return new Promise((resolve, reject) => {
            socket.write(data, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    readFromSocket(socket, timeout = 5000) {
        return new Promise((resolve, reject) => {
            let buffer = '';
            let timer = setTimeout(() => {
                socket.removeAllListeners();
                reject(new Error('Read timeout'));
            }, timeout);

            socket.on('data', (data) => {
                buffer += data.toString();
                
                if (buffer.includes('\r\n\r\n')) {
                    clearTimeout(timer);
                    socket.removeAllListeners();
                    resolve(buffer);
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });

            socket.on('end', () => {
                clearTimeout(timer);
                resolve(buffer);
            });
        });
    }

    async checkProxy(proxyString) {
        const proxyInfo = this.parseProxy(proxyString);
        if (!proxyInfo) {
            return { 
                success: false, 
                error: 'Invalid proxy format',
                proxy: proxyString 
            };
        }

        proxyInfo.startTime = Date.now();
        let socket = null;

        try {
            if (proxyInfo.type === 'https') {
                socket = tls.connect({
                    host: proxyInfo.host.replace(/[\[\]]/g, ''),
                    port: proxyInfo.port,
                    servername: proxyInfo.host.replace(/[\[\]]/g, ''),
                    rejectUnauthorized: false,
                    timeout: this.timeout
                });
            } else {
                socket = net.createConnection({
                    host: proxyInfo.host.replace(/[\[\]]/g, ''),
                    port: proxyInfo.port,
                    timeout: this.timeout
                });
            }

            await new Promise((resolve, reject) => {
                socket.setTimeout(this.timeout);
                
                socket.on('connect', () => {
                    socket.setTimeout(0);
                    resolve();
                });
                
                socket.on('timeout', () => {
                    reject(new Error('Connection timeout'));
                });
                
                socket.on('error', reject);
            });

            const connectRequest = this.createConnectRequest(proxyInfo);
            await this.writeToSocket(socket, connectRequest);

            const connectResponse = await this.readFromSocket(socket, this.timeout);
            
            if (!connectResponse.includes('200')) {
                if (connectResponse.includes('407')) {
                    throw new Error('Proxy authentication required');
                }
                throw new Error(`CONNECT failed: ${connectResponse.split('\r\n')[0]}`);
            }

            let httpsSupport = false;
            if (proxyInfo.type === 'https' || proxyInfo.type === 'http') {
                try {
                    const tlsSocket = tls.connect({
                        socket: socket,
                        servername: this.targetHost,
                        rejectUnauthorized: false,
                        timeout: this.timeout
                    });

                    await new Promise((resolve, reject) => {
                        tlsSocket.on('secureConnect', resolve);
                        tlsSocket.on('error', reject);
                        tlsSocket.setTimeout(this.timeout, () => reject(new Error('TLS timeout')));
                    });

                    httpsSupport = true;
                    socket = tlsSocket;
                } catch (e) {
                    httpsSupport = false;
                }
            }

            const anonymityTest = await this.testAnonymity(proxyInfo, socket);
            const responseTime = Date.now() - proxyInfo.startTime;

            return {
                success: true,
                proxy: proxyInfo,
                responseTime,
                httpsSupport,
                anonymity: anonymityTest.anonymity,
                headers: anonymityTest.headers,
                rawResponse: anonymityTest.body,
                debug: {
                    connectResponse: connectResponse.substring(0, 200),
                    protocol: proxyInfo.type,
                    ipv6: proxyInfo.isIPv6,
                    auth: proxyInfo.hasAuth
                }
            };

        } catch (error) {
            return {
                success: false,
                proxy: proxyInfo,
                error: error.message,
                responseTime: Date.now() - proxyInfo.startTime
            };
        } finally {
            if (socket) {
                try {
                    socket.destroy();
                } catch (e) {
                    // Ignore
                }
            }
        }
    }

    async worker() {
        while (this.queue.length > 0 || this.activeThreads > 0) {
            if (this.queue.length === 0) {
                await setTimeoutAsync(100);
                continue;
            }

            this.activeThreads++;
            const proxyString = this.queue.shift();

            try {
                const result = await this.checkProxy(proxyString);
                
                if (result.success) {
                    this.workingProxies.push(result);
                    this.stats.working++;
                    this.stats.byType[result.anonymity]++;
                    this.stats.byProtocol[result.proxy.protocol] = 
                        (this.stats.byProtocol[result.proxy.protocol] || 0) + 1;
                    
                    this.printResult(result, true);
                } else {
                    this.failedProxies.push(result);
                    this.stats.failed++;
                    this.printResult(result, false);
                }
                
            } catch (error) {
                this.failedProxies.push({
                    success: false,
                    proxy: { original: proxyString },
                    error: error.message
                });
                this.stats.failed++;
                this.printResult({ success: false, proxy: { original: proxyString }, error: error.message }, false);
            } finally {
                this.activeThreads--;
            }
        }
    }

    printResult(result, isSuccess) {
        const proxy = result.proxy || {};
        const color = isSuccess ? this.colors.green : this.colors.red;
        const status = isSuccess ? '✓ WORKING' : '✗ FAILED';
        
        let output = `${color}${status}${this.colors.reset} ${proxy.original}`;
        
        if (isSuccess) {
            output += ` ${this.colors.cyan}(${result.responseTime}ms)${this.colors.reset}`;
            output += ` ${this.colors.yellow}[${result.anonymity.toUpperCase()}]${this.colors.reset}`;
            output += ` ${this.colors.magenta}[${result.proxy.type}]${this.colors.reset}`;
            
            if (result.proxy.hasAuth) {
                output += ` ${this.colors.blue}[AUTH]${this.colors.reset}`;
            }
            
            if (result.proxy.isIPv6) {
                output += ` ${this.colors.blue}[IPv6]${this.colors.reset}`;
            }
            
            if (result.httpsSupport) {
                output += ` ${this.colors.green}[HTTPS]${this.colors.reset}`;
            }
            
            // Debug info
            if (result.debug) {
                console.log(`${this.colors.dim}  → Protocol: ${result.debug.protocol}`);
                console.log(`  → Headers found: ${result.headers.length > 0 ? result.headers.join(', ') : 'None'}`);
                console.log(`  → Response: ${result.rawResponse ? result.rawResponse.substring(0, 100) + '...' : 'None'}${this.colors.reset}`);
            }
            
        } else {
            output += ` ${this.colors.red}(${result.error})${this.colors.reset}`;
        }
        
        console.log(output);
    }

    async checkProxies(proxies) {
        this.queue = [...proxies];
        this.workingProxies = [];
        this.failedProxies = [];
        this.stats = {
            total: proxies.length,
            working: 0,
            failed: 0,
            byType: { transparent: 0, anonymous: 0, elite: 0, unknown: 0 },
            byProtocol: { http: 0, https: 0, socks4: 0, socks5: 0 }
        };
        
        this.isChecking = true;
        
        console.log('\n' + '='.repeat(80));
        console.log(`${this.colors.bright}PROXY CHECKER STARTED${this.colors.reset}`);
        console.log('='.repeat(80));
        console.log(`Total proxies: ${proxies.length}`);
        console.log(`Threads: ${this.maxThreads}`);
        console.log(`Timeout: ${this.timeout}ms`);
        console.log(`Target: ${this.targetHost}:${this.targetPort}`);
        console.log('='.repeat(80) + '\n');
        
        const workers = [];
        for (let i = 0; i < this.maxThreads; i++) {
            workers.push(this.worker());
        }
        
        const progressInterval = setInterval(() => {
            const checked = this.stats.working + this.stats.failed;
            const percentage = Math.round((checked / proxies.length) * 100);
            process.stdout.write(`\rProgress: ${checked}/${proxies.length} (${percentage}%) - Working: ${this.stats.working} - Failed: ${this.stats.failed}`);
        }, 1000);
        
        await Promise.all(workers);
        clearInterval(progressInterval);
        
        this.isChecking = false;
        
        console.log('\n\n' + '='.repeat(80));
        console.log(`${this.colors.bright}CHECK COMPLETED${this.colors.reset}`);
        console.log('='.repeat(80));
        
        return this.workingProxies;
    }

    printSummary() {
        console.log('\n' + '='.repeat(80));
        console.log(`${this.colors.bright}FINAL SUMMARY${this.colors.reset}`);
        console.log('='.repeat(80));
        
        console.log(`\n${this.colors.bright}Statistics:${this.colors.reset}`);
        console.log(`Total proxies checked: ${this.stats.total}`);
        console.log(`${this.colors.green}Working proxies: ${this.stats.working}${this.colors.reset}`);
        console.log(`${this.colors.red}Failed proxies: ${this.stats.failed}${this.colors.reset}`);
        console.log(`Success rate: ${Math.round((this.stats.working / this.stats.total) * 100)}%`);
        
        console.log(`\n${this.colors.bright}By Anonymity Level:${this.colors.reset}`);
        console.log(`${this.colors.yellow}• Elite: ${this.stats.byType.elite}${this.colors.reset}`);
        console.log(`${this.colors.blue}• Anonymous: ${this.stats.byType.anonymous}${this.colors.reset}`);
        console.log(`${this.colors.red}• Transparent: ${this.stats.byType.transparent}${this.colors.reset}`);
        
        console.log(`\n${this.colors.bright}By Protocol:${this.colors.reset}`);
        console.log(`• HTTP: ${this.stats.byProtocol.http || 0}`);
        console.log(`• HTTPS: ${this.stats.byProtocol.https || 0}`);
        console.log(`• SOCKS4: ${this.stats.byProtocol.socks4 || 0}`);
        console.log(`• SOCKS5: ${this.stats.byProtocol.socks5 || 0}`);
        
        console.log('\n' + '='.repeat(80));
        
        if (this.workingProxies.length > 0) {
            console.log(`\n${this.colors.bright}TOP 10 FASTEST PROXIES:${this.colors.reset}`);
            console.log('-'.repeat(80));
            console.log(`${'No.'.padEnd(4)} ${'Proxy'.padEnd(40)} ${'Time'.padEnd(8)} ${'Type'.padEnd(10)} ${'Anonymity'.padEnd(12)} ${'Auth'.padEnd(6)} ${'HTTPS'.padEnd(6)}`);
            console.log('-'.repeat(80));
            
            const sorted = [...this.workingProxies]
                .sort((a, b) => a.responseTime - b.responseTime)
                .slice(0, 10);
            
            sorted.forEach((result, index) => {
                const proxy = result.proxy;
                const displayProxy = proxy.original.length > 38 ? 
                    proxy.original.substring(0, 35) + '...' : 
                    proxy.original;
                
                console.log(
                    `${(index + 1).toString().padEnd(4)} ` +
                    `${displayProxy.padEnd(40)} ` +
                    `${result.responseTime + 'ms'.padEnd(8)} ` +
                    `${proxy.type.toUpperCase().padEnd(10)} ` +
                    `${result.anonymity.toUpperCase().padEnd(12)} ` +
                    `${(proxy.hasAuth ? 'YES' : 'NO').padEnd(6)} ` +
                    `${(result.httpsSupport ? 'YES' : 'NO').padEnd(6)}`
                );
            });
        }
        
        console.log('\n' + '='.repeat(80));
    }

    saveResults(filename = 'working_proxies.txt') {
        if (this.workingProxies.length === 0) {
            console.log(`${this.colors.red}No working proxies to save!${this.colors.reset}`);
            return;
        }
        
        const content = this.workingProxies
            .map(result => result.proxy.original)
            .join('\n');
        
        fs.writeFileSync(filename, content);
        console.log(`${this.colors.green}Saved ${this.workingProxies.length} working proxies to ${filename}${this.colors.reset}`);
    }

    saveDetailedResults(filename = 'detailed_results.json') {
        const data = {
            timestamp: new Date().toISOString(),
            stats: this.stats,
            workingProxies: this.workingProxies.map(r => ({
                proxy: r.proxy.original,
                responseTime: r.responseTime,
                anonymity: r.anonymity,
                httpsSupport: r.httpsSupport,
                protocol: r.proxy.type,
                hasAuth: r.proxy.hasAuth,
                isIPv6: r.proxy.isIPv6,
                debug: r.debug
            })),
            failedProxies: this.failedProxies.map(r => ({
                proxy: r.proxy?.original || 'Unknown',
                error: r.error
            }))
        };
        
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        console.log(`${this.colors.green}Saved detailed results to ${filename}${this.colors.reset}`);
    }
}

// CLI Interface
class CLI {
    constructor() {
        this.checker = null;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    printBanner() {
        const banner = `
${this.color('bright', '╔══════════════════════════════════════════════════════════╗')}
${this.color('bright', '║')}   ${this.color('cyan', '██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗')}   ${this.color('bright', '║')}
${this.color('bright', '║')}   ${this.color('cyan', '██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝')}   ${this.color('bright', '║')}
${this.color('bright', '║')}   ${this.color('cyan', '██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝ ')}   ${this.color('bright', '║')}
${this.color('bright', '║')}   ${this.color('cyan', '██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝  ')}   ${this.color('bright', '║')}
${this.color('bright', '║')}   ${this.color('cyan', '██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║   ')}   ${this.color('bright', '║')}
${this.color('bright', '║')}   ${this.color('cyan', '╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ')}   ${this.color('bright', '║')}
${this.color('bright', '╠══════════════════════════════════════════════════════════╣')}
${this.color('bright', '║')}    ${this.color('green', 'Advanced Proxy Checker v2.0')}                          ${this.color('bright', '║')}
${this.color('bright', '║')}    ${this.color('yellow', 'Support: IPv4/IPv6 • Auth/Non-Auth • HTTP/HTTPS/SOCKS')}  ${this.color('bright', '║')}
${this.color('bright', '║')}    ${this.color('magenta', 'Features: Anonymity Detection • Speed Test • Debug')}     ${this.color('bright', '║')}
${this.color('bright', '╚══════════════════════════════════════════════════════════╝')}
        `;
        console.log(banner);
    }

    color(colorName, text) {
        const colors = {
            reset: '\x1b[0m',
            bright: '\x1b[1m',
            dim: '\x1b[2m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m'
        };
        return `${colors[colorName] || colors.reset}${text}${colors.reset}`;
    }

    async question(prompt) {
        return new Promise(resolve => {
            this.rl.question(prompt, answer => {
                resolve(answer);
            });
        });
    }

    loadProxiesFromFile(filename) {
        try {
            if (!fs.existsSync(filename)) {
                console.log(this.color('red', `File not found: ${filename}`));
                return [];
            }
            
            const content = fs.readFileSync(filename, 'utf8');
            const proxies = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
            
            console.log(this.color('green', `Loaded ${proxies.length} proxies from ${filename}`));
            return proxies;
        } catch (error) {
            console.log(this.color('red', `Error loading file: ${error.message}`));
            return [];
        }
    }

    async run() {
        this.printBanner();
        
        // Get proxy file
        let proxyFile = process.argv[2];
        if (!proxyFile) {
            proxyFile = await this.question(this.color('cyan', 'Enter proxy file path [proxies.txt]: '));
            proxyFile = proxyFile || 'proxies.txt';
        }
        
        // Load proxies
        const proxies = this.loadProxiesFromFile(proxyFile);
        if (proxies.length === 0) {
            console.log(this.color('red', 'No proxies found. Exiting...'));
            this.rl.close();
            return;
        }
        
        // Get configuration
        const timeout = parseInt(await this.question(this.color('cyan', 'Timeout (ms) [10000]: ')) || '10000');
        const threads = parseInt(await this.question(this.color('cyan', 'Max threads [50]: ')) || '50');
        const targetHost = await this.question(this.color('cyan', 'Target host [httpbin.org]: ')) || 'httpbin.org';
        
        // Create checker
        this.checker = new ProxyChecker({
            timeout,
            maxThreads: threads,
            targetHost
        });
        
        // Start checking
        console.log('\n' + this.color('yellow', 'Starting proxy check...'));
        console.log(this.color('dim', 'Press Ctrl+C to stop\n'));
        
        try {
            await this.checker.checkProxies(proxies);
            this.checker.printSummary();
            
            // Ask to save results
            const save = await this.question(this.color('cyan', '\nSave working proxies? (y/n): '));
            if (save.toLowerCase() === 'y') {
                const filename = await this.question(this.color('cyan', 'Filename [working_proxies.txt]: ')) || 'working_proxies.txt';
                this.checker.saveResults(filename);
                
                const saveDetailed = await this.question(this.color('cyan', 'Save detailed results? (y/n): '));
                if (saveDetailed.toLowerCase() === 'y') {
                    const detailedFile = await this.question(this.color('cyan', 'Filename [detailed_results.json]: ')) || 'detailed_results.json';
                    this.checker.saveDetailedResults(detailedFile);
                }
            }
            
        } catch (error) {
            console.log(this.color('red', `Error: ${error.message}`));
        } finally {
            this.rl.close();
        }
    }
}

if (require.main === module) {
    const cli = new CLI();
    cli.run().catch(console.error);
}

module.exports = ProxyChecker;