// ========== 预留配置，留空则自动识别 ==========
const PRESET_UUID    = '';
const PRESET_PORT    = '';
const PRESET_HOST    = '';
const PRESET_NAME    = '';
const PRESET_SUB     = '';
// =============================================

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const net = require('net');

const HOME = process.env.HOME || '/tmp';
const UUID_FILE = `${HOME}/uuid.txt`;
const CONFIG_FILE = `${HOME}/xray-config.json`;
const XRAY_DIR = `${HOME}/xray`;
const XRAY_BIN_PATH = `${XRAY_DIR}/xray`;
const WS_PATH_VMESS  = '/fengyue-vm';
const WS_PATH_VLESS  = '/fengyue-vl';
const WS_PATH_TROJAN = '/fengyue-tr';
const V_VMESS_PORT  = 10000;
const V_VLESS_PORT  = 10001;
const V_TROJAN_PORT = 10002;

function getFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function httpGet(url, timeout = 5000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function download(url, dest) {
  try { execSync(`curl -sL "${url}" -o "${dest}"`); return; } catch {}
  try { execSync(`wget -q "${url}" -O "${dest}"`); return; } catch {}
  throw new Error(`下载失败: ${url}`);
}

async function downloadXray() {
  if (fs.existsSync(XRAY_BIN_PATH)) return XRAY_BIN_PATH;

  const arch = os.arch();
  const archMap = {
    'x64': 'linux-64',
    'arm64': 'linux-arm64-v8a',
    'arm': 'linux-arm32-v7a'
  };
  const platform = archMap[arch] || 'linux-64';

  console.log(`正在下载 xray (${platform})...`);

  const release = await httpGet('https://api.github.com/repos/XTLS/Xray-core/releases/latest');
  let version = 'v25.4.30';
  try { version = JSON.parse(release).tag_name || version; } catch {}

  const url = `https://github.com/XTLS/Xray-core/releases/download/${version}/Xray-${platform}.zip`;
  fs.mkdirSync(XRAY_DIR, { recursive: true });
  download(url, `${HOME}/xray.zip`);
  execSync(`unzip -qo "${HOME}/xray.zip" -d "${XRAY_DIR}" && chmod +x "${XRAY_BIN_PATH}"`);
  console.log('xray 下载完成');
  return XRAY_BIN_PATH;
}

function isIP(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^[0-9a-fA-F:]+$/.test(host);
}

async function main() {
  let UUID = PRESET_UUID || process.env.UUID || '';
  if (UUID) {
    fs.writeFileSync(UUID_FILE, UUID);
  } else if (fs.existsSync(UUID_FILE)) {
    UUID = fs.readFileSync(UUID_FILE, 'utf8').trim();
  } else {
    UUID = crypto.randomUUID();
    fs.writeFileSync(UUID_FILE, UUID);
  }

  // Trojan 密码直接用 UUID
  const TROJAN_PASS = UUID;

  const INBOUND_PORT = PRESET_PORT
    ? parseInt(PRESET_PORT)
    : process.env.PORT
      ? parseInt(process.env.PORT)
      : await getFreePort();

  const SUB_RAW = PRESET_SUB || process.env.SUB || 'sub';
  const SUB_PATH = '/' + SUB_RAW.replace(/^\//, '');

  let HOST = '';
  let PLATFORM = '';

  if (PRESET_HOST) {
    HOST = PRESET_HOST;
  } else if (process.env.DOMAIN) {
    HOST = process.env.DOMAIN;
  } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    HOST = process.env.RAILWAY_PUBLIC_DOMAIN;
    PLATFORM = 'Railway';
  } else if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    HOST = process.env.RENDER_EXTERNAL_HOSTNAME;
    PLATFORM = 'Render';
  } else if (process.env.ZEABUR_DOMAIN) {
    HOST = process.env.ZEABUR_DOMAIN;
    PLATFORM = 'Zeabur';
  } else if (process.env.KOYEB_PUBLIC_DOMAIN) {
    HOST = process.env.KOYEB_PUBLIC_DOMAIN;
    PLATFORM = 'Koyeb';
  } else if (process.env.VCAP_APPLICATION) {
    try {
      const vcap = JSON.parse(process.env.VCAP_APPLICATION);
      HOST = vcap.application_uris?.[0] || '';
      PLATFORM = 'CloudFoundry';
    } catch {}
  }

  if (!HOST) {
    HOST = await httpGet('https://api.ipify.org') ||
           await httpGet('https://ip.sb') ||
           'your-domain.com';
  }

  const TLS = isIP(HOST) ? 'none' : 'tls';
  const CLIENT_PORT = isIP(HOST) ? String(INBOUND_PORT) : '443';

  const COUNTRY = await httpGet('https://ipinfo.io/country') ||
                  await httpGet('https://ifconfig.co/country-iso') ||
                  '';

  let NAME = PRESET_NAME || process.env.NAME || '';
  if (!NAME) {
    if (PLATFORM) {
      NAME = COUNTRY ? `${COUNTRY}-${PLATFORM}` : PLATFORM;
    } else {
      let ASN_ORG = await httpGet('https://ipinfo.io/org') ||
                    await httpGet('https://ifconfig.co/org') ||
                    '';
      ASN_ORG = ASN_ORG
        .replace(/^AS\d+\s+/, '')
        .replace(/,?\s*Inc\.?$/, '')
        .replace(/,?\s*LLC\.?/g, '')
        .replace(/,?\s*Ltd\.?/g, '')
        .replace(/,?\s*Corp\.?/g, '')
        .trim()
        .substring(0, 20);
      NAME = COUNTRY && ASN_ORG ? `${COUNTRY}-${ASN_ORG}` :
             COUNTRY ? `${COUNTRY}-xray` : 'xray';
    }
  }

  const config = {
    log: { loglevel: 'warning' },
    inbounds: [
      {
        port: V_VMESS_PORT,
        listen: '127.0.0.1',
        protocol: 'vmess',
        settings: { clients: [{ id: UUID, alterId: 0 }] },
        streamSettings: { network: 'ws', wsSettings: { path: WS_PATH_VMESS } }
      },
      {
        port: V_VLESS_PORT,
        listen: '127.0.0.1',
        protocol: 'vless',
        settings: { clients: [{ id: UUID, flow: '' }], decryption: 'none' },
        streamSettings: { network: 'ws', wsSettings: { path: WS_PATH_VLESS } }
      },
      {
        port: V_TROJAN_PORT,
        listen: '127.0.0.1',
        protocol: 'trojan',
        settings: { clients: [{ password: TROJAN_PASS }] },
        streamSettings: { network: 'ws', wsSettings: { path: WS_PATH_TROJAN } }
      }
    ],
    outbounds: [{ protocol: 'freedom', settings: {} }]
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

  let xrayBin = '';
  const xrayPaths = ['xray', '/usr/local/bin/xray', '/usr/bin/xray'];
  for (const p of xrayPaths) {
    try { execSync(`which ${p} 2>/dev/null || test -x ${p}`); xrayBin = p; break; } catch {}
  }
  if (!xrayBin) xrayBin = await downloadXray();

  const xrayEnv = { ...process.env };
  delete xrayEnv.PORT;

  const xray = spawn(xrayBin, ['run', '-config', CONFIG_FILE], {
    stdio: 'inherit',
    env: xrayEnv
  });
  xray.on('exit', (code) => process.exit(code));

  const INDEX_HTML = fs.existsSync('./index.html')
    ? fs.readFileSync('./index.html', 'utf8')
    : '<html><body><h1>Hello World</h1></body></html>';

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === SUB_PATH) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(global.SUB_CONTENT || '');
    } else if (url === WS_PATH_VMESS || url === WS_PATH_VLESS || url === WS_PATH_TROJAN) {
      res.writeHead(400);
      res.end('Bad Request');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(INDEX_HTML);
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const path = req.url.split('?')[0];
    let targetPort;

    if (path === WS_PATH_VMESS) {
      targetPort = V_VMESS_PORT;
    } else if (path === WS_PATH_VLESS) {
      targetPort = V_VLESS_PORT;
    } else if (path === WS_PATH_TROJAN) {
      targetPort = V_TROJAN_PORT;
    } else {
      socket.destroy();
      return;
    }

    const proxy = net.connect(targetPort, '127.0.0.1', () => {
      proxy.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
        '\r\n\r\n'
      );
      proxy.write(head);
      socket.pipe(proxy);
      proxy.pipe(socket);
    });
    proxy.on('error', () => socket.destroy());
    socket.on('error', () => proxy.destroy());
  });

  server.listen(INBOUND_PORT, '0.0.0.0', () => {
    console.log(`HTTP 服务启动，端口 ${INBOUND_PORT}`);
  });

  const VMESS_OBJ = {
    v: '2', ps: NAME, add: HOST, port: CLIENT_PORT,
    id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none',
    host: HOST, path: WS_PATH_VMESS, tls: TLS
  };
  const VMESS_LINK = 'vmess://' + Buffer.from(JSON.stringify(VMESS_OBJ)).toString('base64');

  const VLESS_LINK = `vless://${UUID}@${HOST}:${CLIENT_PORT}` +
    `?encryption=none&security=${TLS}&type=ws&host=${HOST}` +
    `&path=${encodeURIComponent(WS_PATH_VLESS)}#${encodeURIComponent(NAME)}`;

  const TROJAN_LINK = `trojan://${TROJAN_PASS}@${HOST}:${CLIENT_PORT}` +
    `?security=${TLS}&type=ws&host=${HOST}` +
    `&path=${encodeURIComponent(WS_PATH_TROJAN)}#${encodeURIComponent(NAME)}`;

  const ALL_LINKS = [VMESS_LINK, VLESS_LINK, TROJAN_LINK].join('\n');
  const SUB_BASE64 = Buffer.from(ALL_LINKS).toString('base64');
  global.SUB_CONTENT = SUB_BASE64;

  const SUB_FILE = `${process.cwd()}/sub.txt`;
  fs.writeFileSync(SUB_FILE, SUB_BASE64);

  console.log('================= 订阅内容 =================');
  console.log(SUB_BASE64);
  console.log('============================================');
  console.log(`订阅地址: https://${HOST}${SUB_PATH}`);
  console.log(`节点文件: ${SUB_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
