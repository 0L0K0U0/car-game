/**
 * test_subpath_deployment.js - 验证在子路径 /car-game/ 下的静态站点加载与运行
 * 模拟 GitHub Pages 部署场景: https://<username>.github.io/car-game/
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

async function runSubpathTest() {
  console.log('--- 开始测试：GitHub Pages 子路径 (/car-game/) 静态站点加载与运行 ---');
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9377;
  const subpathUrl = 'http://localhost:8080/car-game/';

  const browserProc = spawn(browserPath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--user-data-dir=' + path.join(__dirname, '.browser-subpath-profile'),
    subpathUrl
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
          return new Promise((resolve) => {
            const id = msgId++;
            const handler = (evt) => {
              const data = JSON.parse(evt.data);
              if (data.id === id) {
                ws.removeEventListener('message', handler);
                resolve(data.result);
              }
            };
            ws.addEventListener('message', handler);
            ws.send(JSON.stringify({ id, method, params }));
          });
        };

        const failedRequests = [];
        const consoleErrors = [];

        ws.onopen = async () => {
          await send('Log.enable');
          await send('Console.enable');
          await send('Runtime.enable');
          await send('Network.enable');

          ws.addEventListener('message', (evt) => {
            const data = JSON.parse(evt.data);
            if (data.method === 'Network.responseReceived') {
              const resp = data.params.response;
              if (resp.status >= 400) {
                failedRequests.push({ url: resp.url, status: resp.status });
              }
            }
            if (data.method === 'Console.messageAdded') {
              if (data.params.message.level === 'error') {
                consoleErrors.push(data.params.message.text);
              }
            }
          });

          console.log('[测试 1] 验证页面在子路径 /car-game/ 下初始化完成...');
          await new Promise(r => setTimeout(r, 1500));

          const pageState = await send('Runtime.evaluate', {
            expression: `(() => {
              return {
                url: window.location.href,
                hasApp: !!window.gameApp,
                title: document.title,
                canvasWidth: document.getElementById('webgl-canvas').width,
                canvasHeight: document.getElementById('webgl-canvas').height,
                gameState: window.gameApp ? window.gameApp.gameState : 'NOT_FOUND'
              };
            })()`,
            returnByValue: true
          });
          console.log('子路径环境检测结果:', pageState.result.value);

          if (!pageState.result.value.hasApp) {
            console.error('❌ 测试 1 失败：window.gameApp 未能在子路径下完成初始化！');
            console.error('网络失败请求:', failedRequests);
            console.error('控制台错误:', consoleErrors);
            process.exit(1);
          }
          console.log('✅ 测试 1 通过：Three.js 核心引擎与应用在子路径 /car-game/ 下成功加载！');

          console.log('\n[测试 2] 点击 Start Driving 运行 WebGL 渲染与物理循环...');
          await send('Runtime.evaluate', {
            expression: `document.getElementById('btn-start-drive').click()`
          });

          await new Promise(r => setTimeout(r, 1000));

          const drivingCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              return {
                gameState: app.gameState,
                isHudVisible: !app.ui.hudLayer.classList.contains('hidden'),
                vehicleSpeed: app.vehicle.speed,
                chunksCount: app.world.chunks.length
              };
            })()`,
            returnByValue: true
          });
          console.log('运行状态检测:', drivingCheck.result.value);

          if (drivingCheck.result.value.gameState === 'DRIVING' && drivingCheck.result.value.isHudVisible) {
            console.log('✅ 测试 2 通过：驾驶模拟主循环与 WebGL 渲染管线在子路径下正常运转！');
          } else {
            console.error('❌ 测试 2 失败：主循环未正常启动！', drivingCheck.result.value);
            process.exit(1);
          }

          console.log('\n[测试 3] 检测所有资源请求状态与控制台日志...');
          console.log('失败的资源请求数:', failedRequests.length);
          console.log('控制台报错数:', consoleErrors.length);

          if (failedRequests.length > 0) {
            console.error('❌ 存在加载失败的资源:', failedRequests);
            process.exit(1);
          }
          if (consoleErrors.length > 0) {
            console.error('❌ 控制台存在错误:', consoleErrors);
            process.exit(1);
          }

          console.log('✅ 测试 3 通过：子路径下所有样式、Three.js、脚本模块与资源 100% 成功加载，零 404，零控制台报错！');
          console.log('\n🎉 GitHub Pages 静态站点子路径兼容性测试全部通过！可以直接推送部署！');
          ws.close();
          browserProc.kill();
          process.exit(0);
        };
      } catch (err) {
        console.error('Subpath test error:', err);
        browserProc.kill();
        process.exit(1);
      }
    });
  });
}

runSubpathTest();
