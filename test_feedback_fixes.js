/**
 * test_feedback_fixes.js - 验证道路重启复位、全量中英双语切换与初始最高配置
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

async function runTest() {
  console.log('--- 开始测试：验证用户反馈的三大问题 ---');
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9345;
  const browserProc = spawn(browserPath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--user-data-dir=' + path.join(__dirname, '.browser-test-profile'),
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
          await send('Runtime.enable');

          // 等待游戏加载
          await new Promise(r => setTimeout(r, 2000));

          // 1. 验证初始所有选项开到最高
          console.log('\n[测试 1] 验证初始所有选项开到最高...');
          const initialCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              const selDiff = document.getElementById('sel-diff').value;
              const selQuality = document.getElementById('sel-quality').value;
              const rngCruise = Number(document.getElementById('rng-cruise').value);
              const rngHeadway = Number(document.getElementById('rng-headway').value);
              const selStyle = document.getElementById('sel-style').value;
              const selSensitivity = document.getElementById('sel-sensitivity').value;
              const rngLka = Number(document.getElementById('rng-lka').value);
              const rngCutin = Number(document.getElementById('rng-cutin').value);
              const chkAeb = document.getElementById('chk-aeb').checked;
              const chkAlc = document.getElementById('chk-alc').checked;

              return {
                diff: selDiff,
                quality: selQuality,
                cruise: rngCruise,
                headway: rngHeadway,
                style: selStyle,
                sensitivity: selSensitivity,
                lka: rngLka,
                cutin: rngCutin,
                aeb: chkAeb,
                alc: chkAlc,
                adasCruise: app.adas.cruiseSpeed,
                adasHeadway: app.adas.headwayLevel,
                adasHeadwayTime: app.adas.headwayTime,
                adasStyle: app.adas.style,
                adasSensitivity: app.adas.sensitivity,
                adasLka: app.adas.lkaStrength,
                adasCutin: app.adas.cutInTolerance
              };
            })()`,
            returnByValue: true
          });

          const v = initialCheck.result.value;
          console.log('初始界面选项与 ADAS 参数:', JSON.stringify(v, null, 2));

          const isHighest = (
            v.diff === 'hard' &&
            v.quality === 'high' &&
            v.cruise === 130 &&
            v.headway === 5 &&
            v.style === 'aggressive' &&
            v.sensitivity === 'high' &&
            v.lka === 2.0 &&
            v.cutin === 2.0 &&
            v.aeb === true &&
            v.alc === true &&
            v.adasCruise === 130 &&
            v.adasHeadway === 5 &&
            v.adasHeadwayTime === 3.0 &&
            v.adasStyle === 'aggressive' &&
            v.adasSensitivity === 'high' &&
            v.adasLka === 2.0 &&
            v.adasCutin === 2.0
          );

          if (isHighest) {
            console.log('✅ 测试 1 通过：所有选项与 ADAS 初始化参数均已正确置于最高值！');
          } else {
            console.error('❌ 测试 1 失败：部分选项未达到最高值！', v);
            process.exit(1);
          }

          // 2. 验证中英双语切换
          console.log('\n[测试 2] 验证中英双语切换...');
          const langCheckZh = await send('Runtime.evaluate', {
            expression: `(() => {
              return {
                appTitle: document.getElementById('txt-app-title').textContent,
                lblDiff: document.getElementById('txt-lbl-diff').textContent,
                lblWeather: document.getElementById('txt-lbl-weather').textContent,
                selDiffHard: document.getElementById('sel-diff').querySelector('option[value="hard"]').textContent,
                selStyleAggressive: document.getElementById('sel-style').querySelector('option[value="aggressive"]').textContent,
                accSpeedLbl: document.getElementById('acc-lbl-speed').textContent,
                tutThrottle: document.getElementById('tut-key-throttle').textContent,
                btnViewTitle: document.getElementById('btn-toggle-view').title
              };
            })()`,
            returnByValue: true
          });
          console.log('中文状态采样:', JSON.stringify(langCheckZh.result.value, null, 2));

          // 点击切换语言
          await send('Runtime.evaluate', { expression: `document.getElementById('btn-lang-toggle').click();` });
          await new Promise(r => setTimeout(r, 200));

          const langCheckEn = await send('Runtime.evaluate', {
            expression: `(() => {
              return {
                appTitle: document.getElementById('txt-app-title').textContent,
                lblDiff: document.getElementById('txt-lbl-diff').textContent,
                lblWeather: document.getElementById('txt-lbl-weather').textContent,
                selDiffHard: document.getElementById('sel-diff').querySelector('option[value="hard"]').textContent,
                selStyleAggressive: document.getElementById('sel-style').querySelector('option[value="aggressive"]').textContent,
                accSpeedLbl: document.getElementById('acc-lbl-speed').textContent,
                tutThrottle: document.getElementById('tut-key-throttle').textContent,
                btnViewTitle: document.getElementById('btn-toggle-view').title
              };
            })()`,
            returnByValue: true
          });
          console.log('英文状态采样:', JSON.stringify(langCheckEn.result.value, null, 2));

          const enVal = langCheckEn.result.value;
          const langSwitched = (
            enVal.appTitle.includes('Autonomous Driving') &&
            enVal.lblDiff.includes('Difficulty') &&
            enVal.lblWeather.includes('Weather') &&
            enVal.selDiffHard.includes('Hard') &&
            enVal.selStyleAggressive.includes('Aggressive') &&
            enVal.accSpeedLbl.includes('Impact Speed') &&
            enVal.tutThrottle.includes('Throttle') &&
            enVal.btnViewTitle.includes('Switch View')
          );

          if (langSwitched) {
            console.log('✅ 测试 2 通过：语言切换后所有下拉选项、标签、事故指标、键位与 Tooltip 均已即时转为对应语言！');
          } else {
            console.error('❌ 测试 2 失败：语言切换存在遗漏！', enVal);
            process.exit(1);
          }

          // 切回中文
          await send('Runtime.evaluate', { expression: `document.getElementById('btn-lang-toggle').click();` });

          // 3. 验证重新挑战后道路复位与相机无缝贴合
          console.log('\n[测试 3] 验证重新挑战后道路区块复位与相机位置...');
          // 点击进入驾驶
          await send('Runtime.evaluate', { expression: `document.getElementById('btn-start-drive').click();` });
          await new Promise(r => setTimeout(r, 1000));

          // 模拟汽车向前行驶一段距离 (例如向前开了 800 米)
          await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              // 模拟车身位置跑到 -650m
              app.vehicle.position.z = -650;
              // 触发一次 update 使路段滚动
              app.world.update(0.016, app.vehicle.position.z);
              app.cameraManager.update(0.016, app.vehicle);
            })()`
          });

          const beforeRestart = await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              return {
                carZ: app.vehicle.position.z,
                chunkPositions: app.world.chunks.map(c => c.position.z),
                camZ: app.camera.position.z
              };
            })()`,
            returnByValue: true
          });
          console.log('模拟行驶后状态:', beforeRestart.result.value);

          // 触发重新挑战 (restartGame)
          await send('Runtime.evaluate', {
            expression: `(() => {
              window.gameApp.restartGame();
            })()`
          });
          await new Promise(r => setTimeout(r, 200));

          const afterRestart = await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              return {
                carZ: app.vehicle.position.z,
                chunkPositions: app.world.chunks.map(c => c.position.z),
                camPos: { x: app.camera.position.x, y: app.camera.position.y, z: app.camera.position.z },
                roadBoundaries: app.world.getRoadBoundaries(),
                trafficCount: app.traffic.vehicles.length
              };
            })()`,
            returnByValue: true
          });
          const afterVal = afterRestart.result.value;
          console.log('重启挑战后状态:', JSON.stringify(afterVal, null, 2));

          const chunksAtZero = afterVal.chunkPositions.some(z => z >= 0 && z <= 200) &&
                               afterVal.chunkPositions.some(z => z <= 0 && z >= -200);
          const carAtZero = Math.abs(afterVal.carZ) < 0.01;
          const camNearCar = Math.abs(afterVal.camPos.z - afterVal.carZ) < 15;

          if (chunksAtZero && carAtZero && camNearCar) {
            console.log('✅ 测试 3 通过：重新挑战后道路区块完全包覆车身原点，相机瞬时对齐车尾，道路绝不消失！');
          } else {
            console.error('❌ 测试 3 失败：路段或相机位姿异常！', afterVal);
            process.exit(1);
          }

          console.log('\n🎉 所有测试全部通过！三项用户反馈已彻底解决！');
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
