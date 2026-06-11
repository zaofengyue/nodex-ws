# nodex-ws

基于 xray 的多协议代理工具，同时支持 VMess、VLESS、Trojan 三种协议，支持源码部署和 Docker 镜像部署，自动识别平台域名和节点名称。

## 工作原理

```
客户端 → 平台域名:443 → Node.js HTTP 服务 → xray(内部)
```

适用于有对外路由的平台（Railway、Render、Zeabur、CloudFoundry 等），不适用于没有对外路由的平台（如 idx、SAP BAS 等，请使用 nodex-argo）。

## 部署方式

### 方式一：源码部署（适用于 Node.js 平台）

上传以下文件即可：

```
index.js
package.json
index.html（可选，自定义伪装页面）
```

或直接下载 [Releases](https://github.com/zaofengyue/nodex-ws/releases) 里的 `nodex-ws.zip` 解压后上传。

### 方式二：Docker 镜像部署

```bash
docker pull ghcr.io/zaofengyue/nodex-ws:latest
```

```bash
docker run -d \
  -e DOMAIN=你的域名 \
  -p 3000:3000 \
  ghcr.io/zaofengyue/nodex-ws:latest
```

## 支持平台

| 平台 | 部署方式 | 域名自动识别 |
|---|---|---|
| Railway | 源码 / Docker | ✅ |
| Render | 源码 / Docker | ✅ |
| Zeabur | 源码 / Docker | ✅ |
| Koyeb | 源码 / Docker | ✅ |
| CloudFoundry | 源码 / Docker | ✅ |
| 其他 VPS / 容器平台 | Docker | 自动获取公网 IP |

## 环境变量

| 变量名 | 说明 | 默认值 |
|---|---|---|
| `UUID` | VMess/VLESS 唯一ID | 自动生成 |
| `TROJAN_PASS` | Trojan 密码 | 自动生成 |
| `PORT` | 监听端口 | 平台注入或自动 |
| `DOMAIN` | 手动指定域名或公网 IP | 自动识别 |
| `NAME` | 节点名称 | 自动识别国家+平台/ASN |
| `SUB` | 订阅路径 | `sub` |

也可以在 `index.js` 顶部预留配置里填写，优先级高于环境变量：

```javascript
const PRESET_UUID        = '';
const PRESET_TROJAN_PASS = '';
const PRESET_PORT        = '';
const PRESET_HOST        = '';
const PRESET_NAME        = '';
const PRESET_SUB         = '';
```

## 访问地址

| 路径 | 内容 |
|---|---|
| `https://你的域名/` | 伪装页面 |
| `https://你的域名/sub` | 订阅链接（base64） |


## 使用cloudflare workers 或 snippets 反代域名给节点套cdn加速
```bash
export default {
    async fetch(request, env) {
        let url = new URL(request.url);
        if (url.pathname.startsWith('/')) {
            var arrStr = [
                'change.your.domain', // 此处单引号里填写你的节点伪装域名
            ];
            url.protocol = 'https:'
            url.hostname = getRandomArray(arrStr)
            let new_request = new Request(url, request);
            return fetch(new_request);
        }
        return env.ASSETS.fetch(request);
    },
};
function getRandomArray(array) {
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}
```

最低 256MB，建议 512MB。

## 注意事项

- 仅供学习研究使用，请遵守当地法律法规
- 需要有对外路由的平台才能正常使用，没有对外路由请使用 nodex-argo
- xray 启动时自动下载，首次启动需要联网
