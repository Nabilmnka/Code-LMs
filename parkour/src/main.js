import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/PointerLockControls.js';

// ---------- Utility ----------
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const vec3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);

// ---------- Renderer & Scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f3f5);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 500);

const controls = new PointerLockControls(camera, renderer.domElement);

// ---------- Lighting ----------
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(40, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 200;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// ---------- Materials ----------
const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.0 });
const navRed = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.4, metalness: 0.0, emissive: 0x110000, emissiveIntensity: 0.4 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.95, transparent: true, opacity: 0.9 });

// ---------- Level Generation ----------
const colliders = []; // meshes used for collision raycasts
const checkpoints = [];

function addBox(w, h, d, x, y, z, material = white, withCollider = true, receiveShadow = true, castShadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h/2, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  scene.add(mesh);
  if (withCollider) colliders.push(mesh);
  return mesh;
}

function addPlatform(w, h, d, x, y, z, colorMat = white) {
  const base = addBox(w, h, d, x, y, z, colorMat, true, true, false);
  // top accent strip
  const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.04, d * 0.98), navRed);
  top.position.set(x, y + h + 0.02, z);
  top.receiveShadow = false;
  scene.add(top);
  return base;
}

function createCityCourse() {
  // Start platform
  addPlatform(20, 1, 20, 0, 0, 0);

  // Linear path with alternative routes
  let cursorZ = -15;
  for (let i = 0; i < 6; i++) {
    const shiftX = (i % 2 === 0) ? 0 : 6;
    addPlatform(16, 1, 12, shiftX, 0, cursorZ);
    // walls on sides for wall-run
    addBox(1, 4, 12, shiftX - 8.5, 1, cursorZ, white, true, true, true);
    addBox(1, 4, 12, shiftX + 8.5, 1, cursorZ, white, true, true, true);
    // elevated fast route
    if (i % 2 === 1) {
      addPlatform(8, 1, 8, shiftX + 10, 2.5, cursorZ - 6);
      addBox(1, 5, 8, shiftX + 14.5, 2.5, cursorZ - 6, white, true);
    }
    // gaps
    cursorZ -= 16 + (i * 1.5);
  }

  // Vertical section with wall run and climb
  addPlatform(10, 1, 10, -10, 0, cursorZ - 10);
  addBox(1, 8, 6, -15.5, 0.5, cursorZ - 10, white, true); // left wall
  addBox(1, 8, 6, -4.5, 0.5, cursorZ - 10, white, true); // right wall
  addPlatform(8, 1, 8, -10, 4.5, cursorZ - 26); // higher

  // Rooftop garden props (non-colliding aesthetics)
  for (let i = 0; i < 10; i++) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.6, 24), white);
    pot.position.set((Math.random()-0.5)*30, 0.3, -40 + Math.random()*-80);
    pot.castShadow = true; pot.receiveShadow = true; scene.add(pot);
  }

  // Tall towers (background)
  for (let i = 0; i < 6; i++) {
    const h = 40 + Math.random() * 60;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(6, h, 6), white);
    tower.position.set(-60 + i*20, h/2, -120 - i*30);
    tower.castShadow = true; tower.receiveShadow = true;
    scene.add(tower);
  }

  // Checkpoints
  addCheckpoint(vec3(0, 2, 4));
  addCheckpoint(vec3(6, 2, -30));
  addCheckpoint(vec3(10, 4, -70));
  addCheckpoint(vec3(-10, 6, cursorZ - 26));
}

function addCheckpoint(pos) {
  const geo = new THREE.TorusGeometry(0.8, 0.08, 16, 64);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff7a00 });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.copy(pos);
  ring.rotation.x = Math.PI / 2;
  ring.userData.isCheckpoint = true;
  scene.add(ring);
  checkpoints.push(ring);
}

createCityCourse();

// ---------- Player Controller ----------
const player = {
  position: vec3(0, 2.2, 6),
  velocity: vec3(0, 0, 0),
  height: 1.8,
  radius: 0.35,
  onGround: false,
  isSliding: false,
  isWallRunning: false,
  wallNormal: vec3(),
  wallRunTime: 0,
  isLedgeGrabbing: false,
  ledgeTarget: vec3(),
  momentum: 0, // 0..1 fraction
  lastCheckpoint: vec3(0, 2.2, 6)
};

camera.position.copy(player.position).add(vec3(0, 0.2, 0));
controls.getObject().position.copy(camera.position);
scene.add(controls.getObject());

