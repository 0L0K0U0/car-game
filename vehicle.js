/**
 * vehicle.js - 玩家车辆程序化精美建模与动力学物理引擎
 * 满足需求 R3, R4, R11：流线金属漆跑车建模、数字座舱内饰、随动方向盘、中置后视镜、左右侧镜、动态双屏仪表、真实二自由度轮胎侧偏物理与手刹漂移
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Vehicle {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;

    // 动力学状态 (3 车道居中车道初始位置 x = 0)
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.localVelocity = new THREE.Vector2(0, 0); // (u: 纵向速度, v_lat: 侧向滑移速度)
    this.speed = 0; // 标量速度 (m/s)
    this.acceleration = 0; // 加速度 (m/s²)
    this.steerAngle = 0; // 当前前轮偏角 (rad)
    this.targetSteer = 0; // 目标前轮偏角
    this.yaw = 0; // 航向角 (rad)
    this.yawRate = 0; // 偏航角速度 (rad/s)
    this.pitch = 0; // 俯仰角 (加减速沉浮)
    this.roll = 0; // 侧倾角 (过弯倾斜)
    this.pitchVel = 0; // 俯仰弹簧速度
    this.rollVel = 0; // 侧倾弹簧速度
    this.gear = 'D'; // 'P' | 'R' | 'N' | 'D'
    this.rpm = 800; // 引擎转速 (RPM)
    this.throttleInput = 0;
    this.brakeInput = 0;
    this.handbrake = false;
    this.reverseShiftTimer = 0; // 刹停后长踩切倒车计时器

    // 灯光与转向状态
    this.headlightsOn = false;
    this.blinkerState = 0; // 0: 关, -1: 左, 1: 右, 2: 双闪
    this.blinkerTimer = 0;
    this.blinkerLit = false;
    this.uiUpdateTimer = 0;

    // 事故回放位姿历史环形缓冲区 (记录最近 360 帧 ≈ 6 秒)
    this.historyBuffer = [];
    this.maxHistoryFrames = 360;

    // 构建程序化 3D 车辆模型与车载动态屏幕
    this.initModel();
  }

  initModel() {
    this.mesh = new THREE.Group();
    this.exteriorParts = new THREE.Group(); // 外部车身外壳 (在 FPV 时适当隐藏部分车顶防穿模)
    this.interiorParts = new THREE.Group(); // 座舱内饰、双屏 UI、随动方向盘与后视镜

    // 1. 车身金属漆高级材质 (MeshPhysicalMaterial 清漆效果)
    this.carPaintMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7, // 科技深蔚蓝
      metalness: 0.88,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08
    });

    // 碳纤维扰流前唇/侧裙材质
    this.carbonMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.45,
      metalness: 0.35
    });

    // 车窗玻璃 (半透明深色物理反射)
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      metalness: 0.3,
      roughness: 0.05,
      transmission: 0.75,
      transparent: true,
      opacity: 0.8
    });

    // 后视镜高亮镀铬镜面材质
    this.mirrorMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.98,
      roughness: 0.04
    });

    // 车灯光源与发光材质
    this.headlightLensMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0
    });
    this.drlStripMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe }); // 日行灯光导条
    this.taillightMat = new THREE.MeshStandardMaterial({
      color: 0x990000,
      emissive: 0x440000,
      emissiveIntensity: 0.7
    });
    this.blinkerMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0x000000
    });

    // 2. 初始化车载数字化屏幕 (CanvasTexture 动态渲染)
    this.initCockpitDisplays();

    // 3. 构建高颜值流线型车身
    this.buildCarBody();

    // 4. 构建精细座舱 (A柱、方向盘、双数字大屏、中央后视镜、左右侧外后视镜)
    this.buildCockpit();

    // 5. 构建运动车轮 (五辐轮毂、红色刹车卡钳、开槽刹车盘)
    this.buildWheels();

    this.mesh.add(this.exteriorParts);
    this.mesh.add(this.interiorParts);
    this.scene.add(this.mesh);
  }

  initCockpitDisplays() {
    // 仪表盘数字屏 Canvas (256x128)
    this.clusterCanvas = document.createElement('canvas');
    this.clusterCanvas.width = 256;
    this.clusterCanvas.height = 128;
    this.clusterCtx = this.clusterCanvas.getContext('2d');
    this.clusterTexture = new THREE.CanvasTexture(this.clusterCanvas);
    this.clusterTexture.anisotropy = 4;
    this.clusterMat = new THREE.MeshBasicMaterial({ map: this.clusterTexture });

    // 中控悬浮导航大屏 Canvas (256x160)
    this.centerCanvas = document.createElement('canvas');
    this.centerCanvas.width = 256;
    this.centerCanvas.height = 160;
    this.centerCtx = this.centerCanvas.getContext('2d');
    this.centerTexture = new THREE.CanvasTexture(this.centerCanvas);
    this.centerTexture.anisotropy = 4;
    this.centerMat = new THREE.MeshBasicMaterial({ map: this.centerTexture });

    // 中央车内后视镜动态视野 Canvas (256x64)
    this.rearviewCanvas = document.createElement('canvas');
    this.rearviewCanvas.width = 256;
    this.rearviewCanvas.height = 64;
    this.rearviewCtx = this.rearviewCanvas.getContext('2d');
    this.rearviewTexture = new THREE.CanvasTexture(this.rearviewCanvas);
    this.rearviewMat = new THREE.MeshBasicMaterial({ map: this.rearviewTexture });

    // 初次绘制静态背景
    this.drawCockpitCluster(0, 'D', 800, false);
    this.drawCenterConsole(0, false);
    this.drawRearviewMirror([]);
  }

  buildCarBody() {
    // 底盘与车身主腔体
    const chassisGeom = new THREE.BoxGeometry(1.88, 0.42, 4.5);
    const chassisMesh = new THREE.Mesh(chassisGeom, this.carPaintMat);
    chassisMesh.position.y = 0.52;
    chassisMesh.castShadow = (this.quality !== 'low');
    chassisMesh.receiveShadow = (this.quality !== 'low');
    this.mesh.add(chassisMesh);

    // 运动碳纤维前铲与进气格栅
    const splitterGeom = new THREE.BoxGeometry(1.86, 0.08, 0.4);
    const splitter = new THREE.Mesh(splitterGeom, this.carbonMat);
    splitter.position.set(0, 0.28, -2.35);
    this.mesh.add(splitter);

    // 引擎盖：带有向前俯冲倾角与两侧双肌肉棱线
    const hoodGeom = new THREE.BoxGeometry(1.82, 0.12, 1.45);
    const hoodMesh = new THREE.Mesh(hoodGeom, this.carPaintMat);
    hoodMesh.position.set(0, 0.74, -1.6);
    hoodMesh.rotation.x = 0.065;
    this.mesh.add(hoodMesh);

    // 引擎盖导流棱线
    const creaseGeom = new THREE.BoxGeometry(0.06, 0.03, 1.3);
    const creaseL = new THREE.Mesh(creaseGeom, this.carbonMat);
    creaseL.position.set(-0.55, 0.81, -1.6);
    creaseL.rotation.x = 0.065;
    this.mesh.add(creaseL);
    const creaseR = creaseL.clone();
    creaseR.position.x = 0.55;
    this.mesh.add(creaseR);

    // 车身侧裙 (碳纤维运动侧包围)
    const sideSkirtGeom = new THREE.BoxGeometry(0.08, 0.12, 2.8);
    const sideSkirtL = new THREE.Mesh(sideSkirtGeom, this.carbonMat);
    sideSkirtL.position.set(-0.95, 0.32, 0);
    this.mesh.add(sideSkirtL);
    const sideSkirtR = sideSkirtL.clone();
    sideSkirtR.position.x = 0.95;
    this.mesh.add(sideSkirtR);

    // 车尾运动扩散器与鸭尾扰流板
    const diffuserGeom = new THREE.BoxGeometry(1.84, 0.25, 0.35);
    const diffuser = new THREE.Mesh(diffuserGeom, this.carbonMat);
    diffuser.position.set(0, 0.38, 2.25);
    this.mesh.add(diffuser);

    const spoilerGeom = new THREE.BoxGeometry(1.75, 0.08, 0.25);
    const spoiler = new THREE.Mesh(spoilerGeom, this.carPaintMat);
    spoiler.position.set(0, 0.85, 2.28);
    spoiler.rotation.x = -0.12;
    this.mesh.add(spoiler);

    // 前大灯矩阵组与日行灯带
    const hlGeom = new THREE.BoxGeometry(0.38, 0.12, 0.08);
    this.leftHeadlight = new THREE.Mesh(hlGeom, this.headlightLensMat);
    this.leftHeadlight.position.set(-0.72, 0.62, -2.28);
    this.mesh.add(this.leftHeadlight);
    this.rightHeadlight = this.leftHeadlight.clone();
    this.rightHeadlight.position.x = 0.72;
    this.mesh.add(this.rightHeadlight);

    // 前端贯穿式 LED 日行灯带
    const drlGeom = new THREE.BoxGeometry(1.65, 0.025, 0.05);
    const drlMesh = new THREE.Mesh(drlGeom, this.drlStripMat);
    drlMesh.position.set(0, 0.68, -2.28);
    this.mesh.add(drlMesh);

    // 前车头真实地面照明聚光灯 (SpotLight)
    this.spotLightLeft = new THREE.SpotLight(0xfff8ee, 0, 85, Math.PI / 4.5, 0.38, 1.2);
    this.spotLightLeft.position.set(-0.7, 0.64, -2.25);
    this.spotTargetLeft = new THREE.Object3D();
    this.spotTargetLeft.position.set(-0.7, 0, -40);
    this.mesh.add(this.spotLightLeft);
    this.mesh.add(this.spotTargetLeft);
    this.spotLightLeft.target = this.spotTargetLeft;

    this.spotLightRight = new THREE.SpotLight(0xfff8ee, 0, 85, Math.PI / 4.5, 0.38, 1.2);
    this.spotLightRight.position.set(0.7, 0.64, -2.25);
    this.spotTargetRight = new THREE.Object3D();
    this.spotTargetRight.position.set(0.7, 0, -40);
    this.mesh.add(this.spotLightRight);
    this.mesh.add(this.spotTargetRight);
    this.spotLightRight.target = this.spotTargetRight;

    // 车尾全贯穿式 LED 尾灯灯带
    const taillightBarGeom = new THREE.BoxGeometry(1.78, 0.08, 0.06);
    this.taillightBar = new THREE.Mesh(taillightBarGeom, this.taillightMat);
    this.taillightBar.position.set(0, 0.75, 2.27);
    this.mesh.add(this.taillightBar);

    // 左右转向灯
    const blinkerGeom = new THREE.BoxGeometry(0.18, 0.06, 0.06);
    this.frontBlinkerL = new THREE.Mesh(blinkerGeom, this.blinkerMat);
    this.frontBlinkerL.position.set(-0.85, 0.62, -2.28);
    this.mesh.add(this.frontBlinkerL);
    this.frontBlinkerR = this.frontBlinkerL.clone();
    this.frontBlinkerR.position.x = 0.85;
    this.mesh.add(this.frontBlinkerR);

    // 外部座舱顶棚与大面积全景天幕 (在第一人称时隐藏外车顶，保持内饰A柱与挡风玻璃)
    const roofGeom = new THREE.BoxGeometry(1.64, 0.68, 2.2);
    this.roofMesh = new THREE.Mesh(roofGeom, this.carPaintMat);
    this.roofMesh.position.set(0, 1.15, 0.1);
    this.exteriorParts.add(this.roofMesh);

    // 前风挡玻璃外壳
    const frontWindshieldGeom = new THREE.PlaneGeometry(1.62, 0.95);
    const frontWindshield = new THREE.Mesh(frontWindshieldGeom, this.glassMat);
    frontWindshield.position.set(0, 1.12, -0.98);
    frontWindshield.rotation.x = -Math.PI / 3.4;
    this.exteriorParts.add(frontWindshield);

    // 后车窗玻璃
    const rearWindshield = new THREE.Mesh(frontWindshieldGeom, this.glassMat);
    rearWindshield.position.set(0, 1.12, 1.25);
    rearWindshield.rotation.x = Math.PI / 3.2;
    this.exteriorParts.add(rearWindshield);
  }

  buildCockpit() {
    // 1. 结构化座舱：前风挡框架与左右 A 柱 (第一人称下依然清晰可见，带来强烈豪车包裹感)
    const aPillarGeom = new THREE.CylinderGeometry(0.04, 0.055, 1.25, 8);
    const aPillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const leftAPillar = new THREE.Mesh(aPillarGeom, aPillarMat);
    leftAPillar.position.set(-0.76, 1.15, -0.68);
    leftAPillar.rotation.x = 0.58;
    leftAPillar.rotation.z = -0.16;
    this.interiorParts.add(leftAPillar);

    const rightAPillar = new THREE.Mesh(aPillarGeom, aPillarMat);
    rightAPillar.position.set(0.76, 1.15, -0.68);
    rightAPillar.rotation.x = 0.58;
    rightAPillar.rotation.z = 0.16;
    this.interiorParts.add(rightAPillar);

    // 前挡风玻璃顶梁横柱
    const topHeaderGeom = new THREE.BoxGeometry(1.55, 0.08, 0.12);
    const topHeader = new THREE.Mesh(topHeaderGeom, aPillarMat);
    topHeader.position.set(0, 1.48, -0.38);
    this.interiorParts.add(topHeader);

    // 左侧驾驶员车门内饰板与窗沿
    const doorTrimGeom = new THREE.BoxGeometry(0.12, 0.45, 1.8);
    const doorTrim = new THREE.Mesh(doorTrimGeom, aPillarMat);
    doorTrim.position.set(-0.88, 0.85, 0.1);
    this.interiorParts.add(doorTrim);

    // 2. 流线型主仪表台与氛围灯带
    const dashGeom = new THREE.BoxGeometry(1.68, 0.32, 0.72);
    const dashMesh = new THREE.Mesh(dashGeom, aPillarMat);
    dashMesh.position.set(0, 0.85, -0.72);
    this.interiorParts.add(dashMesh);

    // 环抱式冰蓝霓虹氛围灯带
    const ambientLightGeom = new THREE.BoxGeometry(1.62, 0.02, 0.03);
    const ambientLightMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const ambientStrip = new THREE.Mesh(ambientLightGeom, ambientLightMat);
    ambientStrip.position.set(0, 0.94, -0.65);
    this.interiorParts.add(ambientStrip);

    // 3. 驾驶员专属数字化仪表盘屏幕 (带向驾驶员微倾角)
    const clusterGeom = new THREE.PlaneGeometry(0.36, 0.18);
    const clusterMesh = new THREE.Mesh(clusterGeom, this.clusterMat);
    clusterMesh.position.set(-0.38, 0.94, -0.56);
    clusterMesh.rotation.x = -0.32;
    this.interiorParts.add(clusterMesh);

    // 仪表盘边框
    const clusterFrameGeom = new THREE.BoxGeometry(0.38, 0.20, 0.03);
    const clusterFrame = new THREE.Mesh(clusterFrameGeom, this.carbonMat);
    clusterFrame.position.set(-0.38, 0.94, -0.57);
    clusterFrame.rotation.x = -0.32;
    this.interiorParts.add(clusterFrame);

    // 4. 中央控制台大屏 (向驾驶员倾斜 18°，方便侧目读取)
    const centerGeom = new THREE.PlaneGeometry(0.42, 0.26);
    const centerMesh = new THREE.Mesh(centerGeom, this.centerMat);
    centerMesh.position.set(0.06, 0.88, -0.52);
    centerMesh.rotation.x = -0.25;
    centerMesh.rotation.y = 0.22; // 微微朝向驾驶员
    this.interiorParts.add(centerMesh);

    // 5. 运动平底赛车多功能方向盘 (距离驾驶员眼部充足，绝不穿模)
    this.steeringWheelGroup = new THREE.Group();
    this.steeringWheelGroup.position.set(-0.38, 0.86, -0.42);
    this.steeringWheelGroup.rotation.x = 0.35; // 人体工学仰角

    // 转向柱
    const colGeom = new THREE.CylinderGeometry(0.035, 0.045, 0.22, 10);
    const colMesh = new THREE.Mesh(colGeom, this.carbonMat);
    colMesh.rotation.x = Math.PI / 2;
    colMesh.position.z = -0.11;
    this.steeringWheelGroup.add(colMesh);

    // 平底方向盘外圈 (TorusGeometry)
    const wheelRimGeom = new THREE.TorusGeometry(0.165, 0.018, 12, 32);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.7, metalness: 0.25 });
    const rimMesh = new THREE.Mesh(wheelRimGeom, wheelMat);
    this.steeringWheelGroup.add(rimMesh);

    // 顶部 12 点钟赛车对齐定位回正线 (亮青色)
    const markGeom = new THREE.BoxGeometry(0.025, 0.038, 0.025);
    const markMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const markMesh = new THREE.Mesh(markGeom, markMat);
    markMesh.position.set(0, 0.165, 0);
    this.steeringWheelGroup.add(markMesh);

    // 镂空金属辐条
    const spokeGeom = new THREE.BoxGeometry(0.14, 0.025, 0.015);
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.9, roughness: 0.2 });
    const spokeL = new THREE.Mesh(spokeGeom, spokeMat);
    spokeL.position.set(-0.075, 0, 0);
    this.steeringWheelGroup.add(spokeL);
    const spokeR = spokeL.clone();
    spokeR.position.x = 0.075;
    this.steeringWheelGroup.add(spokeR);

    // 方向盘中心喇叭气囊盖与品牌徽标
    const hubGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.025, 16);
    const hubMesh = new THREE.Mesh(hubGeom, this.carbonMat);
    hubMesh.rotation.x = Math.PI / 2;
    this.steeringWheelGroup.add(hubMesh);

    this.interiorParts.add(this.steeringWheelGroup);

    // 6. 中央车内后视镜 (悬挂于风挡上方中心，朝向驾驶员)
    const rvGeom = new THREE.PlaneGeometry(0.24, 0.065);
    const rvMesh = new THREE.Mesh(rvGeom, this.rearviewMat);
    rvMesh.position.set(0, 1.38, -0.52);
    rvMesh.rotation.x = 0.08;
    rvMesh.rotation.y = 0.22; // 侧向驾驶员
    this.interiorParts.add(rvMesh);

    const rvFrameGeom = new THREE.BoxGeometry(0.26, 0.08, 0.025);
    const rvFrame = new THREE.Mesh(rvFrameGeom, this.carbonMat);
    rvFrame.position.set(0, 1.38, -0.53);
    rvFrame.rotation.x = 0.08;
    rvFrame.rotation.y = 0.22;
    this.interiorParts.add(rvFrame);

    // 7. 左侧门外后视镜 (第一人称自然可见其镜面反射)
    const mirrorStemGeom = new THREE.CylinderGeometry(0.02, 0.025, 0.14, 8);
    const leftStem = new THREE.Mesh(mirrorStemGeom, this.carbonMat);
    leftStem.rotation.z = -Math.PI / 3;
    leftStem.position.set(-0.95, 0.92, -0.55);
    this.mesh.add(leftStem);

    const mirrorHousingGeom = new THREE.BoxGeometry(0.22, 0.12, 0.12);
    const leftHousing = new THREE.Mesh(mirrorHousingGeom, this.carPaintMat);
    leftHousing.position.set(-1.05, 0.95, -0.55);
    this.mesh.add(leftHousing);

    // 左后视镜镜面 (朝向车后与驾驶员)
    const leftMirrorPlateGeom = new THREE.PlaneGeometry(0.18, 0.095);
    const leftPlate = new THREE.Mesh(leftMirrorPlateGeom, this.mirrorMat);
    leftPlate.position.set(-1.04, 0.95, -0.485);
    leftPlate.rotation.y = Math.PI - 0.25;
    this.mesh.add(leftPlate);

    // 右侧外后视镜
    const rightHousing = leftHousing.clone();
    rightHousing.position.x = 1.05;
    this.mesh.add(rightHousing);
    const rightPlate = leftPlate.clone();
    rightPlate.position.x = 1.04;
    rightPlate.rotation.y = Math.PI + 0.25;
    this.mesh.add(rightPlate);
  }

  buildWheels() {
    this.wheels = [];
    const tireGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 24);
    tireGeom.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.88 });

    const rimGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.27, 16);
    rimGeom.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xe4e4e7, metalness: 0.92, roughness: 0.15 });

    // 红色高性能制动卡钳
    const caliperGeom = new THREE.BoxGeometry(0.12, 0.14, 0.06);
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.6, roughness: 0.3 });

    // 银色打孔刹车盘
    const discGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16);
    discGeom.rotateZ(Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, metalness: 0.85, roughness: 0.2 });

    const wheelOffsets = [
      { x: -0.88, y: 0.35, z: -1.45, isFront: true },  // 前左
      { x: 0.88, y: 0.35, z: -1.45, isFront: true },   // 前右
      { x: -0.88, y: 0.35, z: 1.45, isFront: false },  // 后左
      { x: 0.88, y: 0.35, z: 1.45, isFront: false }    // 后右
    ];

    wheelOffsets.forEach(pos => {
      const pivot = new THREE.Group();
      pivot.position.set(pos.x, pos.y, pos.z);

      const rollGroup = new THREE.Group();
      const tireMesh = new THREE.Mesh(tireGeom, tireMat);
      tireMesh.castShadow = (this.quality !== 'low');
      const rimMesh = new THREE.Mesh(rimGeom, rimMat);

      rollGroup.add(tireMesh);
      rollGroup.add(rimMesh);
      pivot.add(rollGroup);

      // 刹车盘与卡钳 (保持不随轮胎旋转，随转向偏转)
      const brakeDisc = new THREE.Mesh(discGeom, discMat);
      brakeDisc.position.x = pos.x > 0 ? -0.06 : 0.06;
      pivot.add(brakeDisc);

      const caliper = new THREE.Mesh(caliperGeom, caliperMat);
      caliper.position.set(pos.x > 0 ? -0.06 : 0.06, 0.12, 0);
      pivot.add(caliper);

      this.mesh.add(pivot);
      this.wheels.push({ pivot, rollGroup, isFront: pos.isFront });
    });
  }

  drawCockpitCluster(speedKmh, gear, rpm, adasActive) {
    const ctx = this.clusterCtx;
    ctx.clearRect(0, 0, 256, 128);

    // 深空纯黑背景 + 外轮廓科技边框
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 248, 120);

    // 档位指示条
    const gears = ['P', 'R', 'N', 'D'];
    gears.forEach((g, i) => {
      ctx.fillStyle = g === gear ? '#00f076' : '#475569';
      ctx.font = g === gear ? 'bold 16px sans-serif' : '14px sans-serif';
      ctx.fillText(g, 24 + i * 26, 26);
    });

    // 智驾 ADAS 状态灯
    if (adasActive) {
      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('⚡ ADAS ACTIVE', 142, 26);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.fillText('MANUAL DRIVE', 145, 26);
    }

    // 主速度大字 (居中醒目数字)
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 46px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(speedKmh)}`, 128, 80);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('km/h', 128, 98);

    // 底部动态功率/转速弧条
    const rpmPercent = Math.min(1.0, rpm / 6800);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 110, 216, 8);
    const grad = ctx.createLinearGradient(20, 0, 236, 0);
    grad.addColorStop(0, '#00d2ff');
    grad.addColorStop(0.7, '#00f076');
    grad.addColorStop(1, '#ef4444');
    ctx.fillStyle = grad;
    ctx.fillRect(20, 110, 216 * rpmPercent, 8);
    ctx.textAlign = 'left';

    this.clusterTexture.needsUpdate = true;
  }

  drawCenterConsole(speedKmh, adasActive) {
    const ctx = this.centerCtx;
    ctx.clearRect(0, 0, 256, 160);

    // 科技座舱深色面板
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, 256, 160);

    // 顶部状态条
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('GPS NAV · 3-LANE SMART PILOT ZONE', 14, 22);

    // 模拟 3D 高速公路导航透视图
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 150);
    ctx.lineTo(105, 50);
    ctx.moveTo(226, 150);
    ctx.lineTo(151, 50);
    ctx.stroke();

    // 居中车道标线
    ctx.strokeStyle = '#00f076';
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(128, 150);
    ctx.lineTo(128, 50);
    ctx.stroke();
    ctx.setLineDash([]);

    // 自身车辆图标 (中央小三角)
    ctx.fillStyle = '#00d2ff';
    ctx.beginPath();
    ctx.moveTo(128, 130);
    ctx.lineTo(122, 145);
    ctx.lineTo(134, 145);
    ctx.closePath();
    ctx.fill();

    // 限速牌圆形标志 (红圈黑字 130)
    ctx.beginPath();
    ctx.arc(220, 45, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(220, 45, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('130', 220, 50);
    ctx.textAlign = 'left';

    // 底部状态提示条
    ctx.fillStyle = adasActive ? '#00f0ff' : '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText(adasActive ? 'LKA ACTIVE · AES DODGE READY' : 'MANUAL DRIVE · PRESS [C] TO ENGAGE', 14, 146);

    this.centerTexture.needsUpdate = true;
  }

  drawRearviewMirror(surrounding = []) {
    const ctx = this.rearviewCtx;
    ctx.clearRect(0, 0, 256, 64);

    // 镜面反射渐变天空与道路
    ctx.fillStyle = '#0c1527';
    ctx.fillRect(0, 0, 256, 32);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 32, 256, 32);

    // 车道虚线向上汇聚
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 64);
    ctx.lineTo(110, 32);
    ctx.moveTo(196, 64);
    ctx.lineTo(146, 32);
    ctx.stroke();

    // 绘制后方跟驰车辆小矩形
    if (surrounding && surrounding.length > 0) {
      surrounding.forEach(item => {
        if (item.dz > 0 && item.dz < 60) {
          // 后方车辆在镜面中呈现
          const mx = 128 - item.dx * 18;
          const my = 35 + (1.0 - item.dz / 60) * 22;
          ctx.fillStyle = item.dz < 20 ? '#ef4444' : '#00f076';
          ctx.fillRect(mx - 8, my - 5, 16, 10);
        }
      });
    }

    this.rearviewTexture.needsUpdate = true;
  }

  setFirstPersonMode(isFPV) {
    // 第一人称隐藏外车顶防遮挡，保留整套A柱框架、挡风玻璃内饰、方向盘与双屏
    this.roofMesh.visible = !isFPV;
  }

  setHeadlights(on) {
    this.headlightsOn = on;
    const intensity = on ? 1.6 : 0;
    this.headlightLensMat.emissive.setHex(on ? 0xfffaed : 0x000000);
    this.headlightLensMat.emissiveIntensity = intensity;

    const spotInt = on ? 180 : 0;
    this.spotLightLeft.intensity = spotInt;
    this.spotLightRight.intensity = spotInt;
  }

  toggleHeadlights() {
    this.setHeadlights(!this.headlightsOn);
    return this.headlightsOn;
  }

  setBlinker(state) {
    this.blinkerState = state;
  }

  getHitbox() {
    const hw = (CONFIG.hitbox ? CONFIG.hitbox.player.width : 1.88) * 0.5;
    const hl = (CONFIG.hitbox ? CONFIG.hitbox.player.length : 4.5) * 0.5;
    return {
      minX: this.position.x - hw,
      maxX: this.position.x + hw,
      minZ: this.position.z - hl,
      maxZ: this.position.z + hl,
      x: this.position.x,
      z: this.position.z,
      width: hw * 2,
      length: hl * 2
    };
  }

  reset(x = 0, z = 0) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.localVelocity.set(0, 0);
    this.speed = 0;
    this.acceleration = 0;
    this.steerAngle = 0;
    this.targetSteer = 0;
    this.yaw = 0;
    this.yawRate = 0;
    this.pitch = 0;
    this.roll = 0;
    this.pitchVel = 0;
    this.rollVel = 0;
    this.gear = 'D';
    this.rpm = 800;
    this.throttleInput = 0;
    this.brakeInput = 0;
    this.handbrake = false;
    this.historyBuffer = [];
    this.reverseShiftTimer = 0;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, 0, 0);
  }

  // 严格遵循牛顿力学与二自由度轮胎侧偏物理模型
  updatePhysics(delta, input, isSmartDriving = false) {
    const P = CONFIG.physics;

    this.throttleInput = input.throttle || 0;
    this.brakeInput = input.brake || 0;
    this.handbrake = isSmartDriving ? false : (input.handbrake || false);
    this.targetSteer = (input.steer || 0) * P.maxSteerAngle;

    // 1. 真实档位切换逻辑 (刹停长踩刹车自动切倒车 R，踩油门自动切前进 D)
    if (this.gear === 'D') {
      if (Math.abs(this.speed) < 0.25 && this.brakeInput > 0.4) {
        this.reverseShiftTimer += delta;
        if (this.reverseShiftTimer > 0.2) {
          this.gear = 'R';
          this.reverseShiftTimer = 0;
        }
      } else {
        this.reverseShiftTimer = 0;
      }
    } else if (this.gear === 'R') {
      if (Math.abs(this.speed) < 0.25 && this.throttleInput > 0.3) {
        this.reverseShiftTimer += delta;
        if (this.reverseShiftTimer > 0.2) {
          this.gear = 'D';
          this.reverseShiftTimer = 0;
        }
      } else {
        this.reverseShiftTimer = 0;
      }
    }

    // 2. 方向盘打角响应与随速动态阻尼衰减
    const speedRatio = Math.abs(this.speed) / P.maxForwardSpeed;
    const dynamicSteerLimit = P.maxSteerAngle / (1.0 + speedRatio * 3.6);
    const clampedTargetSteer = THREE.MathUtils.clamp(
      this.targetSteer,
      -dynamicSteerLimit,
      dynamicSteerLimit
    );
    const steerSpeed = input.steer ? P.steerInputSpeed : P.steerReturnSpeed;
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, clampedTargetSteer, delta * steerSpeed);

    // 3. 纵向驱动力、制动力与阻力解算
    let driveForce = 0;
    let brakeForce = 0;

    if (this.gear === 'D') {
      driveForce = this.throttleInput * P.engineForce * (1.0 - speedRatio * 0.42);
      brakeForce = this.brakeInput * P.brakeForce;
    } else {
      // 倒车档：按 S/下键作为倒车动力
      driveForce = -this.brakeInput * P.engineForce * 0.55;
      brakeForce = this.throttleInput * P.brakeForce;
    }

    if (this.handbrake) {
      brakeForce += P.handbrakeForce;
    }

    // 空气阻力与滚动阻力 (正比于 v²)
    const aeroDrag = 0.5 * P.airDensity * P.frontalArea * P.dragCoefficient * (this.speed * this.speed) * Math.sign(this.speed);
    const rollResist = P.rollingResistance * P.vehicleMass * P.gravity * Math.sign(this.speed);

    let netLongForce = driveForce - aeroDrag - rollResist;
    if (Math.abs(this.speed) > 0.08) {
      netLongForce -= brakeForce * Math.sign(this.speed);
    } else if (brakeForce > 0) {
      this.speed = 0;
      netLongForce = 0;
    }

    this.acceleration = netLongForce / P.vehicleMass;
    this.speed += this.acceleration * delta;

    // 限速保护
    if (this.gear === 'R') {
      this.speed = THREE.MathUtils.clamp(this.speed, -P.maxReverseSpeed, 0.5);
    } else {
      this.speed = THREE.MathUtils.clamp(this.speed, -0.5, P.maxForwardSpeed);
    }

    // 4. 二自由度侧偏物理模型与侧向滑移 (Bicycle Dynamics with Lateral Drift)
    const u = this.speed; // 车体纵向速度
    const vLat = this.localVelocity.y; // 车体侧向滑移速度
    const a = P.wheelbase * 0.52; // 质心到前轴距离
    const b = P.wheelbase * 0.48; // 质心到后轴距离

    // 计算前后轮胎侧偏角 (Slip Angles)
    const safeU = Math.max(1.5, Math.abs(u));
    const alphaF = Math.atan2(vLat + a * this.yawRate, safeU) - this.steerAngle;
    const alphaR = Math.atan2(vLat - b * this.yawRate, safeU);

    // 轮胎抓地力极限 (手刹拉起时后轮侧向摩擦系数急剧下降，触发可控漂移)
    let rearGripMultiplier = this.handbrake ? 0.22 : 1.0;
    const maxLatForceF = P.gripLimit * (P.vehicleMass * 0.5) * P.gravity;
    const maxLatForceR = P.gripLimit * rearGripMultiplier * (P.vehicleMass * 0.5) * P.gravity;

    // 前后轮侧向附着力
    const latForceF = THREE.MathUtils.clamp(
      -P.tireCorneringStiffnessFront * alphaF,
      -maxLatForceF,
      maxLatForceF
    );
    const latForceR = THREE.MathUtils.clamp(
      -P.tireCorneringStiffnessRear * alphaR,
      -maxLatForceR,
      maxLatForceR
    );

    // 绕 Z 轴偏航力矩与角加速度
    const Iz = (1 / 12) * P.vehicleMass * (P.wheelbase * P.wheelbase + P.trackWidth * P.trackWidth);
    const yawTorque = (a * latForceF - b * latForceR);
    const yawAccel = yawTorque / Iz;

    if (Math.abs(u) > 0.15) {
      this.yawRate += yawAccel * delta;
      // 偏航阻尼回正
      this.yawRate *= Math.pow(0.88, delta * 60);
      this.yaw += this.yawRate * delta;
    } else {
      this.yawRate = 0;
    }

    // 侧向滑移速度积分
    const latAccel = (latForceF + latForceR) / P.vehicleMass - u * this.yawRate;
    this.localVelocity.y += latAccel * delta;
    this.localVelocity.y *= Math.pow(0.82, delta * 60); // 侧向摩擦衰减

    // 将本车坐标系速度 (u, v_lat) 转换至世界大地坐标系速度向量
    // 车体朝向大地负 Z 轴：xWorld = -sin(yaw)*u + cos(yaw)*v_lat, zWorld = -cos(yaw)*u - sin(yaw)*v_lat
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    this.velocity.x = -sinY * u + cosY * this.localVelocity.y;
    this.velocity.z = -cosY * u - sinY * this.localVelocity.y;
    this.velocity.y = 0;

    this.position.addScaledVector(this.velocity, delta);

    // 5. 悬挂弹簧-阻尼器动力学 (车身俯仰 Pitch 与侧倾 Roll 惯性拟真)
    const targetPitch = -this.acceleration * 0.026;
    const latG = (u * this.yawRate) / P.gravity;
    const targetRoll = THREE.MathUtils.clamp(latG * 0.08, -0.15, 0.15);

    // 二阶弹簧阻尼解算
    this.pitchVel += (targetPitch - this.pitch) * 120 * delta;
    this.pitchVel *= Math.pow(0.85, delta * 60);
    this.pitch += this.pitchVel * delta;

    this.rollVel += (targetRoll - this.roll) * 140 * delta;
    this.rollVel *= Math.pow(0.84, delta * 60);
    this.roll += this.rollVel * delta;

    // 6. 拟真引擎 RPM 转速解算
    const speedKmh = Math.abs(this.speed * 3.6);
    const idleRpm = 800;
    const maxRpm = 6800;
    const gearIdx = Math.min(5, Math.floor(speedKmh / 24));
    const gearProgress = (speedKmh - gearIdx * 22) / 26;
    this.rpm = idleRpm + THREE.MathUtils.clamp(gearProgress, 0, 1) * (maxRpm - idleRpm) * 0.72 + this.throttleInput * 900;
    this.rpm = THREE.MathUtils.clamp(this.rpm, idleRpm, maxRpm);

    // 7. 车载动态屏幕刷新 (每秒约 15 帧节省性能)
    this.uiUpdateTimer += delta;
    if (this.uiUpdateTimer > 0.065) {
      this.uiUpdateTimer = 0;
      this.drawCockpitCluster(speedKmh, this.gear, this.rpm, isSmartDriving);
      this.drawCenterConsole(speedKmh, isSmartDriving);
    }

    // 8. 视觉模型更新与位姿记录
    this.updateVisuals(delta);
    this.recordHistoryPose();
  }

  updateVisuals(delta) {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.x = this.pitch;
    this.mesh.rotation.z = this.roll;

    // 四轮滚动与前轮偏向
    const rollDelta = (this.speed * delta) / 0.35;
    this.wheels.forEach(w => {
      w.rollGroup.rotation.x -= rollDelta;
      if (w.isFront) {
        w.pivot.rotation.y = this.steerAngle;
      }
    });

    // 随动方向盘转动
    if (this.steeringWheelGroup) {
      this.steeringWheelGroup.rotation.z = -this.steerAngle * 4.2;
    }

    // 刹车灯高亮
    const isBraking = this.brakeInput > 0.05 || this.handbrake;
    this.taillightMat.emissive.setHex(isBraking ? 0xff0000 : 0x550000);
    this.taillightMat.emissiveIntensity = isBraking ? 2.6 : 0.7;

    // 转向灯闪烁
    this.blinkerTimer += delta;
    if (this.blinkerTimer >= 0.36) {
      this.blinkerTimer = 0;
      this.blinkerLit = !this.blinkerLit;
    }
    const lLit = (this.blinkerState === -1 || this.blinkerState === 2) && this.blinkerLit;
    const rLit = (this.blinkerState === 1 || this.blinkerState === 2) && this.blinkerLit;
    this.frontBlinkerL.material.emissive.setHex(lLit ? 0xffaa00 : 0x000000);
    this.frontBlinkerR.material.emissive.setHex(rLit ? 0xffaa00 : 0x000000);
  }

  recordHistoryPose() {
    if (this.historyBuffer.length >= this.maxHistoryFrames) {
      this.historyBuffer.shift();
    }
    this.historyBuffer.push({
      position: this.position.clone(),
      yaw: this.yaw,
      pitch: this.pitch,
      roll: this.roll,
      steerAngle: this.steerAngle,
      speed: this.speed
    });
  }
}
