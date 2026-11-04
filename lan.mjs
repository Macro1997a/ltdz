import { networkInterfaces } from 'node:os';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT 必须为 1 到 65535 之间的端口号。');
  process.exit(1);
}
process.env.HOST = '0.0.0.0';
console.log('\n显真文创工作室 · 手机局域网测试模式 · 请使用示例数据，当前没有登录权限控制。');
console.log('手机与此电脑需连接同一个普通 Wi-Fi，保持此窗口运行。');
const addresses = [...new Set(Object.values(networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address))];
if (!addresses.length) console.log('未检测到局域网 IPv4 地址，请检查电脑网络连接。');
for (const address of addresses) console.log(`手机浏览器候选地址：http://${address}:${port}`);
console.log('如有多个地址，请选当前 Wi-Fi 的 IPv4 地址；虚拟网卡地址可能无法使用。\n');
await import('./server.mjs');
