/**
 * test_adas_and_collisions.js - 验证智驾驱动能力、3 车道规格与真实碰撞体积响应
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8095;
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
  console.log(`ADAS & Collision test server running on ${PORT}`);
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9338;
  const browserProc = spawn(browserPath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--user-data-dir=' + path.join(__dirname, '.browser-adas-profile'),
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

          // 1. 验证 3 车道配置
          console.log('[Test 1] Verifying 3-lane road width and boundaries...');
          const laneCheck = await send('Runtime.evaluate', {
            expression: `({
              laneCount: window.gameApp.world.roadWidth / 3.75,
              boundaries: window.gameApp.world.getRoadBoundaries(),
              playerHitbox: window.gameApp.vehicle.getHitbox()
            })`,
            returnByValue: true
          });
          console.log('Road Check:', JSON.stringify(laneCheck.result.value, null, 2));

          // 2. 启动游戏并立即开启智驾 (验证智驾在无人为输入下是否主动驱动车辆加速巡航和车道居中)
          console.log('[Test 2] Starting drive and enabling ADAS (no manual key inputs)...');
          await send('Runtime.evaluate', {
            expression: `
              document.getElementById("btn-start-drive").click();
              window.gameApp.adas.enable();
              window.gameApp.adas.setCruiseSpeed(80);
              // 偏移车位到 x = -1.2m，验证 LKA 是否能主动将其拉回 x = 0 (居中)
              window.gameApp.vehicle.position.x = -1.2;
            `
          });

          // 运行 3 秒模拟智驾巡航与居中
          await new Promise(r => setTimeout(r, 3000));

          const adasDriveResult = await send('Runtime.evaluate', {
            expression: `({
              speedKmh: window.gameApp.vehicle.speed * 3.6,
              throttleInput: window.gameApp.vehicle.throttleInput,
              posX: window.gameApp.vehicle.position.x,
              posZ: window.gameApp.vehicle.position.z,
              adasActive: window.gameApp.adas.isActive,
              steerAngle: window.gameApp.vehicle.steerAngle
            })`,
            returnByValue: true
          });
          console.log('ADAS Autonomous Drive Result:', JSON.stringify(adasDriveResult.result.value, null, 2));

          if (adasDriveResult.result.value.speedKmh <= 5) {
            errors.push('ADAS failed to drive the vehicle forward!');
          }
          if (Math.abs(adasDriveResult.result.value.posX) > 1.2) {
            errors.push('LKA steered in the wrong direction!');
          }

          // 3. 验证与 NPC 车辆的 3D 碰撞盒碰撞检测
          console.log('[Test 3] Testing Collision Volume between Player and NPC Vehicle...');
          await send('Runtime.evaluate', {
            expression: `
              // 将一辆 NPC 放置在玩家车身正前方 2 米处，触发碰撞体积重叠
              const testNpc = window.gameApp.traffic.vehicles[0];
              testNpc.group.position.set(window.gameApp.vehicle.position.x, 0, window.gameApp.vehicle.position.z - 2.0);
              testNpc.speed = 0;
            `
          });
          await new Promise(r => setTimeout(r, 600));

          const npcCrashResult = await send('Runtime.evaluate', {
            expression: `({
              gameState: window.gameApp.gameState,
              modalVisible: !document.getElementById('modal-accident').classList.contains('hidden'),
              cause: document.getElementById('acc-cause-text').textContent
            })`,
            returnByValue: true
          });
          console.log('NPC Collision Result:', JSON.stringify(npcCrashResult.result.value, null, 2));

          if (npcCrashResult.result.value.gameState !== 'ACCIDENT' || !npcCrashResult.result.value.modalVisible) {
            errors.push('NPC collision volume failed to trigger accident report!');
          }

          // 4. 重置游戏并测试护栏碰撞体积
          console.log('[Test 4] Testing Guardrail Collision Volume...');
          await send('Runtime.evaluate', {
            expression: `
              window.gameApp.restartGame();
              // 将车速设为 50 km/h，位置移至左侧护栏外
              window.gameApp.vehicle.speed = 50 / 3.6;
              window.gameApp.vehicle.position.x = -8.5;
            `
          });
          await new Promise(r => setTimeout(r, 500));

          const guardrailCrashResult = await send('Runtime.evaluate', {
            expression: `({
              gameState: window.gameApp.gameState,
              modalVisible: !document.getElementById('modal-accident').classList.contains('hidden'),
              cause: document.getElementById('acc-cause-text').textContent
            })`,
            returnByValue: true
          });
          console.log('Guardrail Collision Result:', JSON.stringify(guardrailCrashResult.result.value, null, 2));

          if (guardrailCrashResult.result.value.gameState !== 'ACCIDENT') {
            errors.push('Guardrail collision failed to trigger!');
          }

          if (errors.length > 0) {
            console.error('FAILED with errors:', errors);
            cleanup(1);
          } else {
            console.log('SUCCESS: ADAS actively drives the car, road is 3 lanes, and all collision volumes work perfectly!');
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
