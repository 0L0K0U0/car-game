/**
 * main.js - 智能驾驶小游戏 主程序与状态机编排
 * 满足需求 R4, R11, R12：状态机调度、固定 1/60s 物理时间步长、手柄与按键输入、失焦自动暂停、免刷新重置与事故 5 秒复盘
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { audio } from './audio.js';
import { World } from './world.js';
import { Vehicle } from './vehicle.js';
import { TrafficManager } from './traffic.js';
import { AdasSystem } from './adas.js';
import { EventManager } from './events.js';
import { CameraManager } from './camera.js';
import { UIManager } from './ui.js';
import { t } from './i18n.js';

class GameApp {
  constructor() {
    // 游戏运行状态: 'MENU' | 'DRIVING' | 'PAUSED' | 'ACCIDENT' | 'REPLAY'
    this.gameState = 'MENU';

    // 统计数据
    this.mileage = 0; // 行驶米数
    this.comfortScore = 100; // 平顺舒适度 (急加减速扣分)
    this.isNight = false;

    // 复盘状态
    this.replayFrames = [];
    this.replayIndex = 0;
    this.replayTimer = 0;

    // 输入捕获
    this.keys = {};
    this.gamepadConnected = false;

    // 初始化 Three.js 核心
    this.initThree();

    // 实例化各子系统
    this.world = new World(this.scene, 'high');
    this.vehicle = new Vehicle(this.scene, 'high');
    this.traffic = new TrafficManager(this.scene, this.world, 'high');
    this.adas = new AdasSystem(this.world, audio);
    this.events = new EventManager(this.scene, this.world, audio, 'hard');
    this.cameraManager = new CameraManager(this.camera);
    this.ui = new UIManager();

    // 绑定跨模块事件回调
    this.bindCallbacks();

    // 默认应用界面最高选项至 ADAS
    this.applySettingsFromUI();

    // 监听输入与系统事件
    this.initInputs();
    this.initWindowEvents();

    // 启动物理与渲染循环
    this.lastTime = performance.now();
    this.physicsAccumulator = 0;
    this.fixedStep = CONFIG.physics.fixedTimeStep;

    requestAnimationFrame(this.loop.bind(this));
  }

  initThree() {
    this.container = document.getElementById('game-container');
    this.canvas = document.getElementById('webgl-canvas');

    // 场景与相机
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,
      window.innerWidth / window.innerHeight,
      CONFIG.camera.near,
      CONFIG.camera.far
    );
    this.camera.position.set(0, 5, 10);

    // 渲染器 (开启 ACESFilmic 色调映射与柔和阴影)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  bindCallbacks() {
    // 智驾接管提醒
    this.adas.onTakeoverCallback = () => {
      this.ui.showTakeoverAlert();
    };

    // 突发事件更新
    this.events.onEventUpdateCallback = (event) => {
      this.ui.showEventBanner(event);
    };

    // 发生碰撞事故
    this.events.onCrashCallback = (report) => {
      this.gameState = 'ACCIDENT';
      this.ui.triggerCrashFeedback();
      setTimeout(() => {
        this.ui.showAccidentReport(report);
      }, 500);
    };

    // UI 按钮监听
    document.getElementById('btn-start-drive')?.addEventListener('click', () => {
      this.startGame();
    });

    document.getElementById('btn-toggle-view')?.addEventListener('click', () => {
      this.cameraManager.toggleView();
    });

    document.getElementById('btn-toggle-mode')?.addEventListener('click', () => {
      this.adas.toggle();
    });

    document.getElementById('btn-toggle-daynight')?.addEventListener('click', () => {
      this.toggleDayNight();
    });

    document.getElementById('btn-toggle-lights')?.addEventListener('click', () => {
      this.vehicle.toggleHeadlights();
    });

    document.getElementById('btn-hud-flawless')?.addEventListener('click', () => {
      this.adas.setFlawlessMode(!this.adas.flawlessMode);
      this.ui.chkFlawless.checked = this.adas.flawlessMode;
    });

    document.getElementById('btn-toggle-audio')?.addEventListener('click', () => {
      const isMuted = audio.toggleMute();
      this.ui.iconAudio.textContent = isMuted ? '🔇' : '🔊';
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      this.ui.modalSettings.classList.remove('hidden');
    });

    document.getElementById('btn-resume-drive')?.addEventListener('click', () => {
      this.resumeGame();
    });

    document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
      this.restartGame();
    });

    document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
      this.ui.modalSettings.classList.remove('hidden');
    });

    document.getElementById('btn-pause-quit')?.addEventListener('click', () => {
      this.quitToMenu();
    });

    document.getElementById('btn-accident-restart')?.addEventListener('click', () => {
      this.restartGame();
    });

    document.getElementById('btn-accident-replay')?.addEventListener('click', () => {
      this.startAccidentReplay();
    });

    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      this.applySettingsFromUI();
    });
  }

  applySettingsFromUI() {
    this.adas.setFlawlessMode(this.ui.chkFlawless.checked);
    this.adas.setCruiseSpeed(Number(this.ui.rngCruise.value));
    this.adas.setHeadwayLevel(Number(this.ui.rngHeadway.value));
    this.adas.style = this.ui.selStyle.value;
    this.adas.sensitivity = this.ui.selSensitivity.value;
    this.adas.aebEnabled = this.ui.chkAeb.checked;
    this.adas.lkaStrength = Number(this.ui.rngLka.value);
    this.adas.autoLaneChange = this.ui.chkAlc.checked;
    this.adas.cutInTolerance = Number(this.ui.rngCutin.value);
    this.ui.modalSettings.classList.add('hidden');
  }

  initInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      if (e.code === 'KeyV') this.cameraManager.toggleView();
      if (e.code === 'KeyC') this.adas.toggle();
      if (e.code === 'KeyN') this.toggleDayNight();
      if (e.code === 'KeyL') this.vehicle.toggleHeadlights();
      if (e.code === 'KeyQ') {
        const next = this.vehicle.blinkerState === -1 ? 0 : -1;
        this.vehicle.setBlinker(next);
        audio.playBlinker(true);
      }
      if (e.code === 'KeyE') {
        const next = this.vehicle.blinkerState === 1 ? 0 : 1;
        this.vehicle.setBlinker(next);
        audio.playBlinker(true);
      }
      if (e.code === 'Escape') {
        if (this.gameState === 'DRIVING') {
          this.pauseGame();
        } else if (this.gameState === 'PAUSED') {
          this.resumeGame();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('gamepadconnected', () => {
      this.gamepadConnected = true;
    });
  }

  initWindowEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // 窗口失焦自动暂停 (R12)
    window.addEventListener('blur', () => {
      if (this.gameState === 'DRIVING') {
        this.pauseGame();
      }
    });
  }

  toggleDayNight() {
    this.isNight = !this.isNight;
    this.world.setDayNight(this.isNight);
    // 夜晚智驾自动开灯
    if (this.isNight && this.adas.isActive) {
      this.vehicle.setHeadlights(true);
    }
  }

  getProcessedInput() {
    let throttle = 0;
    let brake = 0;
    let steer = 0;
    let handbrake = false;

    // 键盘
    if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle += 1.0;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) brake += 1.0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer += 1.0;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steer -= 1.0;
    if (this.keys['Space']) handbrake = true;

    // 适配手柄 Gamepad API (R11)
    if (this.gamepadConnected && navigator.getGamepads) {
      const gp = navigator.getGamepads()[0];
      if (gp) {
        if (Math.abs(gp.axes[0]) > 0.1) steer = -gp.axes[0];
        if (gp.buttons[7] && gp.buttons[7].value > 0.05) throttle = Math.max(throttle, gp.buttons[7].value); // RT 油门
        if (gp.buttons[6] && gp.buttons[6].value > 0.05) brake = Math.max(brake, gp.buttons[6].value); // LT 刹车
        if (gp.buttons[0] && gp.buttons[0].pressed) handbrake = true; // A 键手刹
      }
    }

    return { throttle, brake, steer, handbrake };
  }

  startGame() {
    audio.ensureContext();
    this.ui.modalStart.classList.add('hidden');
    this.ui.hudLayer.classList.remove('hidden');

    // 应用初始选项
    const selDiff = document.getElementById('sel-diff').value;
    const selWeather = document.getElementById('sel-weather').value;
    const selTime = document.getElementById('sel-time').value;

    this.events.setDifficulty(selDiff);
    this.world.setWeather(selWeather);
    audio.setRainActive(selWeather === 'rain');
    this.isNight = (selTime === 'night');
    this.world.setDayNight(this.isNight, true);
    if (this.isNight) this.vehicle.setHeadlights(true);

    this.restartGame();
    this.gameState = 'DRIVING';
  }

  pauseGame() {
    this.gameState = 'PAUSED';
    this.ui.modalPause.classList.remove('hidden');
  }

  resumeGame() {
    this.gameState = 'DRIVING';
    this.ui.modalPause.classList.add('hidden');
    this.lastTime = performance.now();
  }

  restartGame() {
    this.vehicle.reset(0, 0);
    this.world.resetRoad(0);
    this.cameraManager.reset(this.vehicle);
    this.traffic.reset(0);
    this.adas.reset();
    this.events.reset();
    this.mileage = 0;
    this.comfortScore = 100;
    this.ui.modalAccident.classList.add('hidden');
    this.ui.modalPause.classList.add('hidden');
    this.ui.replayBadge.classList.add('hidden');
    this.gameState = 'DRIVING';
    this.lastTime = performance.now();
  }

  quitToMenu() {
    this.ui.modalPause.classList.add('hidden');
    this.ui.hudLayer.classList.add('hidden');
    this.ui.modalStart.classList.remove('hidden');
    this.gameState = 'MENU';
  }

  startAccidentReplay() {
    if (this.vehicle.historyBuffer.length === 0) return;
    this.replayFrames = [...this.vehicle.historyBuffer];
    this.replayIndex = 0;
    this.replayTimer = 0;
    this.ui.modalAccident.classList.add('hidden');
    this.ui.replayBadge.classList.remove('hidden');
    this.gameState = 'REPLAY';
  }

  loop(timestamp) {
    requestAnimationFrame(this.loop.bind(this));

    const frameDelta = Math.min(0.1, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    if (this.gameState === 'DRIVING') {
      this.physicsAccumulator += frameDelta;

      // 固定 1/60 秒物理更新步长
      while (this.physicsAccumulator >= this.fixedStep) {
        this.stepPhysics(this.fixedStep);
        this.physicsAccumulator -= this.fixedStep;
      }

      // 相机平滑跟随与动态 FOV
      this.cameraManager.update(frameDelta, this.vehicle);

      // HUD 与态势雷达渲染
      const surrounding = this.traffic.getSurroundingVehicles(this.vehicle, 50);
      this.ui.updateHUD(
        this.vehicle,
        this.adas,
        this.isNight,
        this.mileage,
        this.comfortScore,
        this.events.resolvedCount
      );
      this.ui.renderRadar(this.vehicle, surrounding);
      if (this.vehicle.drawRearviewMirror) {
        this.vehicle.drawRearviewMirror(surrounding);
      }

      // 实时音频更新 (转速音浪)
      audio.updateEngine(
        this.vehicle.speed / CONFIG.physics.maxForwardSpeed,
        this.vehicle.throttleInput
      );
    } else if (this.gameState === 'REPLAY') {
      // 慢动作复盘播放 (0.35x 速率)
      this.replayTimer += frameDelta * 0.35;
      const targetFrame = Math.floor(this.replayTimer * 60);
      if (targetFrame < this.replayFrames.length) {
        const f = this.replayFrames[targetFrame];
        this.vehicle.position.copy(f.position);
        this.vehicle.yaw = f.yaw;
        this.vehicle.pitch = f.pitch;
        this.vehicle.roll = f.roll;
        this.vehicle.steerAngle = f.steerAngle;
        this.vehicle.speed = f.speed;
        this.vehicle.updateVisuals(0.016);
        this.cameraManager.update(frameDelta, this.vehicle);
      } else {
        // 复盘结束，重新唤出事故报告
        this.ui.replayBadge.classList.add('hidden');
        this.ui.modalAccident.classList.remove('hidden');
        this.gameState = 'ACCIDENT';
      }
    } else if (this.gameState === 'MENU') {
      // 主菜单场景缓动展示
      this.camera.position.x = Math.sin(timestamp * 0.0005) * 6;
      this.camera.position.y = 3.5;
      this.camera.position.z = 8;
      this.camera.lookAt(0, 1, 0);
    }

    // WebGL 渲染输出
    this.renderer.render(this.scene, this.camera);
  }

  stepPhysics(delta) {
    const rawInput = this.getProcessedInput();

    // 智能驾驶计算控制输出 (融合周边交通车流与道路突发难题障碍物)
    const adasOutput = this.adas.computeControl(
      delta,
      this.vehicle,
      this.traffic,
      this.events,
      this.isNight,
      rawInput
    );

    // 决定实际输入
    const effectiveInput = this.adas.isActive ? adasOutput : rawInput;

    // 车辆动力学解算
    this.vehicle.updatePhysics(delta, effectiveInput, this.adas.isActive);

    // 环境与路段循环更新
    this.world.update(delta, this.vehicle.position.z);

    // 交通流 NPC 更新
    this.traffic.update(delta, this.vehicle, this.isNight);

    // 突发事件调度更新
    this.events.update(delta, this.vehicle, this.adas, this.traffic, this.isNight);

    // 碰撞体积检测 (与所有 NPC 车辆、外侧金属防撞护栏)
    this.checkVehicleCollisions();
    this.checkGuardrailCollisions();

    // 里程累加与舒适度评分
    this.mileage += Math.max(0, this.vehicle.speed * delta);
    if (Math.abs(this.vehicle.acceleration) > 5.5) {
      this.comfortScore = Math.max(0, this.comfortScore - delta * 2.5); // 急加急减扣分
    }
  }

  checkVehicleCollisions() {
    if (this.gameState !== 'DRIVING') return false;
    const pHit = this.vehicle.getHitbox();
    const pSpeedKmh = Math.round(this.vehicle.speed * 3.6);

    for (const npc of this.traffic.vehicles) {
      if (!npc.active) continue;
      const nHit = npc.getHitbox();
      // AABB 3D 碰撞体积重叠判定
      if (
        pHit.minX < nHit.maxX &&
        pHit.maxX > nHit.minX &&
        pHit.minZ < nHit.maxZ &&
        pHit.maxZ > nHit.minZ
      ) {
        this.handleVehicleCrash(npc, pSpeedKmh);
        return true;
      }
    }
    return false;
  }

  handleVehicleCrash(npc, pSpeedKmh) {
    this.gameState = 'ACCIDENT';
    audio.playCrashSound();
    this.ui.triggerCrashFeedback();

    const headway = this.adas.headwayTime;
    const isManual = !this.adas.isActive;

    let causeText = '';
    let adviceText = '';

    if (isManual) {
      causeText = t('accidentCauseManualError');
      adviceText = t('accidentAdviceHeadway');
    } else if (this.isNight && !this.vehicle.headlightsOn) {
      causeText = t('accidentCauseUnlitNight');
      adviceText = t('accidentAdviceNight');
    } else if (this.adas.sensitivity === 'low') {
      causeText = t('accidentCauseSensitivity', { delay: 280 });
      adviceText = t('accidentAdviceSensitivity');
    } else {
      causeText = t('accidentCauseHeadway', { time: headway, speed: pSpeedKmh });
      adviceText = t('accidentAdviceHeadway');
    }

    const report = {
      speed: pSpeedKmh,
      headway: headway,
      delayMs: this.isNight ? 320 : 160,
      causeText: causeText,
      adviceText: adviceText,
      eventType: 'traffic_collision'
    };

    setTimeout(() => {
      this.ui.showAccidentReport(report);
    }, 450);
  }

  checkGuardrailCollisions() {
    if (this.gameState !== 'DRIVING') return false;
    const bounds = this.world.getRoadBoundaries();
    const halfW = (CONFIG.hitbox ? CONFIG.hitbox.player.width : 1.88) * 0.5;
    const pX = this.vehicle.position.x;
    const pSpeedKmh = Math.round(this.vehicle.speed * 3.6);

    // 左护栏撞击检测
    if (pX - halfW <= bounds.leftGuardrailX) {
      this.vehicle.position.x = bounds.leftGuardrailX + halfW;
      if (pSpeedKmh > 35) {
        this.handleGuardrailCrash(pSpeedKmh, 'left');
        return true;
      } else {
        this.vehicle.yaw = Math.abs(this.vehicle.yaw) * 0.3;
        this.vehicle.speed *= 0.7;
        audio.playCrashSound();
      }
    }
    // 右护栏撞击检测
    else if (pX + halfW >= bounds.rightGuardrailX) {
      this.vehicle.position.x = bounds.rightGuardrailX - halfW;
      if (pSpeedKmh > 35) {
        this.handleGuardrailCrash(pSpeedKmh, 'right');
        return true;
      } else {
        this.vehicle.yaw = -Math.abs(this.vehicle.yaw) * 0.3;
        this.vehicle.speed *= 0.7;
        audio.playCrashSound();
      }
    }
    return false;
  }

  handleGuardrailCrash(pSpeedKmh, side) {
    this.gameState = 'ACCIDENT';
    audio.playCrashSound();
    this.ui.triggerCrashFeedback();

    const report = {
      speed: pSpeedKmh,
      headway: this.adas.headwayTime,
      delayMs: 120,
      causeText: t('accidentCauseGuardrail', { speed: pSpeedKmh }),
      adviceText: t('accidentAdviceGuardrail'),
      eventType: 'guardrail_collision'
    };

    setTimeout(() => {
      this.ui.showAccidentReport(report);
    }, 450);
  }
}

// 页面加载完成后实例化启动
window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new GameApp();
});
