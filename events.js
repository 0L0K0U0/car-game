/**
 * events.js - 突发事件调度系统与事故因果分析引擎
 * 满足需求 R7, R8：8 类典型道路难题（车祸堵塞、急刹、加塞、横穿、障碍物、暗夜黑车等）、难度曲线调度、生命周期追踪与事故因果归因
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { t } from './i18n.js';

export class EventManager {
  constructor(scene, world, audio, difficulty = 'normal') {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.difficulty = difficulty;

    this.timer = 0;
    this.nextSpawnTime = 12; // 首次触发等待时间
    this.activeEvent = null;

    // 统计指标
    this.resolvedCount = 0;
    this.totalEvents = 0;

    // 事件危险物 3D 实体容器
    this.hazardGroup = new THREE.Group();
    this.scene.add(this.hazardGroup);

    // 碰撞回调
    this.onCrashCallback = null;
    this.onEventUpdateCallback = null;
  }

  setDifficulty(diff) {
    this.difficulty = diff;
  }

  update(delta, playerVehicle, adasSystem, trafficManager, isNight) {
    this.timer += delta;

    // 1. 事件调度生成
    if (!this.activeEvent && this.timer >= this.nextSpawnTime) {
      this.spawnRandomEvent(playerVehicle, trafficManager, isNight);
      this.timer = 0;
      const cfg = CONFIG.difficulty[this.difficulty] || CONFIG.difficulty.normal;
      const baseInterval = (CONFIG.events.minSpawnInterval + Math.random() * (CONFIG.events.maxSpawnInterval - CONFIG.events.minSpawnInterval));
      this.nextSpawnTime = baseInterval / cfg.eventFreqMultiplier;
    }

    // 2. 活跃事件生命周期追踪
    if (this.activeEvent) {
      this.updateActiveEvent(delta, playerVehicle, adasSystem, isNight);
    }
  }

  spawnRandomEvent(playerVehicle, trafficManager, isNight) {
    const pZ = playerVehicle.position.z;
    const pX = playerVehicle.position.x;
    const currentLane = Math.round((pX - this.world.getLaneX(0)) / CONFIG.world.laneWidth);

    const eventTypes = [
      'accident_ahead',
      'traffic_jam',
      'aggressive_cutin',
      'lead_hard_brake',
      'road_obstacle',
      'broken_vehicle',
      'pedestrian_crossing'
    ];
    const chosenType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const spawnDistance = 110 + Math.random() * 25;
    const targetZ = pZ - spawnDistance;

    const eventObj = {
      type: chosenType,
      stage: 'PRE_WARNING', // 'PRE_WARNING' | 'ACTIVE' | 'RESOLVED' | 'COLLIDED'
      spawnZ: targetZ,
      lane: THREE.MathUtils.clamp(currentLane, 0, CONFIG.world.laneCount - 1),
      minDistance: 999,
      minTtc: 999,
      hazardObjects: [],
      cutinVehicle: null,
      crossingSpeed: 4.5,
      crossingX: 0
    };

    // 构建具体难题的 3D 障碍与情境
    this.buildHazardScenery(eventObj, playerVehicle, trafficManager, isNight);
    this.activeEvent = eventObj;
    this.totalEvents++;

    if (this.onEventUpdateCallback) {
      this.onEventUpdateCallback(this.activeEvent);
    }
  }

  buildHazardScenery(event, playerVehicle, trafficManager, isNight) {
    const laneX = this.world.getLaneX(event.lane);
    const z = event.spawnZ;

    if (event.type === 'accident_ahead') {
      // 1. 前方多车事故碰撞现场 (两辆撞毁车倾斜摆放，带烟雾/警示灯与碎片)
      const car1Geom = new THREE.BoxGeometry(1.9, 1.2, 4.2);
      const car1Mat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 });
      const c1 = new THREE.Mesh(car1Geom, car1Mat);
      c1.position.set(laneX - 0.8, 0.6, z);
      c1.rotation.y = 0.55;
      this.hazardGroup.add(c1);
      event.hazardObjects.push(c1);

      const c2 = new THREE.Mesh(car1Geom, new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
      c2.position.set(laneX + 1.2, 0.6, z - 3);
      c2.rotation.y = -0.4;
      this.hazardGroup.add(c2);
      event.hazardObjects.push(c2);

      // 路面散落碎片 (3 个小碎块)
      for (let i = 0; i < 4; i++) {
        const deb = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.2, 0.4),
          new THREE.MeshStandardMaterial({ color: 0x1e293b })
        );
        deb.position.set(laneX + (Math.random() - 0.5) * 3, 0.1, z + (Math.random() - 0.5) * 6);
        this.hazardGroup.add(deb);
        event.hazardObjects.push(deb);
      }
    } else if (event.type === 'traffic_jam') {
      // 2. 车流突阻：前方车道多辆 NPC 急剧减速至 10 km/h
      for (const v of trafficManager.vehicles) {
        if (v.group.position.z < playerVehicle.position.z && v.group.position.z > z - 50) {
          v.speed = (12 / 3.6);
          v.targetSpeed = (12 / 3.6);
        }
      }
    } else if (event.type === 'aggressive_cutin') {
      // 3. 强行加塞：相邻车道的 NPC 突然近距离打灯切入本车道
      const adjLane = event.lane > 0 ? event.lane - 1 : event.lane + 1;
      const cutinCar = trafficManager.createNpcVehicle('sedan', false);
      cutinCar.lane = adjLane;
      cutinCar.targetLane = event.lane;
      cutinCar.group.position.set(this.world.getLaneX(adjLane), 0, playerVehicle.position.z - 28);
      cutinCar.speed = playerVehicle.speed * 0.95;
      cutinCar.laneChangeProgress = 0;
      cutinCar.laneChangeStartX = this.world.getLaneX(adjLane);
      cutinCar.laneChangeTargetX = laneX;
      cutinCar.blinkerState = event.lane > adjLane ? 1 : -1;
      trafficManager.vehicles.push(cutinCar);
      event.cutinVehicle = cutinCar;
    } else if (event.type === 'lead_hard_brake') {
      // 4. 前车急刹：本车道前车突发全制动
      let closestAhead = null;
      let minGap = 999;
      for (const v of trafficManager.vehicles) {
        if (v.lane === event.lane && v.group.position.z < playerVehicle.position.z) {
          const gap = playerVehicle.position.z - v.group.position.z;
          if (gap < minGap) {
            minGap = gap;
            closestAhead = v;
          }
        }
      }
      if (closestAhead) {
        closestAhead.speed = 0;
        closestAhead.targetSpeed = 0;
      }
    } else if (event.type === 'road_obstacle') {
      // 5. 路面掉落物 (木箱货包与大货车废旧轮胎)
      const crateGeom = new THREE.BoxGeometry(1.2, 1.0, 1.2);
      const crateMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 });
      const crate = new THREE.Mesh(crateGeom, crateMat);
      crate.position.set(laneX + 0.3, 0.5, z);
      this.hazardGroup.add(crate);
      event.hazardObjects.push(crate);

      const tireGeom = new THREE.TorusGeometry(0.45, 0.18, 10, 16);
      const tire = new THREE.Mesh(tireGeom, new THREE.MeshStandardMaterial({ color: 0x111827 }));
      tire.rotation.x = Math.PI / 2;
      tire.position.set(laneX - 0.7, 0.2, z + 2);
      this.hazardGroup.add(tire);
      event.hazardObjects.push(tire);
    } else if (event.type === 'broken_vehicle') {
      // 6. 抛锚故障车 (夜间无灯黑车，雷达需重定标)
      const brokenCar = trafficManager.createNpcVehicle('suv', isNight);
      brokenCar.group.position.set(laneX, 0, z);
      brokenCar.speed = 0;
      brokenCar.targetSpeed = 0;
      brokenCar.isUnlitAtNight = isNight;
      trafficManager.vehicles.push(brokenCar);
      event.hazardObjects.push(brokenCar.group);
    } else if (event.type === 'pedestrian_crossing') {
      // 7. 横穿公路险情
      const pedGeom = new THREE.CapsuleGeometry(0.35, 1.2, 4, 8);
      const pedMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e });
      const ped = new THREE.Mesh(pedGeom, pedMat);
      event.crossingX = this.world.getLaneX(CONFIG.world.laneCount - 1) + 2.0;
      ped.position.set(event.crossingX, 0.95, z);
      this.hazardGroup.add(ped);
      event.hazardObjects.push(ped);
    }
  }

  updateActiveEvent(delta, playerVehicle, adasSystem, isNight) {
    const e = this.activeEvent;
    const pZ = playerVehicle.position.z;
    const pX = playerVehicle.position.x;
    const distanceToHazard = pZ - e.spawnZ;

    // 横穿行人运动推进
    if (e.type === 'pedestrian_crossing' && e.hazardObjects.length > 0) {
      const ped = e.hazardObjects[0];
      ped.position.x -= delta * e.crossingSpeed;
    }

    // 记录最小车距与最小 TTC
    if (distanceToHazard > 0) {
      if (distanceToHazard < e.minDistance) e.minDistance = distanceToHazard;
      if (adasSystem.ttc < e.minTtc) e.minTtc = adasSystem.ttc;
    }

    // 阶段流转
    if (e.stage === 'PRE_WARNING' && distanceToHazard < 65) {
      e.stage = 'ACTIVE';
    }

    // 碰撞检测 (与事故现场物理包围盒判定)
    for (const obj of e.hazardObjects) {
      const dx = Math.abs(pX - obj.position.x);
      const dz = Math.abs(pZ - obj.position.z);
      if (dx < 1.6 && dz < 3.2) {
        // 发生真实碰撞！
        this.triggerCollision(e, playerVehicle, adasSystem, isNight);
        return;
      }
    }

    // 安全化解判定 (玩家已驶过障碍物后方 25m)
    if (distanceToHazard < -25) {
      e.stage = 'RESOLVED';
      this.resolvedCount++;
      this.cleanupEvent(e);
      if (this.onEventUpdateCallback) this.onEventUpdateCallback(e);
      this.activeEvent = null;
    } else {
      if (this.onEventUpdateCallback) this.onEventUpdateCallback(e);
    }
  }

  triggerCollision(event, playerVehicle, adasSystem, isNight) {
    event.stage = 'COLLIDED';
    this.audio.playCrashSound();

    // 事故归因分析 (R8 因果判定)
    const analysisReport = this.analyzeAccidentCausality(event, playerVehicle, adasSystem, isNight);

    if (this.onCrashCallback) {
      this.onCrashCallback(analysisReport);
    }
    this.cleanupEvent(event);
    this.activeEvent = null;
  }

  analyzeAccidentCausality(event, playerVehicle, adasSystem, isNight) {
    const speedKmh = Math.round(playerVehicle.speed * 3.6);
    const headway = adasSystem.headwayTime;
    const isManual = !adasSystem.isActive;
    const isFlawless = adasSystem.flawlessMode;

    let causeKey = 'accidentCauseHeadway';
    let adviceKey = 'accidentAdviceHeadway';
    let extraDelay = 0;

    if (isManual) {
      causeKey = 'accidentCauseManualError';
      adviceKey = 'accidentAdviceHeadway';
    } else if (isNight && !playerVehicle.headlightsOn) {
      causeKey = 'accidentCauseUnlitNight';
      adviceKey = 'accidentAdviceNight';
      extraDelay = 380;
    } else if (adasSystem.sensitivity === 'low') {
      causeKey = 'accidentCauseSensitivity';
      adviceKey = 'accidentAdviceSensitivity';
      extraDelay = isNight ? 420 : 280;
    } else if (adasSystem.style === 'aggressive') {
      causeKey = 'accidentCauseAggressive';
      adviceKey = 'accidentAdviceHeadway';
    } else if (headway < 1.2 && speedKmh > 75) {
      causeKey = 'accidentCauseHeadway';
      adviceKey = 'accidentAdviceHeadway';
      extraDelay = 160;
    }

    return {
      speed: speedKmh,
      headway: headway,
      delayMs: extraDelay || 160,
      causeText: t(causeKey, { time: headway, speed: speedKmh, delay: extraDelay || 160 }),
      adviceText: t(adviceKey),
      eventType: event.type
    };
  }

  cleanupEvent(event) {
    event.hazardObjects.forEach(obj => {
      this.hazardGroup.remove(obj);
    });
    event.hazardObjects = [];
  }

  reset() {
    if (this.activeEvent) {
      this.cleanupEvent(this.activeEvent);
      this.activeEvent = null;
    }
    this.timer = 0;
    this.nextSpawnTime = 10;
    this.resolvedCount = 0;
    this.totalEvents = 0;
  }
}
