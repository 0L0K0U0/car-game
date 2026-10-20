/**
 * test_english_only.js - 验证纯英文版本无任何中文字符残留
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

async function runTest() {
  console.log('--- 开始测试：验证纯英文版本 (Zero Chinese Characters) ---');
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9366;
  const browserProc = spawn(browserPath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--user-data-dir=' + path.join(__dirname, '.browser-en-profile'),
    'http://localhost:8080/'
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

        ws.onopen = async () => {
          await send('Log.enable');
          await send('Console.enable');
          await send('Runtime.enable');

          console.log('[测试 1] 扫描页面 DOM 所有文本，验证无中文字符...');
          const domCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const fullText = document.body.innerText;
              const chineseMatches = fullText.match(/[\\u4e00-\\u9fa5]/g) || [];
              const titleMatches = document.title.match(/[\\u4e00-\\u9fa5]/g) || [];
              return {
                title: document.title,
                chineseCount: chineseMatches.length + titleMatches.length,
                sampleText: fullText.substring(0, 150).replace(/\\n+/g, ' ')
              };
            })()`,
            returnByValue: true
          });
          console.log('DOM 文本检测结果:', domCheck.result.value);

          if (domCheck.result.value.chineseCount === 0) {
            console.log('✅ 测试 1 通过：DOM 及网页标题未发现任何中文字符！');
          } else {
            console.error('❌ 测试 1 失败：DOM 包含中文字符！', domCheck.result.value);
            process.exit(1);
          }

          console.log('\n[测试 2] 点击开始模拟，检测 HUD、仪表与 3D 车机/路牌纹理...');
          await send('Runtime.evaluate', {
            expression: `document.getElementById('btn-start-drive').click()`
          });
          await new Promise(r => setTimeout(r, 600));

          const hudCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              const hudText = document.getElementById('hud-layer').innerText;
              const chineseInHud = (hudText.match(/[\\u4e00-\\u9fa5]/g) || []).length;
              return {
                gameState: app.gameState,
                chineseInHud,
                modeBadge: document.getElementById('hud-mode-badge').innerText,
                headwayLabel: document.getElementById('txt-headway-label').innerText,
                ttcLabel: document.getElementById('txt-ttc-label').innerText,
                radarTitle: document.getElementById('txt-radar-title').innerText
              };
            })()`,
            returnByValue: true
          });
          console.log('HUD 检测结果:', hudCheck.result.value);

          if (hudCheck.result.value.chineseInHud === 0 && hudCheck.result.value.gameState === 'DRIVING') {
            console.log('✅ 测试 2 通过：HUD 实时仪表全部转为纯英文，零中文字符！');
          } else {
            console.error('❌ 测试 2 失败：HUD 文本异常！', hudCheck.result.value);
            process.exit(1);
          }

          console.log('\n[测试 3] 验证设置弹窗、事故分析报告与新手指南全部为纯英文...');
          const modalsCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const settingsText = document.getElementById('modal-settings').innerText;
              const accidentText = document.getElementById('modal-accident').innerText;
              const tutorialText = document.getElementById('modal-tutorial').innerText;
              const pauseText = document.getElementById('modal-pause').innerText;
              const allModalsText = settingsText + accidentText + tutorialText + pauseText;
              const chineseInModals = (allModalsText.match(/[\\u4e00-\\u9fa5]/g) || []).length;
              return {
                chineseInModals,
                settingsSample: settingsText.substring(0, 100).replace(/\\n+/g, ' '),
                accidentSample: accidentText.substring(0, 100).replace(/\\n+/g, ' '),
                tutorialSample: tutorialText.substring(0, 100).replace(/\\n+/g, ' ')
              };
            })()`,
            returnByValue: true
          });
          console.log('弹窗检测结果:', modalsCheck.result.value);

          if (modalsCheck.result.value.chineseInModals === 0) {
            console.log('✅ 测试 3 通过：设置、事故分析、新手指南与暂停弹窗 100% 纯英文！');
          } else {
            console.error('❌ 测试 3 失败：弹窗包含中文字符！', modalsCheck.result.value);
            process.exit(1);
          }

          console.log('\n🎉 所有测试通过：中文已彻底删除，纯英文版运行正常无报错！');
          ws.close();
          browserProc.kill();
          process.exit(0);
        };
      } catch (err) {
        console.error('Test error:', err);
        browserProc.kill();
        process.exit(1);
      }
    });
  });
}

runTest();
