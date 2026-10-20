/**
 * ui.js - HUD 实时渲染、雷达态势、弹窗交互与中英双语即时刷新
 * 满足需求 R1, R5, R8, R9, R10, R11：玻璃拟态仪表盘、360° 雷达、事故分析面板、复盘触发与键位教程
 */

import { i18n, t } from './i18n.js';
import { CONFIG } from './config.js';

export class UIManager {
  constructor() {
    this.initDOMElements();
    this.initRadarCanvas();
    this.bindEvents();
    this.updateLanguageTexts();
    // 监听语言切换事件
    i18n.subscribe(() => this.updateLanguageTexts());
  }

  initDOMElements() {
    // 基础容器
    this.hudLayer = document.getElementById('hud-layer');
    this.crashOverlay = document.getElementById('crash-overlay');
    this.replayBadge = document.getElementById('replay-badge');

    // 弹窗
    this.modalStart = document.getElementById('modal-start');
    this.modalPause = document.getElementById('modal-pause');
    this.modalSettings = document.getElementById('modal-settings');
    this.modalAccident = document.getElementById('modal-accident');
    this.modalTutorial = document.getElementById('modal-tutorial');

    // 顶部按钮与徽标
    this.modeBadge = document.getElementById('hud-mode-badge');
    this.flawlessBadge = document.getElementById('hud-flawless-badge');
    this.btnFlawless = document.getElementById('btn-hud-flawless');
    this.btnView = document.getElementById('btn-toggle-view');
    this.btnMode = document.getElementById('btn-toggle-mode');
    this.btnDayNight = document.getElementById('btn-toggle-daynight');
    this.btnLights = document.getElementById('btn-toggle-lights');
    this.btnAudio = document.getElementById('btn-toggle-audio');
    this.iconAudio = document.getElementById('icon-audio');
    this.btnOpenSettings = document.getElementById('btn-open-settings');
    this.btnLangToggle = document.getElementById('btn-lang-toggle');

    // 事件横幅与接管
    this.eventBanner = document.getElementById('hud-event-banner');
    this.eventBannerTag = document.getElementById('event-banner-tag');
    this.eventBannerTitle = document.getElementById('event-banner-title');
    this.eventBannerDesc = document.getElementById('event-banner-desc');
    this.takeoverAlert = document.getElementById('hud-takeover-alert');

    // HUD 仪表与数据显示
    this.speedNum = document.getElementById('hud-speed-num');
    this.gearIndicator = document.getElementById('gear-indicator');
    this.rpmFill = document.getElementById('hud-rpm-fill');
    this.blinkerL = document.getElementById('blinker-left');
    this.blinkerR = document.getElementById('blinker-right');

    this.headwayBars = document.getElementById('headway-bars').children;
    this.headwayVal = document.getElementById('hud-headway-val');
    this.actualDistTxt = document.getElementById('hud-actual-dist');
    this.targetDistTxt = document.getElementById('hud-target-dist');

    this.ttcVal = document.getElementById('hud-ttc-val');
    this.ttcFill = document.getElementById('hud-ttc-fill');

    this.indAcc = document.getElementById('ind-acc').querySelector('.ind-dot');
    this.indLka = document.getElementById('ind-lka').querySelector('.ind-dot');
    this.indAeb = document.getElementById('ind-aeb').querySelector('.ind-dot');
    this.indAlc = document.getElementById('ind-alc').querySelector('.ind-dot');

    this.mileageTxt = document.getElementById('hud-mileage');
    this.eventsCountTxt = document.getElementById('hud-events-count');
    this.comfortScoreTxt = document.getElementById('hud-comfort-score');

    // 事故分析面板组件
    this.accMetricSpeed = document.getElementById('acc-metric-speed');
    this.accMetricHeadway = document.getElementById('acc-metric-headway');
    this.accMetricDelay = document.getElementById('acc-metric-delay');
    this.accCauseText = document.getElementById('acc-cause-text');
    this.accAdviceText = document.getElementById('acc-advice-text');

    // 设置项控件
    this.chkFlawless = document.getElementById('chk-flawless');
    this.rngCruise = document.getElementById('rng-cruise');
    this.valCruise = document.getElementById('val-set-cruise');
    this.rngHeadway = document.getElementById('rng-headway');
    this.valHeadway = document.getElementById('val-set-headway');
    this.selStyle = document.getElementById('sel-style');
    this.selSensitivity = document.getElementById('sel-sensitivity');
    this.chkAeb = document.getElementById('chk-aeb');
    this.rngLka = document.getElementById('rng-lka');
    this.valLka = document.getElementById('val-set-lka');
    this.chkAlc = document.getElementById('chk-alc');
    this.rngCutin = document.getElementById('rng-cutin');
    this.valCutin = document.getElementById('val-set-cutin');
  }

