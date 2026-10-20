/**
 * test_runner.js - 自动化测试脚本：启动无头 Chrome 访问 http://localhost:8080 并监听所有控制台输出与异常
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8089;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

// 1. 本地测试服务器
const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('404');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, async () => {
  console.log(`Test server running at http://localhost:${PORT}`);

  // 2. 寻找 Chrome 或 Edge
  const browserPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const browserPath = browserPaths.find(p => fs.existsSync(p));
  if (!browserPath) {
    console.error('No browser executable found!');
    process.exit(1);
  }

  const debugPort = 9333;
  console.log(`Launching browser: ${browserPath}`);
  const browserProc = spawn(browserPath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--user-data-dir=' + path.join(__dirname, '.browser-test-profile'),
    `http://localhost:${PORT}`
  ]);

  // 等待 Chrome 启动
  await new Promise(r => setTimeout(r, 2000));

  // 获取 WebSocket URL
  http.get(`http://localhost:${debugPort}/json`, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', async () => {
      try {
        const list = JSON.parse(raw);
        const page = list.find(t => t.type === 'page');
        if (!page) {
          console.error('No target page found in CDP');
          cleanup();
          return;
        }

        console.log(`Connecting to page ws: ${page.webSocketDebuggerUrl}`);
        const WebSocket = globalThis.WebSocket;
        const ws = new WebSocket(page.webSocketDebuggerUrl);

        let msgId = 1;
        const send = (method, params = {}) => {
          return new Promise(resolve => {
            const id = msgId++;
            const handler = (event) => {
              const data = JSON.parse(event.data);
              if (data.id === id) {
                ws.removeEventListener('message', handler);
                resolve(data.result);
              }
            };
            ws.addEventListener('message', handler);
            ws.send(JSON.stringify({ id, method, params }));
          });
        };

        ws.onopen = async () => {
          console.log('CDP WebSocket connected!');
          await send('Console.enable');
          await send('Runtime.enable');

          let hasErrors = false;
          const errors = [];

          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.method === 'Runtime.consoleAPICalled') {
              const type = msg.params.type;
              const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
              console.log(`[Browser Console ${type}]: ${text}`);
              if (type === 'error') {
                hasErrors = true;
                errors.push(text);
              }
            } else if (msg.method === 'Runtime.exceptionThrown') {
              const details = msg.params.exceptionDetails;
              const text = details.exception ? (details.exception.description || details.exception.value) : details.text;
              console.error(`[Browser Exception]: ${text} at line ${details.lineNumber}:${details.columnNumber}`);
              hasErrors = true;
              errors.push(text);
            }
          };

          // 等待页面加载完成并执行操作
          await new Promise(r => setTimeout(r, 2000));

          // 验证 window.gameApp 存在
          const checkApp = await send('Runtime.evaluate', {
            expression: 'typeof window.gameApp !== "undefined"'
          });
          console.log('window.gameApp exists:', checkApp.result ? checkApp.result.value : false);

          // 模拟点击进入驾驶
          console.log('Triggering startGame...');
          await send('Runtime.evaluate', {
            expression: 'document.getElementById("btn-start-drive").click()'
          });

          // 运行几秒模拟行驶
          await new Promise(r => setTimeout(r, 2500));

          // 测试切换视角
          console.log('Testing Camera View toggle (V)...');
          await send('Runtime.evaluate', {
            expression: 'window.gameApp.cameraManager.toggleView()'
          });
          await new Promise(r => setTimeout(r, 800));

          // 测试切换智驾模式 (C)
          console.log('Testing ADAS toggle (C)...');
          await send('Runtime.evaluate', {
            expression: 'window.gameApp.adas.toggle()'
          });
          await new Promise(r => setTimeout(r, 1000));

          // 测试切换昼夜 (N)
          console.log('Testing Day/Night toggle (N)...');
          await send('Runtime.evaluate', {
            expression: 'window.gameApp.toggleDayNight()'
          });
          await new Promise(r => setTimeout(r, 800));

          // 测试语言切换
          console.log('Testing Language toggle...');
          await send('Runtime.evaluate', {
            expression: 'document.getElementById("btn-lang-toggle").click()'
          });
          await new Promise(r => setTimeout(r, 800));

          // 测试开关无失误模式
          console.log('Testing Flawless toggle...');
          await send('Runtime.evaluate', {
            expression: 'document.getElementById("btn-hud-flawless").click()'
          });
          await new Promise(r => setTimeout(r, 800));

          // 检查车辆当前状态与物理运行
          const vehicleStatus = await send('Runtime.evaluate', {
            expression: `({
              speed: window.gameApp.vehicle.speed,
              gear: window.gameApp.vehicle.gear,
              adasActive: window.gameApp.adas.isActive,
              cameraMode: window.gameApp.cameraManager.currentMode,
              isNight: window.gameApp.isNight,
              flawless: window.gameApp.adas.flawlessMode,
              roadChunks: window.gameApp.world.chunks.length,
              npcCount: window.gameApp.traffic.vehicles.length
            })`,
            returnByValue: true
          });
          console.log('Simulation Status:', JSON.stringify(vehicleStatus.result.value, null, 2));

          if (hasErrors) {
            console.error('FAILED: Browser had console errors:', errors);
          } else {
            console.log('SUCCESS: All tests passed with 0 console errors and 0 exceptions!');
          }

          cleanup(hasErrors ? 1 : 0);
        };
      } catch (e) {
        console.error('CDP JSON parse error:', e);
        cleanup(1);
      }
    });
  }).on('error', (err) => {
    console.error('HTTP connect to Chrome error:', err);
    cleanup(1);
  });

  function cleanup(code = 0) {
    try { browserProc.kill(); } catch (e) {}
    server.close();
    process.exit(code);
  }
});