const input = { forward:0, right:0, jump:false, crouch:false, use:false };

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW') input.forward = 1;
  if (e.code === 'KeyS') input.forward = -1;
  if (e.code === 'KeyA') input.right = -1;
  if (e.code === 'KeyD') input.right = 1;
  if (e.code === 'Space') input.jump = true;
  if (e.code === 'ControlLeft') input.crouch = true;
  if (e.code === 'KeyE') input.use = true;
  if (e.code === 'KeyR') respawn();
  if (e.code === 'KeyT') toggleTimer();
});

window.addEventListener('keyup', (e) => {
  if ([ 'KeyW','KeyS' ].includes(e.code)) input.forward = 0;
  if ([ 'KeyA','KeyD' ].includes(e.code)) input.right = 0;
  if (e.code === 'Space') input.jump = false;
  if (e.code === 'ControlLeft') input.crouch = false;
  if (e.code === 'KeyE') input.use = false;
});

// pointer lock
const overlay = document.getElementById('overlay');
overlay.addEventListener('click', async () => {
  controls.lock();
  overlay.style.display = 'none';
  startAudio();
  startTimer();
});

controls.addEventListener('lock', () => {});
controls.addEventListener('unlock', () => {
  overlay.style.display = 'flex';
});

// ---------- HUD ----------
const timerEl = document.getElementById('timer');
const momentumBar = document.getElementById('bar');

let timerRunning = false;
let startTime = 0;
let elapsed = 0;
function startTimer(){ timerRunning = true; startTime = performance.now() - elapsed; }
function stopTimer(){ timerRunning = false; elapsed = performance.now() - startTime; }
function resetTimer(){ startTime = performance.now(); elapsed = 0; timerRunning = true; }
function toggleTimer(){ if (timerRunning) stopTimer(); else startTimer(); }

function formatTime(ms){
  const t = Math.floor(ms);
  const minutes = Math.floor(t/60000);
  const seconds = Math.floor((t%60000)/1000);
  const millis = t%1000;
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
}

// ---------- Audio (dynamic intensity) ----------
let audioCtx = null;
let masterGain, bass, hat, arp, speedAnalyser;

function startAudio(){
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.2;
  masterGain.connect(audioCtx.destination);

  // Bass: pulsing saw + lowpass
  const bassOsc = audioCtx.createOscillator();
  bassOsc.type = 'sawtooth';
  const bassGain = audioCtx.createGain();
  const bassFilter = audioCtx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 200;
  bassOsc.connect(bassFilter).connect(bassGain).connect(masterGain);
  bassOsc.start();
  bass = { osc: bassOsc, filter: bassFilter, gain: bassGain };

  // Hi-hat noise
  const bufferSize = 2 * audioCtx.sampleRate;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer; noise.loop = true; noise.start();
  const hatFilter = audioCtx.createBiquadFilter(); hatFilter.type = 'highpass'; hatFilter.frequency.value = 7000;
  const hatGain = audioCtx.createGain(); hatGain.gain.value = 0.05;
  noise.connect(hatFilter).connect(hatGain).connect(masterGain);
  hat = { filter: hatFilter, gain: hatGain };

  // Arp tone for momentum
  const arpOsc = audioCtx.createOscillator(); arpOsc.type = 'triangle'; arpOsc.frequency.value = 220;
  const arpGain = audioCtx.createGain(); arpGain.gain.value = 0.0;
  arpOsc.connect(arpGain).connect(masterGain); arpOsc.start();
  arp = { osc: arpOsc, gain: arpGain };
}

function updateMusic(speedRatio, dt){
  if (!audioCtx) return;
  const cutoff = lerp(200, 1200, speedRatio);
  bass.filter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.05);
  bass.gain.gain.setTargetAtTime(lerp(0.08, 0.18, speedRatio), audioCtx.currentTime, 0.05);
  hat.gain.gain.setTargetAtTime(lerp(0.03, 0.12, speedRatio), audioCtx.currentTime, 0.05);
  arp.osc.frequency.setTargetAtTime(lerp(220, 660, speedRatio), audioCtx.currentTime, 0.05);
  arp.gain.gain.setTargetAtTime(lerp(0.0, 0.15, speedRatio), audioCtx.currentTime, 0.05);
}

// ---------- Collision / Raycasting helpers ----------
const raycaster = new THREE.Raycaster();
const tmpVec = vec3();
const tmpVec2 = vec3();
const up = vec3(0,1,0);

function groundProbe(origin, maxDist=2.5) {
  raycaster.set(origin, vec3(0,-1,0));
  raycaster.far = maxDist;
  const hits = raycaster.intersectObjects(colliders, false);
  if (hits.length) return hits[0];
  return null;
}

