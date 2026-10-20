# Autonomous Driving Experience (智能驾驶体验小游戏)

A browser-native 3D Autonomous Vehicle simulation game powered by **Three.js (r160) + WebGL**.
Zero external 3D models, textures, or audio files required — all vehicles, roads, and environments are procedurally generated, and all audio is synthesized via WebAudio API in real-time.

---
## 🚀 本地启动与测试方式 (Local Development)

### 方式一：Node.js 原生一键启动（支持根目录与子路径测试）
本项目自带轻量静态服务器 `server.js`，无需安装任何第三方 npm 包：
```bash
node server.js
```
终端将输出：
```text
Server running at http://localhost:8080/
```
- **根路径访问**：浏览器访问 `http://localhost:8080/`
- **模拟 GitHub Pages 二级子路径访问**：浏览器访问 `http://localhost:8080/car-game/`

### 方式二：npx serve / VS Code Live Server
```bash
npx serve .
# 或使用 VS Code 的 "Live Server" 插件右键 index.html 点击 "Open with Live Server"
```

---

## 🎮 操作说明与键位映射 (Controls Guide)

| Key | Action | Description |
| :--- | :--- | :--- |
| <kbd>W</kbd> / <kbd>↑</kbd> | Throttle / Accelerate | Drives forward with progressive torque & dynamic engine RPM sound |
| <kbd>S</kbd> / <kbd>↓</kbd> | Brake / Reverse | Applies hydraulic braking; hold after stopping to shift to Reverse (R) |
| <kbd>A</kbd> / <kbd>←</kbd> | Steer Left | Turns steering wheel left; automatic high-speed damping |
| <kbd>D</kbd> / <kbd>→</kbd> | Steer Right | Turns steering wheel right; spring-loaded centering |
| <kbd>Space</kbd> | Handbrake | Locks rear wheels (reduces lateral grip by 80%) for controllable drifting |
| <kbd>C</kbd> | Toggle ADAS | Engages / disengages Autonomous Driving (ACC + LKA + AES) |
| <kbd>V</kbd> | Switch View | Smoothly transitions between Cockpit (FPV) and Chase View (TPV) |
| <kbd>N</kbd> | Day / Night | Smooth lighting, fog, and streetlights transition |
| <kbd>L</kbd> | Toggle Headlights | Casts dual realistic SpotLights and high-intensity taillights |
| <kbd>Q</kbd> / <kbd>E</kbd> | Turn Signals | Toggles left/right amber blinkers with synthesized relay click |
| <kbd>ESC</kbd> | Pause Menu | Opens pause overlay, settings panel, and retry options |

> 💡 **Gamepad Support**: Supports Gamepad API automatically (left thumbstick steer, RT throttle, LT brake, A handbrake).

---

## ⚙️ 核心智驾参数说明 (ADAS Parameters)

用户可在顶部菜单或按 ESC 进入设置面板，实时调节以下算法参数：

1. **Cruise Speed (巡航车速)**: `30 ~ 130 km/h`
   - ADAS 期望维持的目标道路巡航车速，受前车车速与前方障碍动态调节。
2. **Time Headway Level (跟车时距等级)**: `0.8s ~ 3.0s (Level 1~5)`
   - 决定与前车保持的纵向时间距离：$\text{Target Gap} = d_0 + \text{Headway} \times v$。
3. **Driving Style (驾驶风格)**:
   - **Conservative**: 加大制动提前量与避障裕度，加减速平稳。
   - **Standard**: 兼顾效率与安全性的行业标准自适应控制。
   - **Aggressive**: 变道间隙紧凑、动力响应敏锐。
4. **Sensor Sensitivity (传感器灵敏度)**:
   - **Low**: 探测距离约 80m，反应延迟约 280ms，夜间识别较晚。
   - **Medium**: 标准探测距离 130m，延迟约 160ms。
   - **High**: 高精度长距感知 180m，延迟仅 60ms。
5. **AEB (自动紧急制动)**:
   - 实时计算 TTC (Time To Collision)。当 TTC 跌入危险临界区时触发全额紧急制动。
