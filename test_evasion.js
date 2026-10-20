/**
 * test_evasion.js - 验证 ADAS 遇到前方慢车与道路障碍物时的主动紧急闪避 (AES / Evasive Dodge) 避障能力
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8098;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

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
  console.log(`Evasion test server running on ${PORT}`);
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9342;
  const browserProc = spawn(browserPath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--user-data-dir=' + path.join(__dirname, '.browser-evasion-profile'),
    `http://localhost:${PORT}`
  ]);

  await new Promise(r => setTimeout(r, 2000));

  http.get(`http://localhost:${debugPort}/json`, (res) => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', async () => {
      try {
        const list = JSON.parse(raw);
        const page = list.find(t => t.type === 'page');
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
          await send('Console.enable');
          await send('Runtime.enable');

          let errors = [];
          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
              errors.push(msg.params.args.map(a => a.value || a.description).join(' '));
            } else if (msg.method === 'Runtime.exceptionThrown') {
              errors.push(msg.params.exceptionDetails.text);
            }
          };

          await new Promise(r => setTimeout(r, 1500));

          console.log('[Evasion Test] Starting simulation in ADAS Smart Driving mode...');
          await send('Runtime.evaluate', {
            expression: `
              document.getElementById("btn-start-drive").click();
              window.gameApp.adas.enable();
              window.gameApp.adas.setCruiseSpeed(80);
            `
          });

          // 等待车辆起步加速
          await new Promise(r => setTimeout(r, 2000));

          console.log('[Evasion Test] Placing a stationary obstacle vehicle ahead in current lane...');
          const initialLaneEval = await send('Runtime.evaluate', {
            expression: `
              (() => {
                const app = window.gameApp;
                const pZ = app.vehicle.position.z;
                const pX = app.vehicle.position.x;
                const currentLane = Math.round((pX - app.world.getLaneX(0)) / 3.75);

                // 将一辆 NPC 汽车直接设为本车道正前方 45 米处静止的故障障碍车
                const leadNpc = app.traffic.vehicles[0];
                leadNpc.lane = currentLane;
                leadNpc.targetLane = currentLane;
                leadNpc.group.position.set(app.world.getLaneX(currentLane), 0, pZ - 45);
                leadNpc.speed = 0;
                leadNpc.targetSpeed = 0;

                return {
                  playerLane: currentLane,
                  obstacleZ: leadNpc.group.position.z,
                  playerSpeed: app.vehicle.speed * 3.6
                };
              })()
            `,
            returnByValue: true
          });
          console.log('Setup details:', JSON.stringify(initialLaneEval.result.value, null, 2));

          // 运行 2.5 秒，让 ADAS 识别到静止障碍车并自主变道闪避
          await new Promise(r => setTimeout(r, 2500));

          const evasionResult = await send('Runtime.evaluate', {
            expression: `
              (() => {
                const app = window.gameApp;
                return {
                  gameState: app.gameState,
                  currentLane: Math.round((app.vehicle.position.x - app.world.getLaneX(0)) / 3.75),
                  playerPosX: app.vehicle.position.x,
                  playerPosZ: app.vehicle.position.z,
                  targetLane: app.adas.targetLane,
                  isChangingLane: app.adas.isChangingLane,
                  speedKmh: app.vehicle.speed * 3.6,
                  hasCollided: app.gameState === 'ACCIDENT'
                };
              })()
            `,
            returnByValue: true
          });
          console.log('Evasion Result after 2.5s:', JSON.stringify(evasionResult.result.value, null, 2));

          const res = evasionResult.result.value;
          const initialLane = initialLaneEval.result.value.playerLane;

          if (res.hasCollided) {
            errors.push('ADAS crashed into the obstacle without dodging!');
          } else if (res.currentLane === initialLane && !res.isChangingLane) {
            errors.push('ADAS stayed in the same lane and did not dodge!');
          } else {
            console.log(`SUCCESS! ADAS detected the stationary vehicle ahead and successfully dodged from Lane ${initialLane} to Lane ${res.targetLane} (Current X: ${res.playerPosX.toFixed(2)}m)!`);
          }

          if (errors.length > 0) {
            console.error('FAILED with errors:', errors);
            cleanup(1);
          } else {
            console.log('ALL TESTS PASSED: ADAS automatically dodges obstacles cleanly!');
            cleanup(0);
          }
        };
      } catch (err) {
        console.error('Test error:', err);
        cleanup(1);
      }
    });
  });

  function cleanup(code = 0) {
    try { browserProc.kill(); } catch (e) {}
    server.close();
    process.exit(code);
  }
});