function wallProbe(origin, dir, maxDist=0.7){
  raycaster.set(origin, dir.clone().normalize());
  raycaster.far = maxDist;
  const hits = raycaster.intersectObjects(colliders, false);
  if (hits.length) return hits[0];
  return null;
}

function resolveHorizontalCollisions() {
  // Cast in the horizontal velocity direction to prevent getting inside walls
  const horizVel = player.velocity.clone(); horizVel.y = 0;
  const speed = horizVel.length();
  if (speed < 0.0001) return;
  const dir = horizVel.clone().normalize();
  const origin = player.position.clone(); origin.y += player.height * 0.4;
  const hit = wallProbe(origin, dir, player.radius + 0.2);
  if (hit) {
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    // Slide along the wall
    const vn = dir.dot(n);
    const slideDir = dir.clone().sub(n.clone().multiplyScalar(vn)).normalize();
    const mag = speed * (1 - Math.abs(vn));
    player.velocity.x = slideDir.x * mag;
    player.velocity.z = slideDir.z * mag;
    // Push out of wall
    player.position.add(n.multiplyScalar(0.01));
  }
}

function detectWallRun() {
  if (player.onGround || player.isLedgeGrabbing) return false;
  // sample left and right
  const chest = player.position.clone(); chest.y += 1.0;
  const forward = getForwardOnPlane();
  const right = forward.clone().cross(up).normalize();
  const leftHit = wallProbe(chest, right.clone().multiplyScalar(-1), 0.6);
  const rightHit = wallProbe(chest, right, 0.6);
  const along = forward.clone(); along.y = 0; along.normalize();
  let hit = null; let normal = null;
  if (leftHit) { hit = leftHit; normal = leftHit.face.normal.clone().transformDirection(leftHit.object.matrixWorld).normalize(); }
  else if (rightHit) { hit = rightHit; normal = rightHit.face.normal.clone().transformDirection(rightHit.object.matrixWorld).normalize(); }
  if (!hit) return false;
  // Ensure wall is roughly vertical
  if (Math.abs(normal.y) > 0.2) return false;
  // Attach
  player.isWallRunning = true;
  player.wallNormal.copy(normal);
  player.wallRunTime = 0;
  // Stick to wall a little
  player.position.add(normal.clone().multiplyScalar( - (player.radius - 0.02) ));
  return true;
}

function attemptLedgeGrab(){
  if (player.onGround || player.isWallRunning || player.isLedgeGrabbing) return false;
  const forward = getForwardOnPlane();
  const head = player.position.clone(); head.y += player.height * 0.9;
  const chest = player.position.clone(); chest.y += player.height * 0.5;
  const front = wallProbe(head, forward, 0.6);
  if (!front) return false;
  const n = front.face.normal.clone().transformDirection(front.object.matrixWorld).normalize();
  if (Math.abs(n.y) > 0.2) return false; // vertical wall
  // check top clearance
  const topPoint = front.point.clone().add(vec3(0, 0.6, 0)).add(n.clone().multiplyScalar(0.05));
  const downCheck = groundProbe(topPoint, 1.2);
  if (!downCheck) return false;
  // Move target to top of ledge
  player.isLedgeGrabbing = true;
  player.ledgeTarget.copy(downCheck.point).add(vec3(0, player.height*0.5, 0));
  return true;
}

function ledgeGrabUpdate(dt){
  const to = player.ledgeTarget.clone().sub(player.position);
  const dist = to.length();
  if (dist < 0.05) {
    player.isLedgeGrabbing = false; player.onGround = true; player.velocity.set(0,0,0);
    return;
  }
  to.normalize();
  const speed = 2.5;
  player.position.add(to.multiplyScalar(speed * dt));
  player.velocity.set(0,0,0);
}

function getForwardOnPlane(){
  // camera forward projected on XZ plane
  const forward = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  forward.y = 0; forward.normalize();
  return forward;
}

