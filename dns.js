// amplification.js
// 用于测试域名的 DNS 放大倍率
// 运行: node amplification.js example.com

const dns = require('dns');
const dgram = require('dgram');
const colors = require('colors');

// 解析命令行参数
const domain = process.argv[2];
if (!domain) {
  console.error("用法: node amplification.js <域名>".red);
  process.exit(1);
}

// 构造 DNS 查询报文 (ANY 查询)
function buildDnsQuery(domain) {
  const parts = domain.split('.');
  let length = 12; // DNS 头部固定长度
  parts.forEach(p => length += p.length + 1);
  length += 1; // 最后的 0
  length += 4; // QTYPE + QCLASS

  const buf = Buffer.alloc(length);
  let offset = 0;

  // DNS Header
  buf.writeUInt16BE(0x1234, offset); offset += 2; // Transaction ID
  buf.writeUInt16BE(0x0100, offset); offset += 2; // Flags: recursion desired
  buf.writeUInt16BE(1, offset); offset += 2; // Questions
  buf.writeUInt16BE(0, offset); offset += 2; // Answer RRs
  buf.writeUInt16BE(0, offset); offset += 2; // Authority RRs
  buf.writeUInt16BE(0, offset); offset += 2; // Additional RRs

  // Question Section
  parts.forEach(p => {
    buf.writeUInt8(p.length, offset++);
    buf.write(p, offset);
    offset += p.length;
  });
  buf.writeUInt8(0, offset++); // 终止符

  buf.writeUInt16BE(0x00ff, offset); offset += 2; // QTYPE = ANY
  buf.writeUInt16BE(0x0001, offset); offset += 2; // QCLASS = IN

  return buf;
}

// 测试函数
function testAmplification(domain, dnsServer = "8.8.8.8") {
  const client = dgram.createSocket('udp4');
  const query = buildDnsQuery(domain);

  const start = Date.now();
  client.send(query, 53, dnsServer, (err) => {
    if (err) {
      console.error("发送失败:".red, err);
      client.close();
    }
  });

  client.on('message', (msg) => {
    const duration = Date.now() - start;
    const querySize = query.length;
    const responseSize = msg.length;
    const ratio = (responseSize / querySize).toFixed(2);

    console.log("============== DNS 放大测试 ==============".cyan);
    console.log(`域名: `.white + domain.green);
    console.log(`请求大小: `.white + `${querySize} bytes`.yellow);
    console.log(`响应大小: `.white + `${responseSize} bytes`.yellow);
    console.log(`放大倍率: `.white + ratio.red + "x");
    console.log(`耗时: `.white + `${duration} ms`.blue);
    console.log("=========================================".cyan);

    client.close();
  });

  client.on('error', (err) => {
    console.error("错误:".red, err);
    client.close();
  });
}

testAmplification(domain);