/**
 * world.js - 高品质 3D 智慧高速公路、环境昼夜、天际线与天气系统
 * 满足需求 R3, R6, R12：三车道高质量沥青路面、反光道钉猫眼、高架门架指路牌、波形护栏轮廓标、InstancedMesh 植被、流线路灯、平滑昼夜过渡与雨雪雾粒子
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class World {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;

    // 道路规格
    this.laneWidth = CONFIG.world.laneWidth;
    this.laneCount = CONFIG.world.laneCount; // 3 车道
    this.roadWidth = this.laneWidth * this.laneCount; // 11.25m
    this.totalWidth = this.roadWidth + CONFIG.world.shoulderWidth * 2; // 15.65m
    this.chunkLength = CONFIG.world.chunkLength; // 200m
    this.chunkCount = CONFIG.graphics[this.quality].maxVisibleChunks || 6;
    this.chunks = [];

    // 昼夜系统 (0: 白天, 1: 夜晚)
    this.dayNightProgress = 0;
    this.targetDayNight = 0;

    // 天气: 'clear' | 'rain' | 'fog'
    this.currentWeather = 'clear';

    // 共享几何体与材质（复用以达极致性能）
    this.initSharedAssets();
    this.setupLighting();
    this.setupSkyAndFog();
    this.setupRainSystem();
    this.initRoadChunks();
  }

  initSharedAssets() {
    // 1. 动态 Canvas 生成高品质沥青路面漫反射贴图 (含沥青骨料噪点、车道轮迹带橡胶压痕与路肩减速震荡红白斑马条)
    const roadCanvas = document.createElement('canvas');
    roadCanvas.width = 1024;
    roadCanvas.height = 1024;
    const ctx = roadCanvas.getContext('2d');

    // 深色高级沥青底色
    ctx.fillStyle = '#1c2027';
    ctx.fillRect(0, 0, 1024, 1024);

    // 沥青矿物骨料微噪点
    for (let i = 0; i < 28000; i++) {
      const g = 20 + Math.floor(Math.random() * 45);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }

    // 3 车道车轮经过的深色磨损轮迹带 (Tire rubber wear tracks)
    const lanePxW = 1024 / 3;
    for (let l = 0; l < 3; l++) {
      const lCenter = l * lanePxW + lanePxW / 2;
      // 左右车轮轮迹
      [-lanePxW * 0.24, lanePxW * 0.24].forEach(offset => {
        const grad = ctx.createLinearGradient(lCenter + offset - 26, 0, lCenter + offset + 26, 0);
        grad.addColorStop(0, 'rgba(15, 18, 24, 0)');
        grad.addColorStop(0.5, 'rgba(12, 14, 18, 0.45)');
        grad.addColorStop(1, 'rgba(15, 18, 24, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(lCenter + offset - 26, 0, 52, 1024);
      });
    }

    this.roadTexture = new THREE.CanvasTexture(roadCanvas);
    this.roadTexture.wrapS = THREE.RepeatWrapping;
    this.roadTexture.wrapT = THREE.RepeatWrapping;
    this.roadTexture.repeat.set(1, 16);

    // 道路主材质
    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: this.roadTexture,
      roughness: 0.78,
      metalness: 0.12
    });

    // 动态 Canvas 生成路肩红白震荡减速警示带 (Rumble Strip Kerb)
    const shoulderCanvas = document.createElement('canvas');
    shoulderCanvas.width = 128;
    shoulderCanvas.height = 256;
    const sctx = shoulderCanvas.getContext('2d');
    sctx.fillStyle = '#272a30';
    sctx.fillRect(0, 0, 128, 256);
    // 红白相间斜条纹减速边坡
    for (let y = 0; y < 256; y += 32) {
      sctx.fillStyle = (y / 32) % 2 === 0 ? '#b91c1c' : '#f8fafc';
      sctx.fillRect(0, y, 22, 32);
    }
    this.shoulderTexture = new THREE.CanvasTexture(shoulderCanvas);
    this.shoulderTexture.wrapS = THREE.RepeatWrapping;
    this.shoulderTexture.wrapT = THREE.RepeatWrapping;
    this.shoulderTexture.repeat.set(1, 24);

    this.shoulderMaterial = new THREE.MeshStandardMaterial({
      map: this.shoulderTexture,
      roughness: 0.85,
      metalness: 0.08
    });

    // 车道标线材质（白色与黄色高反光度）
    this.whiteLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.yellowLineMaterial = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    // 猫眼 / 反光道钉材质 (Cat's Eyes / Road Studs)
    this.roadStudMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xffedd5,
      emissiveIntensity: 0.35,
      metalness: 0.95,
      roughness: 0.1
    });

    // 波形梁钢护栏材质（热镀锌银灰金属反光）
    this.guardrailMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.88,
      roughness: 0.28
    });

    // 护栏反光梯形轮廓标材质 (Amber / White Reflectors)
    this.reflectorMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.15
    });

    // 自然绿化植被与草地
    const grassCanvas = document.createElement('canvas');
    grassCanvas.width = 256;
    grassCanvas.height = 256;
    const gctx = grassCanvas.getContext('2d');
    gctx.fillStyle = '#1e381e';
    gctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4000; i++) {
      gctx.fillStyle = Math.random() > 0.5 ? '#166534' : '#14532d';
      gctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    this.grassTexture = new THREE.CanvasTexture(grassCanvas);
    this.grassTexture.wrapS = THREE.RepeatWrapping;
    this.grassTexture.wrapT = THREE.RepeatWrapping;
    this.grassTexture.repeat.set(4, 18);

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      map: this.grassTexture,
      roughness: 0.92
    });

    // 现代高架路灯杆与灯头材质
    this.poleMaterial = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75, roughness: 0.35 });
    this.lampBulbMaterial = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0x000000,
      emissiveIntensity: 0
    });

    // 高速公路大型门架指路牌 Canvas 贴图
    this.initGantrySignTexture();

    // 共享几何体
    this.guardrailGeom = new THREE.BoxGeometry(0.12, 0.45, this.chunkLength);
    this.postGeom = new THREE.CylinderGeometry(0.065, 0.065, 1.05, 8);
    this.studGeom = new THREE.BoxGeometry(0.12, 0.035, 0.15);
    this.reflectorGeom = new THREE.BoxGeometry(0.04, 0.12, 0.08);

    this.poleGeom = new THREE.CylinderGeometry(0.1, 0.16, 7.8, 10);
    this.armGeom = new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8);
    this.bulbGeom = new THREE.BoxGeometry(0.7, 0.15, 0.35); // 现代扁平流线型 LED 灯头

    this.treeTrunkGeom = new THREE.CylinderGeometry(0.25, 0.45, 3.2, 8);
    this.treeFoliageGeom = new THREE.ConeGeometry(2.2, 5.2, 7);
    this.foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.8 });
    this.trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
  }

  initGantrySignTexture() {
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sctx = signCanvas.getContext('2d');

    // 经典高速绿色指路牌背景
    sctx.fillStyle = '#065f46';
    sctx.fillRect(0, 0, 512, 128);
    sctx.strokeStyle = '#ffffff';
    sctx.lineWidth = 4;
    sctx.strokeRect(6, 6, 500, 116);

    // 路线编号标牌 (红底黄字 I-101)
    sctx.fillStyle = '#dc2626';
    sctx.fillRect(20, 16, 90, 42);
    sctx.fillStyle = '#facc15';
    sctx.font = 'bold 22px sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText('I-101', 65, 45);

    // 主干道提示文本
    sctx.fillStyle = '#ffffff';
    sctx.font = 'bold 24px sans-serif';
    sctx.textAlign = 'left';
    sctx.fillText('SMART FREEWAY · AUTONOMOUS TESTWAY', 125, 45);

    // 分道与出口箭头信息
    sctx.font = '17px sans-serif';
    sctx.fillStyle = '#a7f3d0';
    sctx.fillText('▲ PILOT ONLY    ▲ CRUISE LANE    EXIT 8 TECH PARK 2km ▶', 25, 96);

    this.gantrySignTex = new THREE.CanvasTexture(signCanvas);
    this.gantrySignMat = new THREE.MeshBasicMaterial({ map: this.gantrySignTex });
  }

  setupLighting() {
    // 半球环境光
    this.hemiLight = new THREE.HemisphereLight(0xddeeff, 0x223344, 0.88);
    this.scene.add(this.hemiLight);

    // 主平行光（太阳 / 月亮）
    this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.45);
    this.dirLight.position.set(40, 95, 50);
    if (this.quality !== 'low') {
      this.dirLight.castShadow = true;
      const shadowSize = CONFIG.graphics[this.quality].shadowMapSize;
      this.dirLight.shadow.mapSize.width = shadowSize;
      this.dirLight.shadow.mapSize.height = shadowSize;
      this.dirLight.shadow.camera.near = 10;
      this.dirLight.shadow.camera.far = 260;
      this.dirLight.shadow.camera.left = -35;
      this.dirLight.shadow.camera.right = 35;
      this.dirLight.shadow.camera.top = 40;
      this.dirLight.shadow.camera.bottom = -40;
      this.dirLight.shadow.bias = -0.0005;
    }
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // 夜晚路灯聚光灯组（少量高质量 SpotLight，保障极致性能）
    this.streetSpotLights = [];
    for (let i = 0; i < 4; i++) {
      const spot = new THREE.SpotLight(0xffecc4, 0, 50, Math.PI / 4, 0.4, 1.2);
      spot.visible = false;
      this.scene.add(spot);
      this.scene.add(spot.target);
      this.streetSpotLights.push(spot);
    }
  }

  setupSkyAndFog() {
    this.fogDayColor = new THREE.Color(0xb0c8e0);
    this.fogNightColor = new THREE.Color(0x060913);
    this.scene.background = this.fogDayColor.clone();
    this.scene.fog = new THREE.FogExp2(this.fogDayColor.clone(), 0.0035);

    // 远景山峦叠嶂与城市天际线 (Layered mountains + city)
    this.skylineGroup = new THREE.Group();
    const cityCanvas = document.createElement('canvas');
    cityCanvas.width = 1024;
    cityCanvas.height = 256;
    const cctx = cityCanvas.getContext('2d');

    // 远山剪影 (Distant Mountain Range)
    cctx.fillStyle = '#1e293b';
    cctx.beginPath();
    cctx.moveTo(0, 180);
    for (let x = 0; x <= 1024; x += 64) {
      const my = 80 + Math.sin(x * 0.015) * 45 + Math.cos(x * 0.035) * 25;
      cctx.lineTo(x, my);
    }
    cctx.lineTo(1024, 256);
    cctx.lineTo(0, 256);
    cctx.closePath();
    cctx.fill();

    // 近处现代化都市楼宇轮廓
    for (let x = 0; x < 1024; x += 26) {
      const w = 20 + Math.random() * 22;
      const h = 55 + Math.random() * 110;
      cctx.fillStyle = '#0f172a';
      cctx.fillRect(x, 256 - h, w, h);
      // 夜间写字楼灯光斑点
      for (let wy = 256 - h + 10; wy < 250; wy += 11) {
        if (Math.random() > 0.42) {
          cctx.fillStyle = Math.random() > 0.25 ? '#fde68a' : '#60a5fa';
          cctx.fillRect(x + 3 + Math.random() * (w - 7), wy, 3, 3);
        }
      }
    }

    const skylineTex = new THREE.CanvasTexture(cityCanvas);
    skylineTex.wrapS = THREE.RepeatWrapping;
    skylineTex.repeat.set(6, 1);
    const skylineMat = new THREE.MeshBasicMaterial({
      map: skylineTex,
      transparent: true,
      side: THREE.BackSide
    });
    const skylineGeom = new THREE.CylinderGeometry(560, 560, 145, 32, 1, true);
    this.skylineMesh = new THREE.Mesh(skylineGeom, skylineMat);
    this.skylineMesh.position.y = 42;
    this.skylineGroup.add(this.skylineMesh);
    this.scene.add(this.skylineGroup);
  }

  setupRainSystem() {
    const rainCount = 2800;
    const rainGeom = new THREE.BufferGeometry();
    const positions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 35;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    rainGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainMaterial = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.18,
      transparent: true,
      opacity: 0
    });
    this.rainParticles = new THREE.Points(rainGeom, this.rainMaterial);
    this.scene.add(this.rainParticles);
  }

  createRoadChunk(zOffset) {
    const chunk = new THREE.Group();
    chunk.position.z = zOffset;

    // 1. 主道路沥青路面
    const roadGeom = new THREE.PlaneGeometry(this.roadWidth, this.chunkLength);
    const roadMesh = new THREE.Mesh(roadGeom, this.roadMaterial);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.receiveShadow = (this.quality !== 'low');
    chunk.add(roadMesh);

    // 2. 双侧路肩 (含红白震荡减速标线)
    const shoulderGeom = new THREE.PlaneGeometry(CONFIG.world.shoulderWidth, this.chunkLength);
    const leftShoulder = new THREE.Mesh(shoulderGeom, this.shoulderMaterial);
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.x = -(this.roadWidth / 2 + CONFIG.world.shoulderWidth / 2);
    leftShoulder.receiveShadow = (this.quality !== 'low');
    chunk.add(leftShoulder);

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = -leftShoulder.position.x;
    chunk.add(rightShoulder);

    // 3. 车道标线
    // 黄色双实线（最左侧中央隔离带边缘）
    const yellowLineGeom = new THREE.PlaneGeometry(0.18, this.chunkLength);
    const leftYellow = new THREE.Mesh(yellowLineGeom, this.yellowLineMaterial);
    leftYellow.rotation.x = -Math.PI / 2;
    leftYellow.position.set(-this.roadWidth / 2, 0.016, 0);
    chunk.add(leftYellow);

    // 右侧实白边线
    const rightWhiteEdge = new THREE.Mesh(yellowLineGeom, this.whiteLineMaterial);
    rightWhiteEdge.rotation.x = -Math.PI / 2;
    rightWhiteEdge.position.set(this.roadWidth / 2, 0.016, 0);
    chunk.add(rightWhiteEdge);

    // 虚线车道分界线 (单向 3 车道对应 2 条分界线) 与猫眼道钉
    const dashLength = 6.0;
    const dashGap = 9.0;
    const totalDashes = Math.floor(this.chunkLength / (dashLength + dashGap));
    const dashGeom = new THREE.PlaneGeometry(0.16, dashLength);

    for (let laneIdx = 1; laneIdx < CONFIG.world.laneCount; laneIdx++) {
      const lineX = -this.roadWidth / 2 + laneIdx * CONFIG.world.laneWidth;
      const dashInst = new THREE.InstancedMesh(dashGeom, this.whiteLineMaterial, totalDashes);
      const studInst = new THREE.InstancedMesh(this.studGeom, this.roadStudMat, totalDashes);
      const dummy = new THREE.Object3D();
      dummy.rotation.x = -Math.PI / 2;

      for (let d = 0; d < totalDashes; d++) {
        const dZ = -this.chunkLength / 2 + d * (dashLength + dashGap) + dashLength / 2;
        dummy.position.set(lineX, 0.018, dZ);
        dummy.updateMatrix();
        dashInst.setMatrixAt(d, dummy.matrix);

        // 在虚线前段放置反光猫眼道钉
        const sDummy = new THREE.Object3D();
        sDummy.position.set(lineX, 0.022, dZ + dashLength * 0.45);
        sDummy.updateMatrix();
        studInst.setMatrixAt(d, sDummy.matrix);
      }
      dashInst.instanceMatrix.needsUpdate = true;
      studInst.instanceMatrix.needsUpdate = true;
      chunk.add(dashInst);
      chunk.add(studInst);
    }

    // 4. 金属防撞护栏
    const leftGuard = new THREE.Mesh(this.guardrailGeom, this.guardrailMaterial);
    leftGuard.position.set(-(this.totalWidth / 2 + 0.1), CONFIG.world.guardrailHeight, 0);
    chunk.add(leftGuard);

    const rightGuard = new THREE.Mesh(this.guardrailGeom, this.guardrailMaterial);
    rightGuard.position.set(this.totalWidth / 2 + 0.1, CONFIG.world.guardrailHeight, 0);
    chunk.add(rightGuard);

    // 护栏立柱与反光轮廓标 (InstancedMesh)
    const postCount = Math.floor(this.chunkLength / 4.0);
    const postInst = new THREE.InstancedMesh(this.postGeom, this.guardrailMaterial, postCount * 2);
    const refInst = new THREE.InstancedMesh(this.reflectorGeom, this.reflectorMat, postCount * 2);
    const postDummy = new THREE.Object3D();
    const refDummy = new THREE.Object3D();

    for (let p = 0; p < postCount; p++) {
      const pZ = -this.chunkLength / 2 + p * 4.0;
      // 左柱与反光片
      postDummy.position.set(-(this.totalWidth / 2 + 0.1), 0.52, pZ);
      postDummy.updateMatrix();
      postInst.setMatrixAt(p * 2, postDummy.matrix);

      refDummy.position.set(-(this.totalWidth / 2 + 0.04), 0.72, pZ);
      refDummy.updateMatrix();
      refInst.setMatrixAt(p * 2, refDummy.matrix);

      // 右柱与反光片
      postDummy.position.set(this.totalWidth / 2 + 0.1, 0.52, pZ);
      postDummy.updateMatrix();
      postInst.setMatrixAt(p * 2 + 1, postDummy.matrix);

      refDummy.position.set(this.totalWidth / 2 + 0.04, 0.72, pZ);
      refDummy.updateMatrix();
      refInst.setMatrixAt(p * 2 + 1, refDummy.matrix);
    }
    postInst.instanceMatrix.needsUpdate = true;
    refInst.instanceMatrix.needsUpdate = true;
    chunk.add(postInst);
    chunk.add(refInst);

    // 5. 高架大型门架指路牌 (Overhead Highway Gantry Sign)
    this.addOverheadGantry(chunk);

    // 6. 两侧流线型路灯与行道树
    this.addStreetElementsToChunk(chunk);

    // 7. 两侧自然地形草地
    const terrainGeom = new THREE.PlaneGeometry(85, this.chunkLength);
    const leftTerrain = new THREE.Mesh(terrainGeom, this.terrainMaterial);
    leftTerrain.rotation.x = -Math.PI / 2;
    leftTerrain.position.set(-(this.totalWidth / 2 + 42.5), -0.05, 0);
    chunk.add(leftTerrain);

    const rightTerrain = leftTerrain.clone();
    rightTerrain.position.x = this.totalWidth / 2 + 42.5;
    chunk.add(rightTerrain);

    this.scene.add(chunk);
    return chunk;
  }

  addOverheadGantry(chunk) {
    // 跨越 3 车道的门架立柱与横梁 (Gantry Frame)
    const gantryGroup = new THREE.Group();
    gantryGroup.position.z = -this.chunkLength * 0.45; // 位于区块前段

    const trussMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });

    // 左右主立柱
    const colGeom = new THREE.CylinderGeometry(0.18, 0.22, 6.8, 10);
    const leftCol = new THREE.Mesh(colGeom, trussMat);
    leftCol.position.set(-(this.totalWidth / 2 + 0.8), 3.4, 0);
    gantryGroup.add(leftCol);

    const rightCol = new THREE.Mesh(colGeom, trussMat);
    rightCol.position.set(this.totalWidth / 2 + 0.8, 3.4, 0);
    gantryGroup.add(rightCol);

    // 顶部双跨横梁
    const beamGeom = new THREE.BoxGeometry(this.totalWidth + 1.8, 0.35, 0.35);
    const topBeam = new THREE.Mesh(beamGeom, trussMat);
    topBeam.position.set(0, 6.4, 0);
    gantryGroup.add(topBeam);

    // 绿色主指路牌 (面向来车方向，即面向 +Z 轴)
    const signBoardGeom = new THREE.PlaneGeometry(9.2, 2.2);
    const signBoard = new THREE.Mesh(signBoardGeom, this.gantrySignMat);
    signBoard.position.set(0, 5.8, 0.22);
    gantryGroup.add(signBoard);

    // 背面金属结构板
    const signBack = new THREE.Mesh(signBoardGeom, trussMat);
    signBack.rotation.y = Math.PI;
    signBack.position.set(0, 5.8, 0.18);
    gantryGroup.add(signBack);

    chunk.add(gantryGroup);
  }

  addStreetElementsToChunk(chunk) {
    const lightCount = Math.floor(this.chunkLength / CONFIG.world.lightPoleSpacing);
    for (let i = 0; i < lightCount; i++) {
      const lz = -this.chunkLength / 2 + i * CONFIG.world.lightPoleSpacing + 10;
      // 右侧现代单臂路灯杆
      const pole = new THREE.Mesh(this.poleGeom, this.poleMaterial);
      pole.position.set(this.totalWidth / 2 + 1.2, 3.9, lz);
      chunk.add(pole);

      // 横臂
      const arm = new THREE.Mesh(this.armGeom, this.poleMaterial);
      arm.rotation.z = Math.PI / 2.75;
      arm.position.set(this.totalWidth / 2 - 0.2, 7.3, lz);
      chunk.add(arm);

      // 现代扁平 LED 发光灯头
      const bulb = new THREE.Mesh(this.bulbGeom, this.lampBulbMaterial);
      bulb.position.set(this.totalWidth / 2 - 1.3, 7.2, lz);
      chunk.add(bulb);
    }

    // 植被与行道树 (InstancedMesh)
    if (CONFIG.graphics[this.quality].instancedFoliage) {
      const treeCount = Math.floor(this.chunkLength / CONFIG.world.treeSpacing);
      const foliageInst = new THREE.InstancedMesh(this.treeFoliageGeom, this.foliageMaterial, treeCount * 2);
      const trunkInst = new THREE.InstancedMesh(this.treeTrunkGeom, this.trunkMaterial, treeCount * 2);
      const dummy = new THREE.Object3D();

      for (let t = 0; t < treeCount; t++) {
        const tz = -this.chunkLength / 2 + t * CONFIG.world.treeSpacing + Math.sin(t) * 2;
        // 左侧树
        const lx = -(this.totalWidth / 2 + 5.5 + Math.random() * 4);
        dummy.position.set(lx, 1.6, tz);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(t * 2, dummy.matrix);
        dummy.position.set(lx, 4.6, tz);
        dummy.updateMatrix();
        foliageInst.setMatrixAt(t * 2, dummy.matrix);

        // 右侧树
        const rx = this.totalWidth / 2 + 6.0 + Math.random() * 4;
        dummy.position.set(rx, 1.6, tz);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(t * 2 + 1, dummy.matrix);
        dummy.position.set(rx, 4.6, tz);
        dummy.updateMatrix();
        foliageInst.setMatrixAt(t * 2 + 1, dummy.matrix);
      }
      foliageInst.instanceMatrix.needsUpdate = true;
      trunkInst.instanceMatrix.needsUpdate = true;
      chunk.add(trunkInst);
      chunk.add(foliageInst);
    }
  }

  initRoadChunks() {
    for (let i = 0; i < this.chunkCount; i++) {
      const z = -i * this.chunkLength + this.chunkLength;
      const chunk = this.createRoadChunk(z);
      this.chunks.push(chunk);
    }
  }

  setDayNight(target, immediate = false) {
    this.targetDayNight = target ? 1 : 0;
    if (immediate) {
      this.dayNightProgress = this.targetDayNight;
      this.applyDayNightState();
    }
  }

  setWeather(weather) {
    this.currentWeather = weather;
    if (weather === 'rain') {
      this.roadMaterial.roughness = 0.25; // 湿滑镜面路面
      this.shoulderMaterial.roughness = 0.35;
      this.rainMaterial.opacity = 0.75;
    } else {
      this.roadMaterial.roughness = 0.78;
      this.shoulderMaterial.roughness = 0.85;
      this.rainMaterial.opacity = 0;
    }
  }

  applyDayNightState() {
    const p = this.dayNightProgress;
    // 雾气与天空插值
    const curFogColor = this.fogDayColor.clone().lerp(this.fogNightColor, p);
    this.scene.background.copy(curFogColor);
    this.scene.fog.color.copy(curFogColor);

    const baseDensity = this.currentWeather === 'fog' ? 0.015 : 0.0035;
    this.scene.fog.density = THREE.MathUtils.lerp(baseDensity, baseDensity * 1.8, p);

    // 光照插值
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.88, 0.12, p);
    this.dirLight.intensity = THREE.MathUtils.lerp(1.45, 0.15, p);
    this.dirLight.color.setRGB(
      THREE.MathUtils.lerp(1.0, 0.3, p),
      THREE.MathUtils.lerp(0.98, 0.45, p),
      THREE.MathUtils.lerp(0.93, 0.85, p)
    );

    // 路灯发光与高亮
    this.lampBulbMaterial.emissive.setHex(p > 0.4 ? 0xffeaad : 0x000000);
    this.lampBulbMaterial.emissiveIntensity = p * 2.8;

    // 聚光灯开启
    const showSpots = p > 0.5 && this.quality !== 'low';
    this.streetSpotLights.forEach(spot => {
      spot.visible = showSpots;
      if (showSpots) spot.intensity = p * 130;
    });
  }

  update(delta, playerZ) {
    // 1. 平滑昼夜插值
    if (Math.abs(this.dayNightProgress - this.targetDayNight) > 0.001) {
      this.dayNightProgress = THREE.MathUtils.lerp(
        this.dayNightProgress,
        this.targetDayNight,
        delta * 2.0
      );
      this.applyDayNightState();
    }

    // 2. 无限循环区块回收与前向生成 (车辆沿大地 -Z 轴前行)
    for (const chunk of this.chunks) {
      if (chunk.position.z > playerZ + this.chunkLength * 1.5) {
        let minZ = Infinity;
        for (const c of this.chunks) {
          if (c.position.z < minZ) minZ = c.position.z;
        }
        chunk.position.z = minZ - this.chunkLength;
      }
    }

    // 3. 动态调整主平行光与远景天际线跟随车辆
    this.dirLight.position.z = playerZ + 40;
    this.dirLight.target.position.z = playerZ - 30;
    this.dirLight.target.updateMatrixWorld();
    this.skylineGroup.position.z = playerZ;

    // 4. 雨滴粒子系统随车跟随与下落
    if (this.currentWeather === 'rain' && this.rainParticles) {
      const posAttr = this.rainParticles.geometry.attributes.position;
      const arr = posAttr.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= delta * 36;
        if (arr[i + 1] < 0) {
          arr[i + 1] = 30 + Math.random() * 5;
          arr[i + 2] = playerZ + (Math.random() - 0.5) * 110;
        }
      }
      posAttr.needsUpdate = true;
    }

    // 5. 动态绑定就近的几个路灯聚光灯
    if (this.dayNightProgress > 0.5 && this.streetSpotLights[0].visible) {
      for (let i = 0; i < this.streetSpotLights.length; i++) {
        const spot = this.streetSpotLights[i];
        const spotZ = Math.floor(playerZ / 40) * 40 - i * 40;
        spot.position.set(this.totalWidth / 2 - 1.3, 7.2, spotZ);
        spot.target.position.set(0, 0, spotZ - 4);
        spot.target.updateMatrixWorld();
      }
    }
  }

  getLaneX(laneIndex) {
    // 0~2 车道：中心 X 坐标 (3 车道对应 -3.75, 0, +3.75)
    const startX = -this.roadWidth / 2 + CONFIG.world.laneWidth / 2;
    return startX + laneIndex * CONFIG.world.laneWidth;
  }

  getRoadBoundaries() {
    return {
      leftGuardrailX: -(this.totalWidth / 2 + 0.1),
      rightGuardrailX: this.totalWidth / 2 + 0.1,
      leftRoadEdgeX: -this.roadWidth / 2,
      rightRoadEdgeX: this.roadWidth / 2,
      roadWidth: this.roadWidth,
      totalWidth: this.totalWidth
    };
  }

  resetRoad(playerZ = 0) {
    // 重新排列所有循环道路区块至车身周围，彻底解决重新挑战后道路消失的 Bug
    for (let i = 0; i < this.chunks.length; i++) {
      this.chunks[i].position.z = playerZ - i * this.chunkLength + this.chunkLength;
    }
    this.dirLight.position.z = playerZ + 40;
    this.dirLight.target.position.z = playerZ - 30;
    this.dirLight.target.updateMatrixWorld();
    this.skylineGroup.position.z = playerZ;

    // 重置聚光灯位置
    if (this.streetSpotLights && this.streetSpotLights.length > 0) {
      for (let i = 0; i < this.streetSpotLights.length; i++) {
        const spot = this.streetSpotLights[i];
        const spotZ = Math.floor(playerZ / 40) * 40 - i * 40;
        spot.position.set(this.totalWidth / 2 - 1.3, 7.2, spotZ);
        spot.target.position.set(0, 0, spotZ - 4);
        spot.target.updateMatrixWorld();
      }
    }

    // 重置雨滴粒子分布
    if (this.rainParticles) {
      const posAttr = this.rainParticles.geometry.attributes.position;
      const arr = posAttr.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] = Math.random() * 30;
        arr[i + 2] = playerZ + (Math.random() - 0.5) * 110;
      }
      posAttr.needsUpdate = true;
    }
  }
}