function updatePlayer(dt) {
  const forward = getForwardOnPlane();
  const right = forward.clone().cross(up).normalize();

  // Input vector
  const inputDir = vec3();
  inputDir.addScaledVector(forward, input.forward);
  inputDir.addScaledVector(right, input.right);
  if (inputDir.lengthSq() > 0) inputDir.normalize();

  const accel = 25;
  const airAccel = 8;
  const maxSpeed = 9;
  const gravity = 22;

  // Sliding toggle
  if (player.onGround && input.crouch && player.velocity.clone().setY(0).length() > 6) {
    player.isSliding = true;
  }
  if (!input.crouch) player.isSliding = false;

  // Ledge grab attempt
  if (input.use) attemptLedgeGrab();

  // Wall run attempt
  if (!player.isWallRunning && !player.onGround) detectWallRun();

  // Wall running
  if (player.isWallRunning) {
    player.wallRunTime += dt;
    // run along wall direction (cross of normal and up gives wall direction)
    const along = up.clone().cross(player.wallNormal).normalize();
    const desired = along.clone().multiplyScalar(input.forward - input.right).normalize();
    if (desired.lengthSq() > 0) {
      player.velocity.addScaledVector(desired, airAccel * dt * 2);
    }
    // stick to wall: cancel component away from wall
    const away = player.velocity.dot(player.wallNormal);
    if (away > -2) player.velocity.addScaledVector(player.wallNormal, -away);
    // reduce gravity
    player.velocity.y -= gravity * 0.25 * dt;
    // jump from wall
    if (input.jump) {
      const jumpDir = player.wallNormal.clone().multiplyScalar(6).add(up.clone().multiplyScalar(7));
      player.velocity.add(jumpDir);
      player.isWallRunning = false;
      input.jump = false;
    }
    // timeout
    if (player.wallRunTime > 1.2) player.isWallRunning = false;
  } else if (player.isLedgeGrabbing) {
    ledgeGrabUpdate(dt);
  } else {
    // Regular movement
    const curAccel = player.onGround ? accel : airAccel;
    player.velocity.addScaledVector(inputDir, curAccel * dt);
    // Friction when grounded
    if (player.onGround && inputDir.lengthSq() === 0) {
      player.velocity.x *= 0.9; player.velocity.z *= 0.9;
    }
    // Gravity
    player.velocity.y -= gravity * dt;
  }

  // Jump and long jump
  if (player.onGround && input.jump) {
    const horizontalSpeed = player.velocity.clone().setY(0).length();
    const longBoost = clamp((horizontalSpeed - 6) * 0.25, 0, 3);
    player.velocity.y = 7.5 + longBoost;
    input.jump = false; player.onGround = false;
  }

  // Sliding drag and speed carry
  if (player.isSliding) {
    player.velocity.multiplyScalar(1.01);
    player.velocity.y -= gravity * dt * 0.3; // slight pull
  }

  // Clamp horizontal speed
  const horiz = player.velocity.clone(); horiz.y = 0;
  const speed = horiz.length();
  const limit = maxSpeed * (player.isSliding ? 1.3 : 1);
  if (speed > limit) {
    horiz.normalize().multiplyScalar(limit);
    player.velocity.x = horiz.x; player.velocity.z = horiz.z;
  }

  // Integrate position
  player.position.addScaledVector(player.velocity, dt);

  // Ground resolution
  const probeOrigin = player.position.clone();
  probeOrigin.y += player.height * 0.5;
  const ground = groundProbe(probeOrigin, 2.5);
  const wasGrounded = player.onGround;
  player.onGround = false;
  if (ground) {
    const dist = (probeOrigin.y) - ground.point.y;
    const desired = player.height * 0.5 + 0.02;
    if (dist < desired) {
      player.onGround = true; player.isWallRunning = false; player.isLedgeGrabbing = false;
      // snap to ground
      player.position.y = ground.point.y + desired;
      // cancel vertical velocity downward when grounded
      if (player.velocity.y < 0) player.velocity.y = 0;
    }
  }

  resolveHorizontalCollisions();

  // Momentum indicator based on speed fraction
  const momentum = clamp(speed / (maxSpeed*1.2), 0, 1);
  player.momentum = lerp(player.momentum, momentum, 0.08);
  momentumBar.style.width = `${Math.floor(player.momentum * 100)}%`;

  // Camera follows player
  const camTarget = player.position.clone();
  camTarget.y += player.isSliding ? 0.6 : 1.0;
  camera.position.lerp(camTarget, 0.35);

  // Checkpoint rings
  for (const ring of checkpoints) {
    if (!ring.visible) continue;
    if (ring.position.distanceTo(player.position) < 1.0) {
      ring.visible = false;
      player.lastCheckpoint.copy(player.position);
    }
  }

  // Fall reset
  if (player.position.y < -20) respawn();

  updateMusic(player.momentum, dt);
}

function respawn(){
  player.position.copy(player.lastCheckpoint);
  player.velocity.set(0,0,0);
  player.onGround = false; player.isSliding = false; player.isWallRunning = false; player.isLedgeGrabbing = false;
}

// ---------- Render Loop ----------
let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  updatePlayer(dt);
  if (timerRunning) timerEl.textContent = formatTime(now - startTime);
  renderer.render(scene, camera);
}
animate();

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});