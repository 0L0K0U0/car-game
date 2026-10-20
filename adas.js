/**
 * adas.js - 智能驾驶系统 (状态机 + PID 控制)
 * 满足需求 R4, R5, R8, R9：ACC 自适应巡航、LKA 车道居中、AEB 紧急制动、自动变道避障、感知噪声与延迟、接管判定与无失误模式
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class AdasSystem {
  constructor(world, audio) {
    this.world = world;
    this.audio = audio;

    // 状态机状态: 'STANDBY' | 'ACTIVE' | 'AEB_BRAKING' | 'TAKEOVER'
    this.state = 'STANDBY';

    // 用户可调参数
    this.cruiseSpeed = CONFIG.adas.defaultCruiseSpeed; // km/h (130)
    this.headwayTime = CONFIG.adas.defaultHeadwayTime; // 秒 (3.0)
    this.headwayLevel = CONFIG.adas.defaultHeadwayLevel || 5; // 1~5 档 (默认开到最高 5 档)
    this.style = CONFIG.adas.defaultStyle; // 'conservative' | 'standard' | 'aggressive'
    this.sensitivity = CONFIG.adas.defaultSensitivity; // 'low' | 'medium' | 'high'
    this.aebEnabled = CONFIG.adas.aebEnabled;
    this.lkaStrength = CONFIG.adas.lkaStrength;
    this.autoLaneChange = CONFIG.adas.autoLaneChange;
    this.cutInTolerance = CONFIG.adas.cutInTolerance;
    this.flawlessMode = CONFIG.adas.flawlessMode;

    // 传感器感知追踪缓存 (实现真实延迟队列)
    this.perceptionQueue = [];
    this.currentTarget = null;
    this.targetDistance = 40;
    this.actualDistance = null;
    this.ttc = 999;
    this.isFcwActive = false;
    this.isAebActive = false;

    // PID 控制器状态
    this.speedErrorIntegral = 0;
    this.lastSpeedError = 0;
    this.lateralErrorIntegral = 0;
    this.lastLateralError = 0;

    // 自动变道与主动避障闪避状态
    this.isChangingLane = false;
    this.isEvasiveDodge = false;
    this.targetLane = 1;
    this.laneChangeCooldown = 0;

    // 接管事件回调
    this.onTakeoverCallback = null;

    // 3D 空间前车 AR 识别包围框 (需求 R5)
    const arGeom = new THREE.BoxGeometry(2.3, 1.7, 4.8);
    this.arMat = new THREE.MeshBasicMaterial({
      color: 0x00f076,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    this.arBox = new THREE.Mesh(arGeom, this.arMat);
    this.arBox.visible = false;
    this.world.scene.add(this.arBox);
  }

  setCruiseSpeed(speedKmh) {
    this.cruiseSpeed = THREE.MathUtils.clamp(
      speedKmh,
      CONFIG.adas.minCruiseSpeed,
      CONFIG.adas.maxCruiseSpeed
    );
  }

  setHeadwayLevel(level) {
    this.headwayLevel = THREE.MathUtils.clamp(level, 1, 5);
    this.headwayTime = CONFIG.adas.headwayLevels[this.headwayLevel - 1];
  }

  setFlawlessMode(enabled) {
    this.flawlessMode = enabled;
  }

  enable() {
    this.state = 'ACTIVE';
    this.speedErrorIntegral = 0;
    this.lateralErrorIntegral = 0;
    this.audio.playAdasChime(true);
  }

  disable(isTakeover = false) {
    this.state = isTakeover ? 'TAKEOVER' : 'STANDBY';
    this.isAebActive = false;
    this.isFcwActive = false;
    if (isTakeover) {
      this.audio.playTakeoverAlert();
      if (this.onTakeoverCallback) this.onTakeoverCallback();
    } else {
      this.audio.playAdasChime(false);
    }
  }

  toggle() {
    if (this.state === 'ACTIVE' || this.state === 'AEB_BRAKING') {
      this.disable(false);
      return false;
    } else {
      this.enable();
      return true;
    }
  }

  get isActive() {
    return this.state === 'ACTIVE' || this.state === 'AEB_BRAKING';
  }

  // 核心计算与控制指令输出
  computeControl(delta, vehicle, trafficManager, eventManager, isNight = false, rawInput = {}) {
    // 1. 驾驶员接管检测 (踩刹车或大幅转向触发平滑退出)
    if (this.isActive && !this.flawlessMode) {
      if ((rawInput.brake && rawInput.brake > 0.15) || (rawInput.steer && Math.abs(rawInput.steer) > 0.35)) {
        this.disable(true);
        return { throttle: rawInput.throttle || 0, brake: rawInput.brake || 0, steer: rawInput.steer || 0 };
      }
    }

    if (!this.isActive) {
      return { throttle: rawInput.throttle || 0, brake: rawInput.brake || 0, steer: rawInput.steer || 0 };
    }

    // 2. 传感器感知过滤 (融合交通车流与突发事件障碍物)
    const perceivedLead = this.perceiveEnvironment(delta, vehicle, trafficManager, eventManager, isNight);

    // 3. 计算 TTC 与跟车指标
    const vSpeed = vehicle.speed;
    const cruiseSpeedMs = this.cruiseSpeed / 3.6;
    let targetAcc = 0;
    let targetBrake = 0;
    let targetSteer = 0;

    // 目标跟车安全间距 = 停止安全裕量 (5m) + 时距 * 车速
    this.targetDistance = 5.0 + this.headwayTime * vSpeed;

    if (perceivedLead) {
      this.actualDistance = perceivedLead.distance;
      const relSpeed = vSpeed - perceivedLead.speed; // 靠近速度 > 0

      // 计算 TTC (碰撞时间)
      if (relSpeed > 0.2 && this.actualDistance > 0.1) {
        this.ttc = this.actualDistance / relSpeed;
      } else {
        this.ttc = 999;
      }

      // 4. 主动紧急避障闪避 (AES / Evasive Dodge) 决策:
      // 当满足以下任一情况，且变道避障开启（或完美模式）：
      // - 前方是路面难题/静态障碍物 (事故车/木箱/轮胎/故障车/行人)
      // - 前方慢车或急刹停滞车 (距离 < 70m 且 相对速度 > 2.5m/s 或 前车车速极低 < 5.0m/s)
      // - 碰撞时间危险 (TTC < 4.0s)
      const isHazardOrSlow = (perceivedLead.type === 'hazard') ||
                             (perceivedLead.speed < 4.0) ||
                             (perceivedLead.speed < cruiseSpeedMs - 3.5);

      if (this.autoLaneChange && !this.isChangingLane && this.laneChangeCooldown <= 0) {
        if (isHazardOrSlow && (this.actualDistance < 70 || this.ttc < 4.0)) {
          this.checkAndExecuteLaneChange(vehicle, trafficManager, eventManager);
        }
      }

      // 5. AEB 紧急制动判定与安全减速
      const aebThreshold = this.flawlessMode ? 2.0 : CONFIG.adas.aebTtcThreshold;
      const isExtremeDanger = (this.ttc < aebThreshold || this.actualDistance < 6.5);

      if (this.aebEnabled && isExtremeDanger) {
        this.state = 'AEB_BRAKING';
        this.isAebActive = true;
        this.audio.playFcwAlert();
        // 如果正在变道闪避中，施加制动辅助减速安全切线；若无法避让或近距直面障碍，全力刹停
        targetBrake = this.isChangingLane ? 0.7 : 1.0;
        targetAcc = 0;
      } else {
        if (this.state === 'AEB_BRAKING') this.state = 'ACTIVE';
        this.isAebActive = false;

        // 前向碰撞预警 (FCW)
        if (this.ttc < 2.8) {
          if (!this.isFcwActive) {
            this.audio.playFcwAlert();
            this.isFcwActive = true;
          }
        } else {
          this.isFcwActive = false;
        }

        // ACC 纵向跟驰 PID 控制
        const distError = this.actualDistance - this.targetDistance;
        let kp = 0.55, kd = 0.45;
        if (this.style === 'conservative') { kp = 0.4; kd = 0.55; }
        else if (this.style === 'aggressive') { kp = 0.8; kd = 0.3; }

        const desiredSpeed = THREE.MathUtils.clamp(
          perceivedLead.speed + distError * kp - relSpeed * kd,
          0,
          cruiseSpeedMs
        );

        const speedErr = desiredSpeed - vSpeed;
        this.speedErrorIntegral += speedErr * delta;
        this.speedErrorIntegral = THREE.MathUtils.clamp(this.speedErrorIntegral, -4, 4);

        if (speedErr >= 0) {
          targetAcc = THREE.MathUtils.clamp(speedErr * 0.4 + this.speedErrorIntegral * 0.08, 0.1, 1.0);
          targetBrake = 0;
        } else {
          targetAcc = 0;
          targetBrake = THREE.MathUtils.clamp(-speedErr * 0.35, 0.1, 0.95);
        }
      }
    } else {
      // 前方无障碍：巡航定速高响应 PID (主动驱动车辆加速至巡航车速)
      this.actualDistance = null;
      this.ttc = 999;
      this.isFcwActive = false;
      this.isAebActive = false;

      const speedErr = cruiseSpeedMs - vSpeed;
      this.speedErrorIntegral += speedErr * delta;
      this.speedErrorIntegral = THREE.MathUtils.clamp(this.speedErrorIntegral, -4, 4);

      if (speedErr > 0.1) {
        targetAcc = THREE.MathUtils.clamp(speedErr * 0.35 + 0.15 + this.speedErrorIntegral * 0.08, 0.15, 1.0);
        targetBrake = 0;
      } else if (speedErr < -0.5) {
        targetAcc = 0;
        targetBrake = THREE.MathUtils.clamp(-speedErr * 0.3, 0.05, 0.8);
      } else {
        targetAcc = 0.08;
        targetBrake = 0;
      }
    }

    // 6. LKA 车道保持居中 / 紧急闪避转向控制
    targetSteer = this.computeLkaSteer(delta, vehicle);

    if (this.laneChangeCooldown > 0) {
      this.laneChangeCooldown -= delta;
    }

    // 7. 更新前车 / 障碍物 3D AR 识别框
    this.updateArBox(perceivedLead);

    return { throttle: targetAcc, brake: targetBrake, steer: targetSteer };
  }

  perceiveEnvironment(delta, vehicle, trafficManager, eventManager, isNight) {
    if (this.flawlessMode) {
      // 「无失误模式」：理想感知，0 延迟、0 噪声、超长 250m 视距
      return this.findGroundTruthLeadVehicle(vehicle, trafficManager, eventManager, 250);
    }

    const P = CONFIG.adas.perception;
    let delay = P.midSensitivityLag;
    let maxRange = 130;
    if (this.sensitivity === 'low') {
      delay = P.lowSensitivityLag;
      maxRange = 80;
    } else if (this.sensitivity === 'high') {
      delay = P.highSensitivityLag;
      maxRange = 180;
    }

    if (isNight) {
      delay += P.nightLagPenalty;
      if (!vehicle.headlightsOn) {
        maxRange *= 0.45;
      } else {
        maxRange *= 0.8;
      }
    }

    const rawTarget = this.findGroundTruthLeadVehicle(vehicle, trafficManager, eventManager, maxRange);
    if (rawTarget && rawTarget.isUnlit && isNight) {
      delay += P.unlitCarExtraLag;
    }

    const timestamp = performance.now() / 1000;
    this.perceptionQueue.push({
      time: timestamp,
      target: rawTarget
        ? {
            distance: rawTarget.distance,
            speed: rawTarget.speed,
            lane: rawTarget.lane,
            vehicle: rawTarget.vehicle,
            ref: rawTarget.ref,
            type: rawTarget.type
          }
        : null
    });

    while (this.perceptionQueue.length > 0 && timestamp - this.perceptionQueue[0].time >= delay) {
      this.currentTarget = this.perceptionQueue.shift().target;
    }

    if (this.currentTarget) {
      const posNoise = (Math.random() + Math.random() - 1.0) * P.noiseStdDevPos;
      const speedNoise = (Math.random() + Math.random() - 1.0) * P.noiseStdDevSpeed;
      return {
        distance: Math.max(0.1, this.currentTarget.distance + posNoise),
        speed: Math.max(0, this.currentTarget.speed + speedNoise),
        lane: this.currentTarget.lane,
        vehicle: this.currentTarget.vehicle,
        ref: this.currentTarget.ref,
        type: this.currentTarget.type
      };
    }
    return null;
  }

  findGroundTruthLeadVehicle(vehicle, trafficManager, eventManager, maxDist) {
    let closestLead = null;
    let minDist = maxDist;
    const pX = vehicle.position.x;
    const pZ = vehicle.position.z;
    const halfLane = CONFIG.world.laneWidth * 0.55;

    // 1. 周边 NPC 车流探测
    if (trafficManager && trafficManager.vehicles) {
      const surrounding = trafficManager.getSurroundingVehicles(vehicle, maxDist);
      for (const item of surrounding) {
        if (item.dz < -0.5 && Math.abs(item.dx) < halfLane) {
          const dist = Math.abs(item.dz);
          if (dist < minDist) {
            minDist = dist;
            closestLead = {
              distance: dist,
              speed: item.speed,
              lane: item.lane,
              isUnlit: item.isUnlit,
              vehicle: item.vehicle,
              ref: item.vehicle.group,
              type: 'vehicle'
            };
          }
        }
      }
    }

    // 2. 突发事件障碍物探测 (多车事故残骸、散落箱、轮胎、故障车、行人)
    if (eventManager && eventManager.activeEvent) {
      const e = eventManager.activeEvent;
      for (const obj of e.hazardObjects) {
        if (!obj || !obj.position) continue;
        const dx = obj.position.x - pX;
        const dz = obj.position.z - pZ;
        if (dz < -0.5 && Math.abs(dx) < halfLane) {
          const dist = Math.abs(dz);
          if (dist < minDist) {
            minDist = dist;
            closestLead = {
              distance: dist,
              speed: e.type === 'pedestrian_crossing' ? 1.0 : 0, // 静止障碍物速度为 0
              lane: Math.round((obj.position.x - this.world.getLaneX(0)) / CONFIG.world.laneWidth),
              isUnlit: e.type === 'broken_vehicle',
              vehicle: { group: obj },
              ref: obj,
              type: 'hazard'
            };
          }
        }
      }
    }

    return closestLead;
  }

  computeLkaSteer(delta, vehicle) {
    const currentLaneIdx = Math.round((vehicle.position.x - this.world.getLaneX(0)) / CONFIG.world.laneWidth);
    const targetLaneIdx = this.isChangingLane ? this.targetLane : THREE.MathUtils.clamp(currentLaneIdx, 0, CONFIG.world.laneCount - 1);
    const targetCenter = this.world.getLaneX(targetLaneIdx);

    const lateralErr = targetCenter - vehicle.position.x;
    if (Math.abs(lateralErr) < 0.35 && this.isChangingLane) {
      this.isChangingLane = false;
      this.isEvasiveDodge = false;
      this.laneChangeCooldown = 2.0;
      vehicle.setBlinker(0);
    }

    // 主动紧急闪避模式时，提升转向增益与切线速度
    const isDodge = this.isEvasiveDodge;
    const lookaheadSpeed = isDodge ? Math.max(3.8, vehicle.speed * 0.7) : Math.max(6.0, vehicle.speed * 1.2);
    const targetYaw = -Math.atan2(lateralErr, lookaheadSpeed);
    const yawError = targetYaw - vehicle.yaw;

    const lateralDeriv = (lateralErr - this.lastLateralError) / Math.max(0.001, delta);
    this.lastLateralError = lateralErr;

    const kp = (isDodge ? 2.6 : 1.8) * this.lkaStrength;
    const kd = 0.2 * this.lkaStrength;
    const steerOut = (yawError * kp) - (lateralDeriv * kd * 0.05);

    const maxSteerLimit = isDodge ? 0.85 : 0.65;
    return THREE.MathUtils.clamp(steerOut, -maxSteerLimit, maxSteerLimit);
  }

  updateArBox(perceivedLead) {
    if (!this.arBox) return;
    if (this.isActive && perceivedLead && perceivedLead.ref) {
      this.arBox.position.copy(perceivedLead.ref.position);
      this.arBox.position.y += 0.8;
      this.arBox.visible = true;
      if (this.ttc < 1.6 || this.actualDistance < 12) {
        this.arMat.color.setHex(0xff3366); // 危险红色
      } else if (this.ttc < 3.2 || this.actualDistance < 35) {
        this.arMat.color.setHex(0xffb703); // 预警黄色
      } else {
        this.arMat.color.setHex(0x00f076); // 安全绿色
      }
    } else {
      this.arBox.visible = false;
    }
  }

  checkAndExecuteLaneChange(vehicle, trafficManager, eventManager) {
    const currentLane = Math.round((vehicle.position.x - this.world.getLaneX(0)) / CONFIG.world.laneWidth);
    const pZ = vehicle.position.z;

    // 3 车道闪避候选优先级：
    // 若在中央车道 (1)，优先向左闪避 (0)，其次向右闪避 (2)
    // 若在左侧车道 (0)，向中车道闪避 (1)
    // 若在右侧车道 (2)，向中车道闪避 (1)
    const candidates = [];
    if (currentLane === 1) {
      candidates.push(0, 2);
    } else if (currentLane === 0) {
      candidates.push(1);
    } else if (currentLane === 2) {
      candidates.push(1);
    }

    for (const cand of candidates) {
      const candX = this.world.getLaneX(cand);
      let isSafe = true;

      // 1. 检查目标车道是否有 NPC 车辆阻挡 (前后间隙)
      if (trafficManager && trafficManager.vehicles) {
        for (const item of trafficManager.vehicles) {
          if (!item.active) continue;
          const nPos = item.group.position;
          if (Math.abs(nPos.x - candX) < CONFIG.world.laneWidth * 0.65) {
            const dz = nPos.z - pZ;
            // 目标车道前向 18m 内或后向 12m 内有车则不可变入
            if (dz < 0 && Math.abs(dz) < 18) {
              isSafe = false;
              break;
            }
            if (dz > 0 && Math.abs(dz) < 12) {
              isSafe = false;
              break;
            }
          }
        }
      }

      // 2. 检查目标车道是否有事件障碍物阻挡
      if (isSafe && eventManager && eventManager.activeEvent) {
        for (const obj of eventManager.activeEvent.hazardObjects) {
          if (!obj || !obj.position) continue;
          if (Math.abs(obj.position.x - candX) < CONFIG.world.laneWidth * 0.65) {
            const dz = obj.position.z - pZ;
            if (dz < 0 && Math.abs(dz) < 35) {
              isSafe = false;
              break;
            }
          }
        }
      }

      if (isSafe) {
        // 发现安全车道，立即执行果断的主动避障闪避！
        this.isChangingLane = true;
        this.isEvasiveDodge = true;
        this.targetLane = cand;
        this.laneChangeCooldown = 0.5;
        vehicle.setBlinker(cand > currentLane ? 1 : -1);
        this.audio.playBlinker(true);
        return true;
      }
    }
    return false;
  }

  reset() {
    this.state = 'STANDBY';
    this.perceptionQueue = [];
    this.currentTarget = null;
    this.actualDistance = null;
    this.ttc = 999;
    this.isFcwActive = false;
    this.isAebActive = false;
    this.isChangingLane = false;
    this.isEvasiveDodge = false;
    this.targetLane = 1;
    this.speedErrorIntegral = 0;
    this.lateralErrorIntegral = 0;
    if (this.arBox) this.arBox.visible = false;
  }
}

