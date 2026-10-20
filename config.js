/**
 * config.js - 智能驾驶体验小游戏 全局数值配置
 * 集中管理物理动力学、智驾算法、道路规格、画质与事件参数
 */

export const CONFIG = {
  // 物理与动力学配置
  physics: {
    fixedTimeStep: 1 / 60, // 固定物理更新时间步长 (秒)
    gravity: 9.81,
    maxForwardSpeed: 160 / 3.6, // 最大前进速度 160 km/h (转换为 m/s ≈ 44.4 m/s)
    maxReverseSpeed: 35 / 3.6, // 最大倒车速度 35 km/h (m/s)
    engineForce: 10200, // 电驱瞬时扭矩驱动力 (N)
    brakeForce: 18000, // 四轮液压制动力 (N)
    handbrakeForce: 28000, // 后轮手刹制动力 (N)
    dragCoefficient: 0.28, // 流线型跑车级风阻系数
    frontalArea: 2.15, // 车头迎风面积 (m²)
    airDensity: 1.225, // 空气密度 (kg/m³)
    rollingResistance: 0.012, // 低滚阻轮胎阻力系数
    vehicleMass: 1750, // 纯电高性能底盘整车整备质量 (kg)
    wheelbase: 2.85, // 轴距 (m)
    trackWidth: 1.62, // 轮距 (m)
    maxSteerAngle: 0.56, // 低速最大转向角 (rad ≈ 32度)
    steerSpeedDampFactor: 0.02, // 高速转向动态阻尼
    steerReturnSpeed: 5.2, // 方向盘回正速率 (rad/s)
    steerInputSpeed: 4.0, // 转向响应速率 (rad/s)
    gripLimit: 1.25, // 轮胎最大侧向抓地力系数 (G)
    tireCorneringStiffnessFront: 18000, // 前轮侧偏刚度 (N/rad)
    tireCorneringStiffnessRear: 22000, // 后轮侧偏刚度 (N/rad，后轮稍大保障高速稳定性)
    rainGripFactor: 0.70 // 雨天路面附着力衰减系数
  },

  // 道路与世界规格 (根据需求缩窄至 3 车道)
  world: {
    laneWidth: 3.75, // 标准车道宽 (m)
    laneCount: 3, // 单向 3 车道 (缩窄至 3 车道)
    roadLength: 1200, // 动态循环道路段总长度 (m)
    chunkLength: 200, // 每段道路区块长度 (m)
    shoulderWidth: 2.2, // 应急车道 / 路肩宽度 (m)
    guardrailHeight: 0.85, // 护栏高度 (m)
    lightPoleSpacing: 40, // 路灯间距 (m)
    treeSpacing: 18, // 树木间距 (m)
    horizonDistance: 700 // 视距远截面 (m)
  },

  // 车辆碰撞体积 (Bounding Box Hitbox) 配置
  hitbox: {
    player: { width: 1.88, length: 4.5, height: 1.4 },
    sedan: { width: 1.85, length: 4.5, height: 1.4 },
    suv: { width: 1.95, length: 4.8, height: 1.6 },
    truck: { width: 2.4, length: 9.5, height: 3.2 },
    bus: { width: 2.45, length: 10.8, height: 3.0 },
    crate: { width: 1.2, length: 1.2, height: 1.0 },
    tire: { width: 1.0, length: 1.0, height: 0.5 },
    pedestrian: { width: 0.8, length: 0.8, height: 1.7 }
  },

  // 智能驾驶 (ADAS) 默认配置与可调节范围 (一开始进入游戏所有选项开到最高)
  adas: {
    defaultCruiseSpeed: 130, // 默认巡航车速开到最高 130 km/h
    minCruiseSpeed: 30, // 最低巡航车速 (km/h)
    maxCruiseSpeed: 130, // 最高巡航车速 (km/h)

    defaultHeadwayTime: 3.0, // 默认跟车时距开到最高 3.0 秒 (5档)
    defaultHeadwayLevel: 5,
    minHeadwayTime: 0.8, // 最短跟车时距 (秒)
    maxHeadwayTime: 3.0, // 最长跟车时距 (秒)
    headwayLevels: [0.8, 1.2, 1.8, 2.4, 3.0], // 1~5 档对应时距 (秒)

    defaultStyle: 'aggressive', // 驾驶风格开到最高/最强动力: 'aggressive'
    defaultSensitivity: 'high', // 传感器灵敏度开到最高: 'high'

    aebEnabled: true, // AEB 自动紧急制动开关
    aebTtcThreshold: 1.6, // AEB 触发的 TTC (碰撞时间) 阈值 (秒)
    aebMaxDecel: 9.5, // AEB 最大紧急减速度 (m/s²)

    lkaEnabled: true, // LKA 车道保持辅助开关
    lkaStrength: 2.0, // LKA 转向纠偏力度开到最高 2.0x (0.2 ~ 2.0)

    autoLaneChange: true, // 自动变道避障开关
    laneChangeSpeedDiff: 15 / 3.6, // 前车低于巡航设定速度该差值时触发变道判定 (m/s)
    safeLaneChangeGapFront: 18, // 变道目标车道前方安全间隙 (m)
    safeLaneChangeGapRear: 12, // 变道目标车道后方安全间隙 (m)

    cutInTolerance: 2.0, // 加塞容忍度开到最高 2.0 (0.5~2.0)
    flawlessMode: false, // 「无失误模式」开关

    // 感知延迟与噪声调制参数
    perception: {
      lowSensitivityLag: 0.28, // 低灵敏度感知延迟 (秒)
      midSensitivityLag: 0.16, // 中灵敏度感知延迟 (秒)
      highSensitivityLag: 0.06, // 高灵敏度感知延迟 (秒)
      nightLagPenalty: 0.15, // 夜间额外感知延迟 (秒)
      unlitCarExtraLag: 0.35, // 夜间无灯车辆额外识别延迟 (秒)
      noiseStdDevPos: 0.45, // 距离探测高斯标准差 (m)
      noiseStdDevSpeed: 0.65 // 相对车速探测高斯标准差 (m/s)
    }
  },

  // 视角与相机配置
  camera: {
    fov: 65,
    near: 0.05, // 超近裁剪面，彻底消除方向盘与内饰穿模
    far: 1200,
    fpvFov: 72, // 第一人称使用 72 度黄金广角，完美容纳方向盘、仪表盘、中控屏与后视镜
    fpvOffset: { x: -0.38, y: 1.06, z: -0.05 }, // 驾驶员自然眼部位置 (远离方向盘，防穿模)
    fpvLookOffset: { x: -0.28, y: 0.94, z: 15.0 }, // 自然前视注视点 (朝向 -Z 前方)
    tpvBaseDistance: 6.2, // 第三人称基准距离 (m)
    tpvBaseHeight: 2.2, // 第三人称基准高度 (m)
    tpvLookHeight: 1.1, // 第三人称注视点高度 (m)
    tpvSpeedZoomFactor: 0.08, // 随车速向后拉远距离系数
    transitionDuration: 0.6 // 视角平滑过渡时间 (秒)
  },

  // 突发事件调度配置
  events: {
    minSpawnInterval: 18, // 最小触发间隔 (秒)
    maxSpawnInterval: 40, // 最大触发间隔 (秒)
    warningDistance: 130, // 提前预警探测距离 (m)
    clearDistance: 40 // 事件安全化解判定距离 (m)
  },

  // 难度配置
  difficulty: {
    easy: { eventFreqMultiplier: 0.6, npcDensity: 0.65, timeWindowScale: 1.3 },
    normal: { eventFreqMultiplier: 1.0, npcDensity: 1.0, timeWindowScale: 1.0 },
    hard: { eventFreqMultiplier: 1.5, npcDensity: 1.35, timeWindowScale: 0.75 }
  },

  // 画质预设配置
  graphics: {
    high: {
      shadowMapSize: 2048,
      shadows: true,
      antialias: true,
      maxVisibleChunks: 6,
      instancedFoliage: true
    },
    medium: {
      shadowMapSize: 1024,
      shadows: true,
      antialias: true,
      maxVisibleChunks: 4,
      instancedFoliage: true
    },
    low: {
      shadowMapSize: 512,
      shadows: false,
      antialias: false,
      maxVisibleChunks: 3,
      instancedFoliage: false
    }
  },

  // 音量与音效参数
  audio: {
    masterVolume: 0.75,
    engineVolume: 0.55,
    alertsVolume: 0.85,
    crashVolume: 0.95
  }
};
