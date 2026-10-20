/**
 * camera.js - 视角管理系统
 * 满足需求 R2：第一人称驾驶舱视角与第三人称跟随视角平滑过渡、速度拉远动态 FOV、防穿模外壳隐藏控制
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class CameraManager {
  constructor(camera) {
    this.camera = camera;
    this.currentMode = 'tpv'; // 'fpv' (第一人称) | 'tpv' (第三人称)
    this.targetMode = 'tpv';

    // 过渡状态
    this.isTransitioning = false;
    this.transitionProgress = 1.0;
    this.transitionDuration = CONFIG.camera.transitionDuration;

    // 起始与目标相机位姿
    this.fromPos = new THREE.Vector3();
    this.toPos = new THREE.Vector3();
    this.fromLook = new THREE.Vector3();
    this.toLook = new THREE.Vector3();

    // 平滑跟随当前相机位置与注视点
    this.currentCameraPos = new THREE.Vector3(0, 5, 10);
    this.currentLookAt = new THREE.Vector3(0, 1, 0);

    // 动态速度 FOV 缓冲
    this.baseFov = CONFIG.camera.fov;
    this.targetFov = CONFIG.camera.fov;

    // 视角切换监听器
    this.onViewChangeCallbacks = new Set();
  }

  onViewChange(callback) {
    this.onViewChangeCallbacks.add(callback);
    return () => this.onViewChangeCallbacks.delete(callback);
  }

  toggleView() {
    this.setViewMode(this.targetMode === 'tpv' ? 'fpv' : 'tpv');
  }

  setViewMode(mode) {
    if (mode === this.targetMode) return;
    this.targetMode = mode;
    this.isTransitioning = true;
    this.transitionProgress = 0;

    // 记录起点
    this.fromPos.copy(this.camera.position);
    this.fromLook.copy(this.currentLookAt);

    for (const cb of this.onViewChangeCallbacks) {
      try {
        cb(mode);
      } catch (e) {
        console.error('onViewChange error:', e);
      }
    }
  }

  update(delta, vehicle) {
    if (!vehicle || !vehicle.mesh) return;

    const vPos = vehicle.mesh.position;
    const vRot = vehicle.mesh.rotation.y;
    const speedRatio = Math.min(1.0, vehicle.speed / CONFIG.physics.maxForwardSpeed);

    // 计算第一人称目标位姿 (驾驶舱驾驶员眼部)
    const fpvLocalOffset = new THREE.Vector3(
      CONFIG.camera.fpvOffset.x,
      CONFIG.camera.fpvOffset.y,
      CONFIG.camera.fpvOffset.z
    );
    fpvLocalOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), vRot);
    const fpvTargetPos = vPos.clone().add(fpvLocalOffset);

    // 第一人称注视点 (车头正前方延伸，带轻微转向偏航)
    const fpvLocalLook = new THREE.Vector3(
      CONFIG.camera.fpvLookOffset.x + vehicle.steerAngle * 1.5,
      CONFIG.camera.fpvLookOffset.y,
      -CONFIG.camera.fpvLookOffset.z
    );
    fpvLocalLook.applyAxisAngle(new THREE.Vector3(0, 1, 0), vRot);
    const fpvTargetLook = vPos.clone().add(fpvLocalLook);

    // 计算第三人称目标位姿 (平滑追尾，随速拉远)
    const tpvDist = CONFIG.camera.tpvBaseDistance + speedRatio * 3.8;
    const tpvHeight = CONFIG.camera.tpvBaseHeight + speedRatio * 0.8;
    const tpvLocalOffset = new THREE.Vector3(0, tpvHeight, tpvDist);
    tpvLocalOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), vRot);
    const tpvTargetPos = vPos.clone().add(tpvLocalOffset);

    // 第三人称注视点
    const tpvLocalLook = new THREE.Vector3(0, CONFIG.camera.tpvLookHeight, -10.0);
    tpvLocalLook.applyAxisAngle(new THREE.Vector3(0, 1, 0), vRot);
    const tpvTargetLook = vPos.clone().add(tpvLocalLook);

    // 计算期望位姿
    const desiredPos = this.targetMode === 'fpv' ? fpvTargetPos : tpvTargetPos;
    const desiredLook = this.targetMode === 'fpv' ? fpvTargetLook : tpvTargetLook;

    // 动态 FOV: 第一人称使用沉浸式 72 度广角，第三人称根据车速拉张
    const targetBaseFov = this.targetMode === 'fpv' ? (CONFIG.camera.fpvFov || 72) : CONFIG.camera.fov;
    this.targetFov = targetBaseFov + (this.targetMode === 'tpv' ? speedRatio * 14 : speedRatio * 6);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFov, delta * 3.0);
    this.camera.near = CONFIG.camera.near || 0.05;
    this.camera.updateProjectionMatrix();

    if (this.isTransitioning) {
      this.transitionProgress += delta / this.transitionDuration;
      if (this.transitionProgress >= 1.0) {
        this.transitionProgress = 1.0;
        this.isTransitioning = false;
        this.currentMode = this.targetMode;
      }
      // 三次平滑缓动
      const t = this.transitionProgress;
      const ease = t * t * (3 - 2 * t);

      this.currentCameraPos.copy(this.fromPos).lerp(desiredPos, ease);
      this.currentLookAt.copy(this.fromLook).lerp(desiredLook, ease);
    } else {
      this.currentMode = this.targetMode;
      if (this.currentMode === 'fpv') {
        // 第一人称严密锁定驾驶舱，同时保留轻微动态路面颠簸与加减速俯仰
        const pitchInertia = -vehicle.acceleration * 0.012;
        desiredPos.y += pitchInertia;
        this.currentCameraPos.copy(desiredPos);
        this.currentLookAt.copy(desiredLook);
      } else {
        // 第三人称弹簧阻尼平滑跟随
        const followSpeed = 9.0;
        this.currentCameraPos.lerp(desiredPos, delta * followSpeed);
        this.currentLookAt.lerp(desiredLook, delta * (followSpeed + 2.0));
      }
    }

    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(this.currentLookAt);

    // 控制车辆外壳网格显示：第一人称隐藏车顶与外壳防穿模，保留引擎盖、仪表台与方向盘
    if (vehicle.setFirstPersonMode) {
      vehicle.setFirstPersonMode(this.currentMode === 'fpv');
    }
  }

  reset(vehicle) {
    this.isTransitioning = false;
    this.transitionProgress = 1.0;
    if (vehicle && vehicle.mesh) {
      const vPos = vehicle.mesh.position;
      const vRot = vehicle.mesh.rotation.y;
      if (this.targetMode === 'fpv') {
        const fpvLocalOffset = new THREE.Vector3(
          CONFIG.camera.fpvOffset.x,
          CONFIG.camera.fpvOffset.y,
          CONFIG.camera.fpvOffset.z
        );
        fpvLocalOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), vRot);
        this.currentCameraPos.copy(vPos).add(fpvLocalOffset);
        const fpvLocalLook = new THREE.Vector3(
          CONFIG.camera.fpvLookOffset.x,
          CONFIG.camera.fpvLookOffset.y,
          -CONFIG.camera.fpvLookOffset.z
        );
        fpvLocalLook.applyAxisAngle(new THREE.Vector3(0, 1, 0), vRot);
        this.currentLookAt.copy(vPos).add(fpvLocalLook);
      } else {
        const tpvDist = CONFIG.camera.tpvBaseDistance;
        const tpvHeight = CONFIG.camera.tpvBaseHeight;
        const tpvLocalOffset = new THREE.Vector3(0, tpvHeight, tpvDist);
        tpvLocalOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), vRot);
        this.currentCameraPos.copy(vPos).add(tpvLocalOffset);
        const tpvLocalLook = new THREE.Vector3(0, CONFIG.camera.tpvLookHeight, -10.0);
        tpvLocalLook.applyAxisAngle(new THREE.Vector3(0, 1, 0), vRot);
        this.currentLookAt.copy(vPos).add(tpvLocalLook);
      }
      this.camera.position.copy(this.currentCameraPos);
      this.camera.lookAt(this.currentLookAt);
    }
  }

  get isFirstPerson() {
    return this.currentMode === 'fpv';
  }
}

