/**
 * traffic.js - NPC 交通流体系与车辆 AI
 * 满足需求 R3, R6：4 种程序化车型（轿车、SUV、货车、大巴）、跟驰与自主变道 AI、夜间灯光与暗夜黑车、无碰撞穿模
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class TrafficManager {
  constructor(scene, world, quality = 'high') {
    this.scene = scene;
    this.world = world;
    this.quality = quality;
    this.vehicles = [];
    this.maxNpcCount = 18;

    // 共享材质池
    this.initMaterials();
    // 预热几何体
    this.initGeometries();
  }

  initMaterials() {
    this.palette = [
      0xf8fafc, 0x1e293b, 0x94a3b8, 0xdc2626,
      0x2563eb, 0x059669, 0xd97706, 0x7c3aed
    ];
    this.bodyMaterials = this.palette.map(color =>
      new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.7,
        roughness: 0.3
      })
    );
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.8
    });
    this.wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    this.headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.headlightOffMat = new THREE.MeshStandardMaterial({ color: 0x64748b });
    this.taillightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.blinkerMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  }

  initGeometries() {
    this.wheelGeom = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
    this.wheelGeom.rotateZ(Math.PI / 2);
    this.largeWheelGeom = new THREE.CylinderGeometry(0.52, 0.52, 0.32, 12);
    this.largeWheelGeom.rotateZ(Math.PI / 2);
  }

  createNpcVehicle(type, isUnlitAtNight = false) {
    const group = new THREE.Group();
    const bodyMat = this.bodyMaterials[Math.floor(Math.random() * this.bodyMaterials.length)];
    let width = 1.9, height = 1.45, length = 4.5;
    let wheels = [];
    let headlights = [];
    let taillights = [];

    if (type === 'sedan') {
      // 1. 轿车
      width = 1.85; height = 1.4; length = 4.5;
      const lowerGeom = new THREE.BoxGeometry(width, 0.5, length);
      const lower = new THREE.Mesh(lowerGeom, bodyMat);
      lower.position.y = 0.55;
      lower.castShadow = (this.quality !== 'low');
      group.add(lower);

      const cabinGeom = new THREE.BoxGeometry(1.65, 0.55, 2.3);
      const cabin = new THREE.Mesh(cabinGeom, this.glassMat);
      cabin.position.set(0, 1.05, 0.1);
      group.add(cabin);

      // 车轮
      [[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(this.wheelGeom, this.wheelMat);
        w.position.set(wx, 0.34, wz);
        group.add(w);
        wheels.push(w);
      });
    } else if (type === 'suv') {
      // 2. SUV (车身更高、配车顶行李架)
      width = 1.95; height = 1.7; length = 4.8;
      const lowerGeom = new THREE.BoxGeometry(width, 0.65, length);
      const lower = new THREE.Mesh(lowerGeom, bodyMat);
      lower.position.y = 0.65;
      lower.castShadow = (this.quality !== 'low');
      group.add(lower);

      const cabinGeom = new THREE.BoxGeometry(1.75, 0.68, 2.7);
      const cabin = new THREE.Mesh(cabinGeom, this.glassMat);
      cabin.position.set(0, 1.25, 0.2);
      group.add(cabin);

      // 行李架
      const rackGeom = new THREE.BoxGeometry(1.4, 0.05, 2.2);
      const rack = new THREE.Mesh(rackGeom, this.wheelMat);
      rack.position.set(0, 1.62, 0.2);
      group.add(rack);

      [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(this.wheelGeom, this.wheelMat);
        w.position.set(wx, 0.36, wz);
        group.add(w);
        wheels.push(w);
      });
    } else if (type === 'truck') {
      // 3. 重型货车 (驾驶车头 + 封闭集装箱货斗)
      width = 2.4; height = 3.2; length = 9.5;
      // 车头
      const cabGeom = new THREE.BoxGeometry(width, 1.8, 2.2);
      const cab = new THREE.Mesh(cabGeom, bodyMat);
      cab.position.set(0, 1.4, -3.2);
      cab.castShadow = (this.quality !== 'low');
      group.add(cab);

      // 货箱
      const boxMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.5, roughness: 0.5 });
      const boxGeom = new THREE.BoxGeometry(width + 0.1, 2.3, 6.8);
      const box = new THREE.Mesh(boxGeom, boxMat);
      box.position.set(0, 1.8, 1.2);
      box.castShadow = (this.quality !== 'low');
      group.add(box);

      // 6 个大车轮
      [
        [-1.15, -3.2], [1.15, -3.2],
        [-1.15, 1.8], [1.15, 1.8],
        [-1.15, 3.4], [1.15, 3.4]
      ].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(this.largeWheelGeom, this.wheelMat);
        w.position.set(wx, 0.52, wz);
        group.add(w);
        wheels.push(w);
      });
    } else if (type === 'bus') {
      // 4. 大型客车 / 大巴
      width = 2.45; height = 3.0; length = 10.8;
      const busGeom = new THREE.BoxGeometry(width, 2.2, length);
      const bus = new THREE.Mesh(busGeom, bodyMat);
      bus.position.set(0, 1.5, 0);
      bus.castShadow = (this.quality !== 'low');
      group.add(bus);

      // 侧向整排车窗带
      const windowStripGeom = new THREE.BoxGeometry(width + 0.05, 0.75, length - 1.2);
      const windowStrip = new THREE.Mesh(windowStripGeom, this.glassMat);
      windowStrip.position.set(0, 1.8, 0.2);
      group.add(windowStrip);

      [
        [-1.15, -3.6], [1.15, -3.6],
        [-1.15, 3.2], [1.15, 3.2],
        [-1.15, 4.4], [1.15, 4.4]
      ].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(this.largeWheelGeom, this.wheelMat);
        w.position.set(wx, 0.52, wz);
        group.add(w);
        wheels.push(w);
      });
    }

    // 车灯组
    const hlGeom = new THREE.BoxGeometry(0.3, 0.12, 0.06);
    const hlLeft = new THREE.Mesh(hlGeom, this.headlightMat);
    hlLeft.position.set(-width * 0.38, height * 0.42, -length / 2 - 0.02);
    group.add(hlLeft);
    const hlRight = hlLeft.clone();
    hlRight.position.x = width * 0.38;
    group.add(hlRight);
    headlights.push(hlLeft, hlRight);

    const tlGeom = new THREE.BoxGeometry(0.32, 0.12, 0.06);
    const tlLeft = new THREE.Mesh(tlGeom, this.taillightMat);
    tlLeft.position.set(-width * 0.38, height * 0.45, length / 2 + 0.02);
    group.add(tlLeft);
    const tlRight = tlLeft.clone();
    tlRight.position.x = width * 0.38;
    group.add(tlRight);
    taillights.push(tlLeft, tlRight);

    this.scene.add(group);

    const vObj = {
      group,
      type,
      width,
      height,
      length,
      wheels,
      headlights,
      taillights,
      isUnlitAtNight,
      speed: 0,
      targetSpeed: 0,
      lane: 1,
      targetLane: 1,
      laneChangeProgress: 1.0,
      laneChangeStartX: 0,
      laneChangeTargetX: 0,
      active: true,
      blinkerState: 0,
      blinkerLit: false
    };

    vObj.getHitbox = () => {
      const hw = width * 0.5;
      const hl = length * 0.5;
      const pos = group.position;
      return {
        minX: pos.x - hw,
        maxX: pos.x + hw,
        minZ: pos.z - hl,
        maxZ: pos.z + hl,
        x: pos.x,
        z: pos.z,
        width,
        length
      };
    };

    return vObj;
  }

  spawnInitialTraffic(playerZ) {
    const types = ['sedan', 'sedan', 'suv', 'suv', 'truck', 'bus'];
    for (let i = 0; i < 14; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      // 约 10% 概率生成暗夜无灯车（故障车设定，增加难度）
      const isUnlit = Math.random() < 0.12;
      const npc = this.createNpcVehicle(type, isUnlit);

      npc.lane = Math.floor(Math.random() * CONFIG.world.laneCount);
      npc.targetLane = npc.lane;
      const targetSpeedKmh = 60 + Math.random() * 45; // 60~105 km/h
      npc.speed = targetSpeedKmh / 3.6;
      npc.targetSpeed = npc.speed;

      // 沿路分散分布在前向 25m 到 350m
      const spawnZ = playerZ - 30 - i * 26 - Math.random() * 15;
      npc.group.position.set(this.world.getLaneX(npc.lane), 0, spawnZ);

      this.vehicles.push(npc);
    }
  }

  update(delta, playerVehicle, isNight = false) {
    const playerZ = playerVehicle.position.z;

    for (let i = 0; i < this.vehicles.length; i++) {
      const npc = this.vehicles[i];
      if (!npc.active) continue;

      // 1. 回收过远车辆并前向重置
      if (npc.group.position.z > playerZ + 80) {
        // 落后玩家过远，重置到前方
        this.recycleVehicle(npc, playerZ - (200 + Math.random() * 180));
      } else if (npc.group.position.z < playerZ - 480) {
        // 超出视距，重置到较近前方
        this.recycleVehicle(npc, playerZ - (150 + Math.random() * 120));
      }

      // 2. 车流跟随与防追尾 AI (IDM 模型简化版)
      this.updateNpcBehavior(delta, npc, playerVehicle);

      // 3. 沿 -Z 方向行进
      npc.group.position.z -= npc.speed * delta;

      // 4. 平滑变道插值
      if (npc.laneChangeProgress < 1.0) {
        npc.laneChangeProgress += delta * 0.7; // ~1.4 秒完成变道
        const t = Math.min(1.0, npc.laneChangeProgress);
        const smoothT = t * t * (3 - 2 * t);
        npc.group.position.x = THREE.MathUtils.lerp(npc.laneChangeStartX, npc.laneChangeTargetX, smoothT);
        if (t >= 1.0) {
          npc.lane = npc.targetLane;
          npc.blinkerState = 0;
        }
      }

      // 5. 车轮滚动视觉
      const rollDelta = (npc.speed * delta) / (npc.type === 'truck' || npc.type === 'bus' ? 0.52 : 0.34);
      npc.wheels.forEach(w => w.rotation.x -= rollDelta);

      // 6. 夜间车灯控制
      const lightsOn = isNight && !npc.isUnlitAtNight;
      npc.headlights.forEach(hl => {
        hl.material = lightsOn ? this.headlightMat : this.headlightOffMat;
      });
    }
  }

  updateNpcBehavior(delta, npc, playerVehicle) {
    // 寻找同车道正前方最近的车辆（包括其他 NPC 与玩家车）
    let leadDist = 999;
    let leadSpeed = 0;

    // 检测其他 NPC
    for (const other of this.vehicles) {
      if (other === npc || !other.active) continue;
      if (other.targetLane === npc.targetLane) {
        const dz = npc.group.position.z - other.group.position.z; // 前方车 dz > 0
        if (dz > 0 && dz < leadDist) {
          leadDist = dz;
          leadSpeed = other.speed;
        }
      }
    }

    // 检测玩家车辆 (如果玩家在相同车道且在前方)
    const pLane = Math.round((playerVehicle.position.x - this.world.getLaneX(0)) / CONFIG.world.laneWidth);
    if (pLane === npc.targetLane) {
      const pz = npc.group.position.z - playerVehicle.position.z;
      if (pz > 0 && pz < leadDist) {
        leadDist = pz;
        leadSpeed = playerVehicle.speed;
      }
    }

    // 跟驰决策
    const safeGap = 15 + npc.speed * 1.5;
    if (leadDist < safeGap) {
      // 减速跟车
      npc.speed = THREE.MathUtils.lerp(npc.speed, Math.max(0, leadSpeed * 0.95), delta * 2.2);

      // 尝试自主变道超车 (若变道未在进行中)
      if (npc.laneChangeProgress >= 1.0 && Math.random() < 0.015) {
        this.attemptNpcLaneChange(npc);
      }
    } else {
      // 恢复巡航目标车速
      npc.speed = THREE.MathUtils.lerp(npc.speed, npc.targetSpeed, delta * 1.0);
    }
  }

  attemptNpcLaneChange(npc) {
    const candidateLanes = [];
    if (npc.lane > 0) candidateLanes.push(npc.lane - 1);
    if (npc.lane < CONFIG.world.laneCount - 1) candidateLanes.push(npc.lane + 1);

    for (const cand of candidateLanes) {
      // 检查目标车道是否有足够前后间隙
      let isClear = true;
      for (const other of this.vehicles) {
        if (other === npc) continue;
        if (other.lane === cand || other.targetLane === cand) {
          const gap = Math.abs(other.group.position.z - npc.group.position.z);
          if (gap < 22) {
            isClear = false;
            break;
          }
        }
      }
      if (isClear) {
        npc.targetLane = cand;
        npc.laneChangeProgress = 0;
        npc.laneChangeStartX = npc.group.position.x;
        npc.laneChangeTargetX = this.world.getLaneX(cand);
        npc.blinkerState = cand > npc.lane ? 1 : -1;
        break;
      }
    }
  }

  recycleVehicle(npc, newZ) {
    npc.lane = Math.floor(Math.random() * CONFIG.world.laneCount);
    npc.targetLane = npc.lane;
    npc.laneChangeProgress = 1.0;
    npc.group.position.set(this.world.getLaneX(npc.lane), 0, newZ);
    npc.speed = (65 + Math.random() * 40) / 3.6;
    npc.targetSpeed = npc.speed;
    npc.isUnlitAtNight = Math.random() < 0.12;
  }

  getSurroundingVehicles(playerVehicle, maxRadius = 150) {
    // 为 ADAS 传感器与雷达提供周边态势数据
    const results = [];
    const pPos = playerVehicle.position;

    for (const v of this.vehicles) {
      if (!v.active) continue;
      const vPos = v.group.position;
      const dx = vPos.x - pPos.x;
      const dz = vPos.z - pPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= maxRadius) {
        results.push({
          vehicle: v,
          dx: dx,
          dz: dz, // dz < 0 表示在玩家车前方
          dist: dist,
          speed: v.speed,
          lane: v.targetLane,
          isUnlit: v.isUnlitAtNight
        });
      }
    }
    return results;
  }

  reset(playerZ) {
    this.vehicles.forEach(v => {
      this.scene.remove(v.group);
    });
    this.vehicles = [];
    this.spawnInitialTraffic(playerZ);
  }
}
