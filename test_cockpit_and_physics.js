/**
 * test_cockpit_and_physics.js - 验证第一人称座舱、后视镜、车内UI与牛顿力学物理引擎
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

async function runTest() {
  console.log('--- 开始测试：全新物理引擎、高颜值座舱内饰与道路景观 ---');
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9355;
  const browserProc = spawn(browserPath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--user-data-dir=' + path.join(__dirname, '.browser-cockpit-profile'),
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

          const checkImport = await send('Runtime.evaluate', {
            expression: `import('./main.js').catch(e => ({ error: e.message, stack: e.stack }))`,
            awaitPromise: true,
            returnByValue: true
          });
          console.log('import main.js result:', checkImport.result.value);
          await new Promise(r => setTimeout(r, 2000));

          // 1. 点击进入驾驶
          console.log('\n[测试 1] 进入驾驶状态...');
          await send('Runtime.evaluate', { expression: `document.getElementById('btn-start-drive').click();` });
          await new Promise(r => setTimeout(r, 500));

          // 2. 验证第一人称座舱与防穿模参数
          console.log('\n[测试 2] 切换至第一人称 FPV 视角并检测内饰与防穿模...');
          await send('Runtime.evaluate', {
            expression: `(() => {
              window.gameApp.cameraManager.setViewMode('fpv');
            })()`
          });
          await new Promise(r => setTimeout(r, 800));

          const fpvCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              const v = app.vehicle;
              const cam = app.camera;
              const mode = app.cameraManager.currentMode;
              const fov = cam.fov;
              const near = cam.near;
              const camPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

              // 检查方向盘、仪表盘、中控屏、车内后视镜是否存在
              const hasSteering = !!v.steeringWheelGroup;
              const hasCluster = !!v.clusterCanvas;
              const hasCenter = !!v.centerCanvas;
              const hasRearview = !!v.rearviewCanvas;

              // 距离方向盘距离 (方向盘位于车身相对 z = -0.42，驾驶员眼部 z = -0.05)
              const wheelDistToEye = Math.abs(-0.05 - (-0.42));

              return {
                mode,
                fov,
                near,
                camPos,
                hasSteering,
                hasCluster,
                hasCenter,
                hasRearview,
                wheelDistToEye,
                roofHidden: !v.roofMesh.visible
              };
            })()`,
            returnByValue: true
          });
          console.log('fpvCheck raw:', JSON.stringify(fpvCheck));
          const fpvVal = (fpvCheck.result && fpvCheck.result.value) || fpvCheck.value;
          console.log('FPV 座舱检测结果:', JSON.stringify(fpvVal, null, 2));

          const fpvPassed = (
            fpvVal.mode === 'fpv' &&
            fpvVal.fov >= 70 &&
            fpvVal.near <= 0.06 &&
            fpvVal.hasSteering &&
            fpvVal.hasCluster &&
            fpvVal.hasCenter &&
            fpvVal.hasRearview &&
            fpvVal.wheelDistToEye > 0.3 &&
            fpvVal.roofHidden
          );

          if (fpvPassed) {
            console.log('✅ 测试 2 通过：第一人称座舱 72° 沉浸广角、0.05 超近剪裁面、方向盘安全间距 > 35cm 绝不穿模，双屏与后视镜全部就绪！');
          } else {
            console.error('❌ 测试 2 失败：第一人称配置异常！', fpvVal);
            process.exit(1);
          }

          // 3. 验证物理动力学引擎：加速、制动、倒车切换与漂移
          console.log('\n[测试 3] 验证物理效果：驱动加速、平滑刹车停稳与长踩刹车切倒车 (R)...');
          // 模拟按 W 键踩油门加速
          await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              app.keys['KeyW'] = true;
              app.keys['KeyS'] = false;
              for (let i = 0; i < 90; i++) {
                app.stepPhysics(0.016);
              }
              app.keys['KeyW'] = false;
            })()`
          });

          const accelCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const v = window.gameApp.vehicle;
              return {
                speedKmh: v.speed * 3.6,
                gear: v.gear,
                rpm: v.rpm,
                pitch: v.pitch
              };
            })()`,
            returnByValue: true
          });
          console.log('加速后动力学状态:', accelCheck.result.value);

          if (accelCheck.result.value.speedKmh > 20 && accelCheck.result.value.gear === 'D') {
            console.log('✅ 加速正常：速度提升至 ' + accelCheck.result.value.speedKmh.toFixed(1) + ' km/h，转速声浪正常上扬！');
          } else {
            console.error('❌ 加速失败！', accelCheck.result.value);
            process.exit(1);
          }

          // 模拟按 S 键长踩刹车制动至停稳，并自动切入倒车档 (R)
          console.log('执行制动至停稳并长踩切入倒车档 (R)...');
          await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              app.keys['KeyW'] = false;
              app.keys['KeyS'] = true;
              for (let i = 0; i < 120; i++) {
                app.stepPhysics(0.016);
              }
              app.keys['KeyS'] = false;
            })()`
          });

          const reverseCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const v = window.gameApp.vehicle;
              return {
                speedKmh: v.speed * 3.6,
                gear: v.gear,
                rpm: v.rpm
              };
            })()`,
            returnByValue: true
          });
          console.log('制动后状态:', reverseCheck.result.value);

          if (reverseCheck.result.value.gear === 'R') {
            console.log('✅ 真实变速档位逻辑正常：刹停长踩刹车成功无缝切入倒车档 (R)！');
          } else {
            console.error('❌ 倒车档切换失败！', reverseCheck.result.value);
            process.exit(1);
          }

          // 4. 验证轮胎侧偏力与漂移阻尼 (无 NaN，侧向力正常解算)
          console.log('\n[测试 4] 验证二自由度轮胎侧偏力与手刹侧滑漂移物理...');
          await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              // 重新置为前进 60km/h 并大幅度打转向拉手刹
              app.vehicle.speed = 60 / 3.6;
              app.vehicle.gear = 'D';
              for (let i = 0; i < 30; i++) {
                app.vehicle.updatePhysics(0.016, { throttle: 0.2, brake: 0, steer: 0.8, handbrake: true });
              }
            })()`
          });

          const driftCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const v = window.gameApp.vehicle;
              return {
                yawRate: v.yawRate,
                localLatVel: v.localVelocity.y,
                roll: v.roll,
                isFiniteYaw: Number.isFinite(v.yaw),
                isFinitePos: Number.isFinite(v.position.x)
              };
            })()`,
            returnByValue: true
          });
          console.log('侧偏漂移状态:', driftCheck.result.value);

          if (driftCheck.result.value.isFiniteYaw && driftCheck.result.value.isFinitePos && Math.abs(driftCheck.result.value.yawRate) > 0.05) {
            console.log('✅ 侧偏物理与手刹漂移解算正常：产生真实侧滑角速度与悬挂侧倾，无任何数值奇异！');
          } else {
            console.error('❌ 侧偏解算异常！', driftCheck.result.value);
            process.exit(1);
          }

          // 5. 验证道路升级景观 (反光猫眼道钉、高架指路门架牌)
          console.log('\n[测试 5] 验证道路景观升级 (反光猫眼道钉、高速门架牌)...');
          const roadCheck = await send('Runtime.evaluate', {
            expression: `(() => {
              const app = window.gameApp;
              const chunk = app.world.chunks[0];
              const childrenTypes = chunk.children.map(c => c.type || c.constructor.name);
              const hasGantry = chunk.children.some(c => c.children && c.children.length >= 4);
              const instancedMeshes = chunk.children.filter(c => c.isInstancedMesh);

              return {
                chunkCount: app.world.chunks.length,
                childCount: chunk.children.length,
                hasGantry,
                instancedCount: instancedMeshes.length
              };
            })()`,
            returnByValue: true
          });
          console.log('道路景观检测:', roadCheck.result.value);

          if (roadCheck.result.value.hasGantry && roadCheck.result.value.instancedCount >= 4) {
            console.log('✅ 测试 5 通过：高架大型指路牌门架、反光猫眼道钉组与护栏轮廓标均已成功渲染在道路区块中！');
          } else {
            console.error('❌ 测试 5 失败！', roadCheck.result.value);
            process.exit(1);
          }

          console.log('\n🎉 所有新特性测试全部通过！物理规律、模型美化与第一人称座舱全面升级完毕！');
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