6. **LKA Strength (车道居中保持强度)**: `0.2x ~ 2.0x`
   - PID 控制纠偏横向打角回正力度。
7. **AES (主动紧急避障与自动变道)**:
   - 融合周边 NPC 车流与道路突发障碍物（碰撞残骸、掉落木箱货包、废旧轮胎、抛锚黑车与横穿目标）。
   - 当探测到前方车道有阻挡时，在安全距离内**第一时间开启转向灯、果断向左/向右安全相邻车道执行紧急闪避变道绕行**。
8. **Cut-in Tolerance (加塞容忍度)**: `0.5 ~ 2.0`
   - 控制对旁车侧向切入时的减速让行时机。
9. **Flawless Mode (无失误理想模式)**:
   - 醒目开关。开启后采用零延迟、零噪声的 250m 理想感知与全局最优避险决策，所有突发事件均能被安全化解。

---

## 💥 失误机制与因果归因 (Accident Mechanics)

事故发生受物理运动学、感知滞后与调参因果驱动：
1. **车体 3D 碰撞体积检测**：包含玩家与所有 NPC 车辆之间的 AABB 3D 碰撞盒检测、与左右外侧金属防撞护栏的碰撞检测，以及路面障碍物的碰撞检测。
2. **车体物理反馈**：撞击声、红屏震动闪烁、低速弹性回弹刮擦、高速事故判定。
3. **事故深度分析报告**：详细解析撞击车速、当时时距、环境与传感器感知滞后时间，指出失误核心诱因（前车追尾、侧向加塞擦碰或护栏失控偏航）并给出精准的调参改进方案。
4. **事故前 5 秒慢动作复盘**：点击「5s Slow-Motion Replay」，系统利用车辆位姿历史环形缓冲区以 0.35x 慢速重演事故前轨迹。

---

## 📂 项目模块结构 (File Structure)

- `index.html`：项目根入口，配置 importmap、HUD 仪表盘结构与各弹窗组件。
- `style.css`：现代半透明玻璃拟态视觉、全分辨率自适应响应式布局。
- `config.js`：全局集中数值配置文件（物理参数、道路规格、智驾配置、画质与难度预设）。
- `i18n.js`：纯英文国际化字典管理模块（即时生效、参数化模板插值、localStorage 保存）。
- `audio.js`：WebAudio 纯代码音效合成器（引擎声浪、转向灯、撞击、预警蜂鸣、接管提示音）。
- `camera.js`：第一人称驾驶舱与第三人称跟随视角平滑过渡、速度拉伸动态 FOV。
- `vehicle.js`：流线型金属漆跑车、数字液晶仪表、中控导航屏、后视镜、防穿模控制与真实二自由度轮胎动力学。
- `world.js`：多车道无限循环公路、InstancedMesh 路灯与树木、天际线、昼夜平滑过渡与高架指路门架。
- `traffic.js`：4 种车型建模、交通流 IDM 跟驰与变道 AI、夜间灯光。
- `adas.js`：智能驾驶系统状态机（ACC、LKA、AEB、ALC、AES、感知噪声与延迟、无失误模式）。
- `events.js`：8 类道路难题调度器（车祸、急刹、加塞、横穿、掉落物等）、阶段追踪与事故归因。
- `ui.js`：HUD 仪表渲染、360° 态势雷达、事件提示横幅与弹窗控制。
- `main.js`：主游戏状态机编排、固定 1/60 秒物理更新步长、输入捕获与生命周期管理。
- `server.js`：支持根路径与 `/car-game/` 子路径测试的本地静态服务器。
- `PLAN.md`：架构设计书、开发计划与全部 R1~R12 需求逐条验收表。

---

## 📜 许可证与技术栈 (Tech Stack)
- **3D 引擎**：Three.js (r160, 本地固化于 `./libs/three.module.js`)
- **渲染技术**：WebGL, ACESFilmicToneMapping, PCFSoftShadowMap, InstancedMesh
- **音频技术**：WebAudio API 纯代码实时合成
- **模块规范**：ECMAScript Modules (ESM) + Import Maps