  initRadarCanvas() {
    this.radarCanvas = document.getElementById('radar-canvas');
    if (this.radarCanvas) {
      this.radarCtx = this.radarCanvas.getContext('2d');
    }
  }

  bindEvents() {
    // 语言常驻切换
    this.btnLangToggle.addEventListener('click', () => {
      i18n.toggleLanguage();
    });

    // 设置滑块联动数值显示
    this.rngCruise.addEventListener('input', (e) => {
      this.valCruise.textContent = `${e.target.value} km/h`;
    });
    this.rngHeadway.addEventListener('input', (e) => {
      const hTimes = [0.8, 1.2, 1.8, 2.4, 3.0];
      const val = hTimes[e.target.value - 1];
      this.valHeadway.textContent = t('headwayLevelFmt', { val: val.toFixed(1), level: e.target.value });
    });
    this.rngLka.addEventListener('input', (e) => {
      this.valLka.textContent = `${e.target.value}x`;
    });
    this.rngCutin.addEventListener('input', (e) => {
      this.valCutin.textContent = `${e.target.value}`;
    });

    // 教程弹窗开关
    document.getElementById('btn-open-tutorial')?.addEventListener('click', () => {
      this.modalTutorial.classList.remove('hidden');
    });
    document.getElementById('btn-close-tut')?.addEventListener('click', () => {
      this.modalTutorial.classList.add('hidden');
    });
    document.getElementById('btn-got-tut')?.addEventListener('click', () => {
      this.modalTutorial.classList.add('hidden');
    });

    // 设置面板关闭
    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      this.modalSettings.classList.add('hidden');
    });
  }

  updateLanguageTexts() {
    // 顶部与品牌
    document.getElementById('txt-app-title').textContent = t('appTitle');
    const langTxt = document.getElementById('txt-lang-toggle');
    if (langTxt) langTxt.textContent = 'English';
    document.getElementById('txt-btn-view').textContent = t('btnView');
    document.getElementById('txt-btn-mode').textContent = t('btnMode');
    document.getElementById('txt-btn-daynight').textContent = t('btnDayNight');
    document.getElementById('txt-btn-lights').textContent = t('btnLights');
    document.getElementById('txt-btn-flawless').textContent = t('btnFlawless');

    // 顶部按钮 Tooltip 提示
    if (this.btnView) this.btnView.title = t('btnViewTitle');
    if (this.btnMode) this.btnMode.title = t('btnModeTitle');
    if (this.btnDayNight) this.btnDayNight.title = t('btnDayNightTitle');
    if (this.btnLights) this.btnLights.title = t('btnLightsTitle');
    if (this.btnFlawless) this.btnFlawless.title = t('btnFlawlessTitle');
    if (this.btnAudio) this.btnAudio.title = t('btnAudioTitle');
    if (this.btnOpenSettings) this.btnOpenSettings.title = t('btnSettingsTitle');
    if (this.btnLangToggle) this.btnLangToggle.title = t('btnLangToggleTitle');

    // 卡片与仪表标题
    document.getElementById('txt-headway-label').textContent = t('headwayLabel');
    document.getElementById('txt-ttc-label').textContent = t('ttcLabel');
    document.getElementById('txt-acc-status').textContent = t('accStatus');
    document.getElementById('txt-lka-status').textContent = t('lkaStatus');
    document.getElementById('txt-aeb-status').textContent = t('aebStatus');
    document.getElementById('txt-alc-status').textContent = t('alcStatus');
    document.getElementById('txt-radar-title').textContent = t('radarTitle');
    document.getElementById('txt-speed-unit').textContent = t('speedUnit');

    // 开始弹窗与选择器选项
    document.getElementById('txt-menu-title').textContent = t('appTitle');
    document.getElementById('txt-menu-sub').textContent = t('appSubtitle');
    document.getElementById('btn-start-drive').textContent = t('startDrive');
    document.getElementById('btn-open-tutorial').textContent = t('tutorialTitle');

    document.getElementById('txt-lbl-diff').textContent = t('settingDifficulty');
    const selDiff = document.getElementById('sel-diff');
    if (selDiff) {
      selDiff.querySelector('option[value="easy"]').textContent = t('diffEasy');
      selDiff.querySelector('option[value="normal"]').textContent = t('diffNormal');
      selDiff.querySelector('option[value="hard"]').textContent = t('diffHard');
    }

    document.getElementById('txt-lbl-weather').textContent = t('settingWeather');
    const selWeather = document.getElementById('sel-weather');
    if (selWeather) {
      selWeather.querySelector('option[value="clear"]').textContent = t('weatherClear');
      selWeather.querySelector('option[value="rain"]').textContent = t('weatherRain');
      selWeather.querySelector('option[value="fog"]').textContent = t('weatherFog');
    }

    document.getElementById('txt-lbl-time').textContent = t('settingTime');
    const selTime = document.getElementById('sel-time');
    if (selTime) {
      selTime.querySelector('option[value="day"]').textContent = t('timeDay');
      selTime.querySelector('option[value="night"]').textContent = t('timeNight');
    }

    document.getElementById('txt-lbl-quality').textContent = t('settingGraphics');
    const selQuality = document.getElementById('sel-quality');
    if (selQuality) {
      selQuality.querySelector('option[value="high"]').textContent = t('qualityHigh');
      selQuality.querySelector('option[value="medium"]').textContent = t('qualityMedium');
      selQuality.querySelector('option[value="low"]').textContent = t('qualityLow');
    }

    // 暂停菜单
    document.getElementById('txt-pause-title').textContent = t('pauseTitle');
    document.getElementById('btn-resume-drive').textContent = t('resumeDrive');
    document.getElementById('btn-pause-settings').textContent = t('settingsBtn');
    document.getElementById('btn-pause-restart').textContent = t('restartDrive');
    document.getElementById('btn-pause-quit').textContent = t('quitToMenu');

    // 设置项
    document.getElementById('txt-settings-title').textContent = t('settingsTitle');
    document.getElementById('txt-set-flawless').textContent = t('settingFlawless');
    document.getElementById('txt-flawless-sub').textContent = t('flawlessTip');
    document.getElementById('txt-set-cruise').textContent = t('settingCruiseSpeed', { val: this.rngCruise.value });
    document.getElementById('txt-set-headway').textContent = t('settingHeadway', { val: this.rngHeadway.value });

    const hTimes = [0.8, 1.2, 1.8, 2.4, 3.0];
    const curLvl = Number(this.rngHeadway.value);
    this.valHeadway.textContent = t('headwayLevelFmt', { val: hTimes[curLvl - 1].toFixed(1), level: curLvl });

    document.getElementById('txt-set-style').textContent = t('settingStyle');
    if (this.selStyle) {
      this.selStyle.querySelector('option[value="conservative"]').textContent = t('styleConservative');
      this.selStyle.querySelector('option[value="standard"]').textContent = t('styleStandard');
      this.selStyle.querySelector('option[value="aggressive"]').textContent = t('styleAggressive');
    }

    document.getElementById('txt-set-sensitivity').textContent = t('settingSensitivity');
    if (this.selSensitivity) {
      this.selSensitivity.querySelector('option[value="low"]').textContent = t('sensitivityLow');
      this.selSensitivity.querySelector('option[value="medium"]').textContent = t('sensitivityMedium');
      this.selSensitivity.querySelector('option[value="high"]').textContent = t('sensitivityHigh');
    }

    document.getElementById('txt-set-aeb').textContent = t('settingAeb');
    document.getElementById('txt-set-lka').textContent = t('settingLka', { val: this.rngLka.value });
    document.getElementById('txt-set-alc').textContent = t('settingAutoLaneChange');
    document.getElementById('txt-set-cutin').textContent = t('settingCutInTolerance');
    document.getElementById('btn-save-settings').textContent = t('apply');

    // 事故报告
    document.getElementById('txt-accident-title').textContent = t('accidentReportTitle');
    document.getElementById('acc-lbl-speed').textContent = t('accMetricSpeedLbl');
    document.getElementById('acc-lbl-headway').textContent = t('accMetricHeadwayLbl');
    document.getElementById('acc-lbl-delay').textContent = t('accMetricDelayLbl');
    document.getElementById('txt-acc-cause-title').textContent = t('accidentCauseTitle');
    document.getElementById('txt-acc-advice-title').textContent = t('accidentAdviceTitle');
    document.getElementById('txt-btn-replay').textContent = t('accidentReplayBtn');
    document.getElementById('txt-btn-restart').textContent = t('accidentBackBtn');
    document.getElementById('txt-replay-badge').textContent = t('replayPlaying');

    // 键位指南
    document.getElementById('txt-tut-title').textContent = t('controlsTitle');
    document.getElementById('tut-key-throttle').textContent = t('tutKeyThrottle');
    document.getElementById('tut-key-brake').textContent = t('tutKeyBrake');
    document.getElementById('tut-key-steer').textContent = t('tutKeySteer');
    document.getElementById('tut-key-handbrake').textContent = t('tutKeyHandbrake');
    document.getElementById('tut-key-smart').textContent = t('tutKeySmart');
    document.getElementById('tut-key-view').textContent = t('tutKeyView');
    document.getElementById('tut-key-daynight').textContent = t('tutKeyDaynight');
    document.getElementById('tut-key-lights').textContent = t('tutKeyLights');
    document.getElementById('tut-key-blinker').textContent = t('tutKeyBlinker');
    document.getElementById('tut-key-pause').textContent = t('tutKeyPause');
    document.getElementById('txt-tut-tip1').textContent = t('tutTip1');
    document.getElementById('txt-tut-tip2').textContent = t('tutTip2');
    document.getElementById('btn-got-tut').textContent = t('tutGotIt');
  }

  updateHUD(vehicle, adas, isNight, mileage, comfortScore, resolvedEvents) {
    // 1. 车速与档位
    const speedKmh = Math.max(0, Math.round(vehicle.speed * 3.6));
    this.speedNum.textContent = speedKmh;
    this.gearIndicator.textContent = vehicle.gear;

    // 2. RPM 转速条
    const rpmPercent = Math.min(100, Math.max(5, (vehicle.rpm / 6800) * 100));
    this.rpmFill.style.width = `${rpmPercent}%`;

    // 3. 转向灯闪烁状态
    const lLit = (vehicle.blinkerState === -1 || vehicle.blinkerState === 2) && vehicle.blinkerLit;
    const rLit = (vehicle.blinkerState === 1 || vehicle.blinkerState === 2) && vehicle.blinkerLit;
    this.blinkerL.classList.toggle('active', lLit);
    this.blinkerR.classList.toggle('active', rLit);

    // 4. 模式指示徽章
    if (adas.isActive) {
      this.modeBadge.className = 'mode-badge smart';
      this.modeBadge.textContent = t('modeSmart');
    } else {
      this.modeBadge.className = 'mode-badge manual';
      this.modeBadge.textContent = t('modeManual');
    }

    // 5. 无失误模式徽章
    this.flawlessBadge.classList.toggle('hidden', !adas.flawlessMode);
    this.btnFlawless.classList.toggle('active', adas.flawlessMode);

    // 6. 跟车时距柱状格 (1~5 档)
    const level = adas.headwayLevel;
    this.headwayVal.textContent = t('headwayLevelFmt', { val: adas.headwayTime.toFixed(1), level: level });
    for (let i = 0; i < 5; i++) {
      if (i < level) {
        this.headwayBars[i].classList.add('active');
      } else {
        this.headwayBars[i].classList.remove('active');
      }
    }

    // 7. 实际与目标车距
    if (adas.actualDistance !== null) {
      this.actualDistTxt.textContent = t('actualDistance', { dist: adas.actualDistance.toFixed(1) });
    } else {
      this.actualDistTxt.textContent = t('actualDistance', { dist: '--' });
    }
    this.targetDistTxt.textContent = t('targetDistance', { dist: adas.targetDistance.toFixed(1) });

    // 8. TTC 碰撞时间警告条
    const ttc = adas.ttc;
    if (ttc < 1.4) {
      this.ttcVal.className = 'ttc-val danger';
      this.ttcVal.textContent = `${ttc.toFixed(1)}s ${t('dangerTtc')}`;
      this.ttcFill.className = 'ttc-bar-fill danger';
      this.ttcFill.style.width = `${Math.min(100, (ttc / 3.0) * 100)}%`;
    } else if (ttc < 2.5) {
      this.ttcVal.className = 'ttc-val warning';
      this.ttcVal.textContent = `${ttc.toFixed(1)}s`;
      this.ttcFill.className = 'ttc-bar-fill warning';
      this.ttcFill.style.width = `${Math.min(100, (ttc / 3.0) * 100)}%`;
    } else {
      this.ttcVal.className = 'ttc-val safe';
      this.ttcVal.textContent = t('safeTtc');
      this.ttcFill.className = 'ttc-bar-fill safe';
      this.ttcFill.style.width = '100%';
    }

    // 9. ADAS 状态灯
    this.indAcc.classList.toggle('active', adas.isActive);
    this.indLka.classList.toggle('active', adas.isActive && adas.lkaStrength > 0);
    this.indAeb.classList.toggle('active', adas.aebEnabled);
    this.indAlc.classList.toggle('active', adas.autoLaneChange);

    // 10. 行驶统计数据
    this.mileageTxt.textContent = t('statDistance', { val: (mileage / 1000).toFixed(2) });
    this.eventsCountTxt.textContent = t('statResolved', { val: resolvedEvents });
    this.comfortScoreTxt.textContent = t('statComfort', { val: Math.round(comfortScore) });
  }

  renderRadar(vehicle, surrounding) {
    if (!this.radarCtx) return;
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = w / 100; // 50m 半径雷达

    ctx.clearRect(0, 0, w, h);

    // 1. 同心雷达圆环
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.2)';
    ctx.lineWidth = 1;
    [0.35, 0.7, 1.0].forEach(rRatio => {
      ctx.beginPath();
      ctx.arc(cx, cy, (w / 2) * rRatio, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 2. 车道分隔标线动态投影 (自适应 3 车道)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    const roadHalfW = (CONFIG.world.laneWidth * CONFIG.world.laneCount) / 2;
    const laneLines = [-roadHalfW];
    for (let i = 1; i < CONFIG.world.laneCount; i++) {
      laneLines.push(-roadHalfW + i * CONFIG.world.laneWidth);
    }
    laneLines.push(roadHalfW);

    laneLines.forEach(lx => {
      const canvasX = cx + (lx - vehicle.position.x) * scale;
      if (canvasX > 0 && canvasX < w) {
        ctx.beginPath();
        ctx.moveTo(canvasX, 0);
        ctx.lineTo(canvasX, h);
        ctx.stroke();
      }
    });

    // 3. 周边 NPC 车辆点位
    surrounding.forEach(item => {
      const rx = cx + item.dx * scale;
      const ry = cy + item.dz * scale; // dz < 0 向上

      if (rx >= 4 && rx <= w - 4 && ry >= 4 && ry <= h - 4) {
        // 根据前后距离判定警示颜色
        ctx.fillStyle = Math.abs(item.dz) < 18 && Math.abs(item.dx) < 2.5 ? '#ef4444' : '#00f076';
        ctx.fillRect(rx - 3, ry - 4, 6, 8);
      }
    });

    // 4. 自身车辆图标 (中央白色小三角)
    ctx.fillStyle = '#00d2ff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4, cy + 5);
    ctx.lineTo(cx + 4, cy + 5);
    ctx.closePath();
    ctx.fill();
  }

  showEventBanner(event) {
    if (!event) {
      this.eventBanner.classList.add('hidden');
      return;
    }
    this.eventBanner.classList.remove('hidden');

    const typeKeyMap = {
      accident_ahead: { title: 'evAccidentTitle', desc: 'evAccidentDesc' },
      traffic_jam: { title: 'evTrafficJamTitle', desc: 'evTrafficJamDesc' },
      aggressive_cutin: { title: 'evCutInTitle', desc: 'evCutInDesc' },
      lead_hard_brake: { title: 'evHardBrakeTitle', desc: 'evHardBrakeDesc' },
      road_obstacle: { title: 'evObstacleTitle', desc: 'evObstacleDesc' },
      broken_vehicle: { title: 'evBrokenCarTitle', desc: 'evBrokenCarDesc' },
      pedestrian_crossing: { title: 'evCrossingTitle', desc: 'evCrossingDesc' }
    };

    const keys = typeKeyMap[event.type] || { title: 'evAccidentTitle', desc: 'evAccidentDesc' };
    const dist = Math.max(5, Math.round(event.minDistance > 500 ? 110 : event.minDistance));

    if (event.stage === 'PRE_WARNING') {
      this.eventBanner.className = 'event-banner warning';
      this.eventBannerTag.textContent = t('eventWarningPrefix');
      this.eventBannerTitle.textContent = t(keys.title);
      this.eventBannerDesc.textContent = t(keys.desc, { dist: dist });
    } else if (event.stage === 'ACTIVE') {
      this.eventBanner.className = 'event-banner';
      this.eventBannerTag.textContent = t('eventHappeningPrefix');
      this.eventBannerTitle.textContent = t(keys.title);
      this.eventBannerDesc.textContent = t(keys.desc, { dist: dist });
    } else if (event.stage === 'RESOLVED') {
      this.eventBanner.className = 'event-banner resolved';
      this.eventBannerTag.textContent = t('eventResolvedPrefix');
      this.eventBannerTitle.textContent = t('eventResolvedPrefix');
      this.eventBannerDesc.textContent = t('eventResolvedMsg', {
        minDist: event.minDistance.toFixed(1),
        minTtc: event.minTtc > 50 ? '--' : event.minTtc.toFixed(1)
      });
      setTimeout(() => this.eventBanner.classList.add('hidden'), 3500);
    }
  }

  showTakeoverAlert() {
    this.takeoverAlert.classList.remove('hidden');
    setTimeout(() => {
      this.takeoverAlert.classList.add('hidden');
    }, 2800);
  }

  showAccidentReport(report) {
    this.accMetricSpeed.textContent = `${report.speed} km/h`;
    this.accMetricHeadway.textContent = `${report.headway.toFixed(1)} s`;
    this.accMetricDelay.textContent = `${report.delayMs} ms`;
    this.accCauseText.textContent = report.causeText;
    this.accAdviceText.textContent = report.adviceText;
    this.modalAccident.classList.remove('hidden');
  }

  triggerCrashFeedback() {
    this.crashOverlay.classList.add('active');
    setTimeout(() => {
      this.crashOverlay.classList.remove('active');
    }, 600);
  }
}
