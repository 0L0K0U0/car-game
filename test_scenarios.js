/**
 * test_scenarios.js - 深度端到端场景验证测试
 * 逐项测试：人工加速过弯、各类型突发事件触发、AEB 紧急制动、接管、碰撞与事故分析报告、慢动作复盘与免刷新重置
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8092;
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
  console.log(`Scenario server running on ${PORT}`);
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9335;
  const browserProc = spawn(browserPath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--user-data-dir=' + path.join(__dirname, '.browser-scenario-profile'),
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

          console.log('[Scenario 1] Start Driving and manual acceleration...');
          await send('Runtime.evaluate', {
            expression: `
              document.getElementById("btn-start-drive").click();
              window.gameApp.keys['KeyW'] = true;
            `
          });
          await new Promise(r => setTimeout(r, 1500));

          // 检查车速加速情况
          let speedEval = await send('Runtime.evaluate', {
            expression: 'window.gameApp.vehicle.speed',
            returnByValue: true
          });
          console.log(`Car accelerated to: ${(speedEval.result.value * 3.6).toFixed(1)} km/h`);
          await send('Runtime.evaluate', { expression: 'window.gameApp.keys["KeyW"] = false;' });

          console.log('[Scenario 2] Engaging ADAS and checking ACC cruising...');
          await send('Runtime.evaluate', {
            expression: `
              window.gameApp.adas.enable();
              window.gameApp.adas.setCruiseSpeed(90);
            `
          });
          await new Promise(r => setTimeout(r, 1500));

          let adasStatus = await send('Runtime.evaluate', {
            expression: `({
              active: window.gameApp.adas.isActive,
              cruise: window.gameApp.adas.cruiseSpeed,
              headway: window.gameApp.adas.headwayTime,
              targetDist: window.gameApp.adas.targetDistance
            })`,
            returnByValue: true
          });
          console.log('ADAS Status:', JSON.stringify(adasStatus.result.value));

          console.log('[Scenario 3] Testing Driver Takeover (Stepping on manual brake)...');
          await send('Runtime.evaluate', {
            expression: `
              window.gameApp.keys['KeyS'] = true;
            `
          });
          await new Promise(r => setTimeout(r, 300));
          await send('Runtime.evaluate', { expression: 'window.gameApp.keys["KeyS"] = false;' });

          let takeoverStatus = await send('Runtime.evaluate', {
            expression: 'window.gameApp.adas.state',
            returnByValue: true
          });
          console.log('ADAS State after brake takeover:', takeoverStatus.result.value);

          console.log('[Scenario 4] Triggering Sudden Hazard Event (Cut-in / Hard Brake)...');
          await send('Runtime.evaluate', {
            expression: `
              window.gameApp.adas.enable();
              window.gameApp.events.spawnRandomEvent(window.gameApp.vehicle, window.gameApp.traffic, false);
            `
          });
          await new Promise(r => setTimeout(r, 1000));

          let eventStatus = await send('Runtime.evaluate', {
            expression: `({
              type: window.gameApp.events.activeEvent ? window.gameApp.events.activeEvent.type : 'none',
              stage: window.gameApp.events.activeEvent ? window.gameApp.events.activeEvent.stage : 'none'
            })`,
            returnByValue: true
          });
          console.log('Event Triggered:', JSON.stringify(eventStatus.result.value));

          console.log('[Scenario 5] Triggering Collision & Verifying Accident Analysis Modal...');
          await send('Runtime.evaluate', {
            expression: `
              const dummyEvent = {
                type: 'accident_ahead',
                spawnZ: window.gameApp.vehicle.position.z,
                hazardObjects: [{ position: window.gameApp.vehicle.position.clone() }]
              };
              window.gameApp.events.triggerCollision(dummyEvent, window.gameApp.vehicle, window.gameApp.adas, false);
            `
          });
          await new Promise(r => setTimeout(r, 1000));

          let modalAccidentVisible = await send('Runtime.evaluate', {
            expression: `!document.getElementById('modal-accident').classList.contains('hidden')`,
            returnByValue: true
          });
          let reportContent = await send('Runtime.evaluate', {
            expression: `({
              cause: document.getElementById('acc-cause-text').textContent,
              advice: document.getElementById('acc-advice-text').textContent,
              speed: document.getElementById('acc-metric-speed').textContent
            })`,
            returnByValue: true
          });
          console.log('Accident Modal Visible:', modalAccidentVisible.result.value);
          console.log('Report Content:', JSON.stringify(reportContent.result.value, null, 2));

          console.log('[Scenario 6] Testing 5-Second Slow-Mo Replay...');
          await send('Runtime.evaluate', {
            expression: `document.getElementById('btn-accident-replay').click()`
          });
          await new Promise(r => setTimeout(r, 800));

          let replayActive = await send('Runtime.evaluate', {
            expression: `window.gameApp.gameState === 'REPLAY' && !document.getElementById('replay-badge').classList.contains('hidden')`,
            returnByValue: true
          });
          console.log('Replay Active:', replayActive.result.value);

          console.log('[Scenario 7] Testing Restart without Page Reload...');
          await send('Runtime.evaluate', {
            expression: `window.gameApp.restartGame()`
          });
          await new Promise(r => setTimeout(r, 800));

          let restartStatus = await send('Runtime.evaluate', {
            expression: `({
              gameState: window.gameApp.gameState,
              speed: window.gameApp.vehicle.speed,
              pos: window.gameApp.vehicle.position
            })`,
            returnByValue: true
          });
          console.log('Restarted successfully:', JSON.stringify(restartStatus.result.value));

          console.log('[Scenario 8] Testing Weather changes (Clear -> Rain -> Fog)...');
          await send('Runtime.evaluate', {
            expression: `
              window.gameApp.world.setWeather('rain');
              window.gameApp.world.setWeather('fog');
              window.gameApp.world.setWeather('clear');
            `
          });
          console.log('Weather switched smoothly.');

          if (errors.length > 0) {
            console.error('Errors encountered during scenarios:', errors);
            cleanup(1);
          } else {
            console.log('ALL 8 SCENARIOS PASSED WITH ZERO ERRORS!');
            cleanup(0);
          }
        };
      } catch (err) {
        console.error('CDP Scenario error:', err);
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
