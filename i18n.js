/**
 * i18n.js - Pure English Localization and Dictionary Management
 * Zero Chinese characters; all keys map strictly to English.
 */

const STORAGE_KEY = 'smart_driving_sim_lang';

const EN_DICTIONARY = {
  // Basic & System
  appTitle: 'Autonomous Driving Experience',
  appSubtitle: 'Three.js 3D Smart Driving Simulation Lab',
  langName: 'English',
  loading: 'Initializing System...',
  startDrive: 'Start Driving',
  resumeDrive: 'Resume',
  restartDrive: 'Restart',
  pauseTitle: 'Simulation Paused',
  quitToMenu: 'Return to Menu',
  settingsTitle: 'Smart Driving & System Settings',
  accidentReportTitle: 'In-depth Accident Analysis Report',
  close: 'Close',
  apply: 'Apply',
  flawlessBadge: 'Flawless Mode Active',
  flawlessTip: 'Ideal perception & optimal decisions, score not ranked',
  leaderboardTitle: 'Leaderboard',
  tutorialTitle: 'Beginner Driving Guide',
  controlsTitle: 'Controls Guide',

  // Modes & States
  modeManual: 'Manual Driving',
  modeSmart: 'Smart Driving (ADAS)',
  modeFlawless: 'Flawless Mode',
  statusStandby: 'Standby',
  statusActive: 'Active',
  statusWarning: 'Warning',
  statusEmergency: 'Emergency Braking',
  statusTakeover: 'Driver Override',

  // HUD Meters
  speedUnit: 'km/h',
  gearP: 'P',
  gearR: 'R',
  gearN: 'N',
  gearD: 'D',
  headwayLabel: 'Time Headway',
  actualDistance: 'Actual Gap: {dist} m',
  targetDistance: 'Target Gap: {dist} m',
  ttcLabel: 'Time To Collision (TTC)',
  safeTtc: 'Safe',
  dangerTtc: 'Danger!',
  accStatus: 'ACC Cruise',
  lkaStatus: 'LKA Lane Keep',
  aebStatus: 'AEB Braking',
  alcStatus: 'ALC Lane Change',
  radarTitle: '360° Situational Radar',
  weatherClear: 'Clear (Optimal Grip)',
  weatherRain: 'Rain (Wet Road, Lower Grip)',
  weatherFog: 'Fog (Low Visibility)',
  settingWeather: 'Weather Simulation',
  settingTime: 'Time of Day',
  timeDay: 'Daytime',
  timeNight: 'Night (Lighting / Sensor Penalty)',

  // Quick Action Buttons
  btnView: 'Switch View [V]',
  btnMode: 'Toggle ADAS [C]',
  btnDayNight: 'Day/Night [N]',
  btnFlawless: 'Flawless Mode',
  btnLights: 'Lights [L]',
  btnMute: 'Mute',
  btnHelp: 'Help',
  btnSettings: 'Settings',
  settingsBtn: 'ADAS Settings',

  // Settings
  settingCruiseSpeed: 'Cruise Speed ({val} km/h)',
  settingHeadway: 'Headway Time Level ({val} s)',
  settingStyle: 'Driving Style',
  styleConservative: 'Conservative (High Buffer, Smooth)',
  styleStandard: 'Standard Balanced',
  styleAggressive: 'Aggressive (Tight Merging, High Power)',
  settingSensitivity: 'Sensor Sensitivity',
  sensitivityLow: 'Low (Short Range, Sensor Lag)',
  sensitivityMedium: 'Medium (Standard Radar/Vision)',
  sensitivityHigh: 'High (High-Precision Long Range)',
  settingAeb: 'AEB Emergency Braking',
  settingLka: 'LKA Centering Strength ({val}x)',
  settingAutoLaneChange: 'Smart Lane Change & Overtake',
  settingCutInTolerance: 'Cut-in Tolerance',
  settingFlawless: 'Flawless Ideal Mode (Optimal Safety)',
  settingDifficulty: 'Difficulty Level',
  diffEasy: 'Easy (Fewer events, wider window)',
  diffNormal: 'Normal (Standard highway traffic)',
  diffHard: 'Hard (High-frequency emergencies)',
  settingGraphics: 'Graphics Quality',
  qualityHigh: 'High (HD Shadows & Foliage)',
  qualityMedium: 'Medium (Balanced)',
  qualityLow: 'Low (Smooth FPS)',
  settingVolume: 'Master Volume',

  // Event Alerts
  eventWarningPrefix: '[WARNING]',
  eventHappeningPrefix: '[EMERGENCY]',
  eventResolvedPrefix: '[RESOLVED]',
  eventCrashPrefix: '[COLLISION]',

  evAccidentTitle: 'Crash Ahead',
  evAccidentDesc: 'Multi-vehicle collision {dist}m ahead blocking lanes. Decelerating or lane changing!',
  evTrafficJamTitle: 'Traffic Jam Ahead',
  evTrafficJamDesc: 'Traffic cluster {dist}m ahead suddenly slowing to near stop. Maintain safety distance!',
  evCutInTitle: 'Aggressive Cut-in',
  evCutInDesc: 'Adjacent vehicle aggressively merging into our lane at {dist}m! Braking to yield!',
  evHardBrakeTitle: 'Lead Vehicle Hard Brake',
  evHardBrakeDesc: 'Lead vehicle at {dist}m slammed on brakes! Forward Collision Warning triggered!',
  evObstacleTitle: 'Obstacle on Road',
  evObstacleDesc: 'Cargo debris and tire detected on road {dist}m ahead. Initiating avoidance maneuver!',
  evBrokenCarTitle: 'Disabled Broken Vehicle',
  evBrokenCarDesc: 'Disabled stopped vehicle at {dist}m ahead (lights off). Radar recalibrating!',
  evCrossingTitle: 'Pedestrian / Obstacle Crossing',
  evCrossingDesc: 'Moving obstacle crossing lanes {dist}m ahead! Initiating emergency braking!',

  eventResolvedMsg: 'Successfully avoided hazard! Min Gap: {minDist} m, Min TTC: {minTtc} s.',
  eventCollidedMsg: 'Collision occurred! Impact Delta-V: {speed} km/h. Generating accident analysis...',

  // Takeover & Prompts
  takeoverTriggered: '[DRIVER OVERRIDE] Manual braking/steering detected. ADAS disengaged smoothly!',
  lightsWarning: '[LIGHTING WARNING] Low ambient light! Press [L] to turn on headlights for sensor safety!',

  // Accident Analysis (R8)
  accMetricSpeedLbl: 'Impact Speed',
  accMetricHeadwayLbl: 'Time Headway',
  accMetricDelayLbl: 'Sensor & Env Latency',
  accidentCauseTitle: 'Primary Cause Analysis',
  accidentCauseHeadway: 'Headway time set too short ({time}s). At {speed} km/h, required braking distance exceeded perception margin.',
  accidentCauseSensitivity: 'Sensor sensitivity was set to Low, combined with low ambient light added ~{delay}ms perception lag, delaying braking reaction.',
  accidentCauseAggressive: 'Aggressive style attempted overtaking without sufficient adjacent lane safety clearance.',
  accidentCauseUnlitNight: 'Extremely poor visibility at night with headlights off delayed detection of unlit obstacle car.',
  accidentCauseManualError: 'Manual mode driver did not brake in time or failed to steer clear of hazard.',
  accidentCauseGuardrail: 'Vehicle deviated from road and collided with highway metal guardrail at {speed} km/h. LKA strength was insufficient or manual steering overshot.',
  accidentAdviceTitle: 'Optimization & Tuning Advice',
  accidentAdviceHeadway: 'Increase time headway to 1.8s or above, or lower the cruise speed.',
  accidentAdviceSensitivity: 'Set sensor sensitivity to Medium or High, or enable automatic lane change assistance.',
  accidentAdviceNight: 'Keep headlights ON during night driving, or enable Flawless Mode for benchmarking.',
  accidentAdviceGuardrail: 'Recommend enabling LKA Lane Keeping or increasing LKA strength to avoid drifting on 3-lane highway.',
  accidentReplayBtn: '5-Second Slow-Mo Replay',
  accidentBackBtn: 'Restart Drive',

  // Stats & Replay
  statDistance: 'Safe Distance: {val} km',
  statResolved: 'Resolved Hazards: {val}',
  statScore: 'Safety Score: {val}',
  statComfort: 'Comfort Rating: {val} pts',
  replayPlaying: '[REPLAYING] Slow-motion replay of 5 seconds prior to impact...',

  // Tutorial
  tutorialStep1: 'Welcome to the Autonomous Driving Experience! Supports both manual control and full ADAS assistance.',
  tutorialStep2: 'Manual controls: W/S accelerate & brake, A/D steer, Space handbrake, L lights, Q/E turn signals.',
  tutorialStep3: 'Press [C] anytime to engage Smart Driving. Stepping on brakes immediately triggers smooth takeover.',
  tutorialStep4: 'Press [N] to toggle Day/Night. Night time reduces sensor range and tests algorithmic robustness.',
  tutorialStep5: 'Switch on Flawless Mode anytime in settings or HUD to experience ideal AI hazard avoidance!',
  tutKeyThrottle: 'Throttle / Accelerate',
  tutKeyBrake: 'Brake / Reverse',
  tutKeySteer: 'Steering Wheel',
  tutKeyHandbrake: 'Handbrake',
  tutKeySmart: 'Toggle Smart Driving (ADAS)',
  tutKeyView: 'Switch FPV / TPV View',
  tutKeyDaynight: 'Toggle Day / Night',
  tutKeyLights: 'Toggle Headlights ON / OFF',
  tutKeyBlinker: 'Left / Right Turn Signals',
  tutKeyPause: 'Pause Menu',
  tutTip1: '💡 When Smart Driving is active, controls are automated. Tap the brake or steer firmly at any time to smoothly take over.',
  tutTip2: '🌙 Low ambient light at night reduces sensor detection distance; keep headlights on at night for optimal safety.',
  tutGotIt: 'Got it, Let\'s Drive',
  headwayLevelFmt: '{val}s (Level {level})',

  // Top Button Tooltips
  btnViewTitle: 'Switch View [V]',
  btnModeTitle: 'Toggle ADAS [C]',
  btnDayNightTitle: 'Toggle Day/Night [N]',
  btnLightsTitle: 'Headlights [L]',
  btnFlawlessTitle: 'Flawless Mode',
  btnAudioTitle: 'Mute Audio',
  btnSettingsTitle: 'Settings',
  btnLangToggleTitle: 'English Only',
  gotIt: 'Got it, Let\'s Drive'
};

const DICTIONARY = {
  en: EN_DICTIONARY,
  zh: EN_DICTIONARY // Ensures fallback or forced English in all cases
};

class I18nManager {
  constructor() {
    this.lang = 'en';
    this.listeners = new Set();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'en');
    }
  }

  get currentLang() {
    return 'en';
  }

  setLanguage() {
    // English only
    this.lang = 'en';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'en');
    }
    this.notify();
  }

  toggleLanguage() {
    this.setLanguage('en');
  }

  t(key, params = {}) {
    let text = EN_DICTIONARY[key];
    if (text === undefined) {
      text = key;
    }
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return text;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const cb of this.listeners) {
      try {
        cb(this.lang);
      } catch (e) {
        console.error('i18n notify error:', e);
      }
    }
  }
}

export const i18n = new I18nManager();
export const t = (key, params) => i18n.t(key, params);
