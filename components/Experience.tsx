import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { ExperienceMode, State } from '../types';

class Particle {
  mesh: THREE.Object3D;
  type: 'BOX' | 'SPHERE' | 'CANDY' | 'PHOTO';
  targetPos: THREE.Vector3 = new THREE.Vector3();
  randomVelocity: THREE.Vector3 = new THREE.Vector3(
    (Math.random() - 0.5) * 0.04,
    (Math.random() - 0.5) * 0.04,
    (Math.random() - 0.5) * 0.04
  );
  initialScale: THREE.Vector3;
  id: string;

  constructor(mesh: THREE.Object3D, type: 'BOX' | 'SPHERE' | 'CANDY' | 'PHOTO') {
    this.mesh = mesh;
    this.type = type;
    this.initialScale = mesh.scale.clone();
    this.id = Math.random().toString(36).substring(7);
  }

  update(mode: ExperienceMode, focusTargetId: string | null) {
    const isFocusTarget = focusTargetId === this.id;
    
    // Position LERP
    this.mesh.position.lerp(this.targetPos, 0.08);

    // Scale Logic for modes
    if (mode === ExperienceMode.FOCUS) {
      if (this.type === 'PHOTO') {
        if (isFocusTarget) {
          const focusScale = this.initialScale.clone().multiplyScalar(4.5);
          this.mesh.scale.lerp(focusScale, 0.1);
          // Face camera
          this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, 0, 0.1);
        } else {
          this.mesh.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), 0.1);
        }
      } else {
        this.mesh.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), 0.1);
      }
    } else {
      this.mesh.scale.lerp(this.initialScale, 0.1);
    }

    // Rotation Logic
    if (mode === ExperienceMode.SCATTER) {
      this.mesh.rotation.x += this.randomVelocity.x;
      this.mesh.rotation.y += this.randomVelocity.y;
      this.mesh.rotation.z += this.randomVelocity.z;
    } else {
      // Return to upright slowly
      this.mesh.rotation.x *= 0.92;
      this.mesh.rotation.z *= 0.92;
    }
  }
}

export default class Experience {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private mainGroup: THREE.Group;
  private particles: Particle[] = [];
  private dustPoints: THREE.Points;
  private handLandmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private lastVideoTime = -1;
  private state: State = {
    mode: ExperienceMode.TREE,
    handX: 0,
    handY: 0,
    pinchDetected: false,
    fistDetected: false,
    openHandDetected: false,
    controlsVisible: true
  };
  private focusTargetId: string | null = null;
  private onReady: () => void;
  private animationId: number = 0;

  constructor(container: HTMLDivElement, onReady: () => void) {
    this.onReady = onReady;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 2, 50);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 2.2;
    container.appendChild(this.renderer.domElement);

    // Environment map
    const pmremGenerator = new PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    this.mainGroup = new THREE.Group();
    this.scene.add(this.mainGroup);

    this.setupPostProcessing();
    this.setupLights();
    this.initContent();
    this.setupMediaPipe();
    
    window.addEventListener('resize', this.onResize);
    this.animate();
  }

  private setupPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.45, // strength
      0.4,  // radius
      0.7   // threshold
    );
    this.composer.addPass(bloomPass);
  }

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const internalLight = new THREE.PointLight(0xffa500, 2);
    this.mainGroup.add(internalLight);

    const goldSpot = new THREE.SpotLight(0xd4af37, 1200);
    goldSpot.position.set(30, 40, 40);
    this.scene.add(goldSpot);

    const blueSpot = new THREE.SpotLight(0x4488ff, 600);
    blueSpot.position.set(-30, 20, -30);
    this.scene.add(blueSpot);
  }

  private createCandyCaneTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    // Base white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    
    // Red diagonal stripes
    ctx.fillStyle = '#ff0000';
    const stripeWidth = 40;
    const gap = 80;
    for (let i = -256; i < 512; i += gap) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + stripeWidth, 0);
      ctx.lineTo(i + stripeWidth + 256, 256);
      ctx.lineTo(i + 256, 256);
      ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    return texture;
  }

  private initContent() {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.1 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x054a29, metalness: 0.2, roughness: 0.8 });
    const sphereGoldMat = new THREE.MeshPhysicalMaterial({ 
      color: 0xd4af37, metalness: 1, roughness: 0, clearcoat: 1.0 
    });
    const sphereRedMat = new THREE.MeshPhysicalMaterial({ 
      color: 0xaa0000, metalness: 0.3, roughness: 0.1, clearcoat: 1.0 
    });
    const candyMat = new THREE.MeshStandardMaterial({ map: this.createCandyCaneTexture() });

    // 1500 Main Particles
    for (let i = 0; i < 1500; i++) {
      let mesh: THREE.Mesh;
      let type: 'BOX' | 'SPHERE' | 'CANDY' = 'BOX';
      
      const rand = Math.random();
      if (rand < 0.5) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), Math.random() > 0.4 ? goldMat : greenMat);
        type = 'BOX';
      } else if (rand < 0.85) {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), Math.random() > 0.5 ? sphereGoldMat : sphereRedMat);
        type = 'SPHERE';
      } else {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 1.2, 0),
          new THREE.Vector3(0.4, 1.5, 0),
          new THREE.Vector3(0.7, 1.2, 0),
        ]);
        mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.08, 8, false), candyMat);
        type = 'CANDY';
      }
      
      mesh.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
      this.mainGroup.add(mesh);
      this.particles.push(new Particle(mesh, type));
    }

    // Default Photo
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = 512;
    photoCanvas.height = 512;
    const pctx = photoCanvas.getContext('2d')!;
    pctx.fillStyle = '#050505';
    pctx.fillRect(0,0,512,512);
    pctx.fillStyle = '#d4af37';
    pctx.font = 'bold 52px Cinzel';
    pctx.textAlign = 'center';
    pctx.fillText('JOYEUX NOEL', 256, 256);
    pctx.strokeStyle = '#d4af37';
    pctx.lineWidth = 15;
    pctx.strokeRect(30, 30, 452, 452);
    this.addPhotoToScene(new THREE.CanvasTexture(photoCanvas));

    // 2500 Dust
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(2500 * 3);
    for (let i = 0; i < 2500 * 3; i++) {
      dustPositions[i] = (Math.random() - 0.5) * 100;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0xfceea7, size: 0.1, transparent: true, opacity: 0.6 })
    );
    this.scene.add(this.dustPoints);

    this.calculateTargets();
    this.onReady();
  }

  public addPhotoToScene(texture: THREE.Texture) {
    const frameGeo = new THREE.BoxGeometry(3.5, 3.5, 0.2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });
    const photoGeo = new THREE.PlaneGeometry(3.2, 3.2);
    const photoMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });

    const group = new THREE.Group();
    const frame = new THREE.Mesh(frameGeo, frameMat);
    const photo = new THREE.Mesh(photoGeo, photoMat);
    photo.position.z = 0.11;
    group.add(frame);
    group.add(photo);

    this.mainGroup.add(group);
    this.particles.push(new Particle(group, 'PHOTO'));
    this.calculateTargets();
  }

  private calculateTargets() {
    const { mode } = this.state;
    const maxRadius = 14;
    const height = 28;

    const photos = this.particles.filter(p => p.type === 'PHOTO');
    if (mode === ExperienceMode.FOCUS) {
      if (!this.focusTargetId && photos.length > 0) {
        this.focusTargetId = photos[Math.floor(Math.random() * photos.length)].id;
      }
    } else {
      this.focusTargetId = null;
    }

    this.particles.forEach((p, i) => {
      if (mode === ExperienceMode.TREE) {
        const t = i / this.particles.length;
        const radius = maxRadius * (1 - t);
        const angle = t * 50 * Math.PI;
        p.targetPos.set(
          Math.cos(angle) * radius,
          t * height - height/2,
          Math.sin(angle) * radius
        );
      } else if (mode === ExperienceMode.SCATTER) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 10 + Math.random() * 15;
        p.targetPos.set(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        );
      } else if (mode === ExperienceMode.FOCUS) {
        if (p.id === this.focusTargetId) {
          p.targetPos.set(0, 2, 35);
        } else {
          // Push others far away
          const angle = Math.random() * Math.PI * 2;
          const r = 40 + Math.random() * 20;
          p.targetPos.set(Math.cos(angle) * r, (Math.random() - 0.5) * 40, Math.sin(angle) * r);
        }
      }
    });
  }

  private async setupMediaPipe() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });

      this.video = document.getElementById("webcam") as HTMLVideoElement;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120 } });
      if (this.video) {
        this.video.srcObject = stream;
        this.video.onloadedmetadata = () => this.video?.play();
      }
    } catch (e) {
      console.warn("MediaPipe init failed. Interaction limited.", e);
    }
  }

  private processGestures() {
    if (!this.handLandmarker || !this.video || this.video.readyState < 2) return;

    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.handLandmarker.detectForVideo(this.video, performance.now());
      
      if (results.landmarks && results.landmarks.length > 0) {
        const lms = results.landmarks[0];
        const thumb = lms[4];
        const index = lms[8];
        const wrist = lms[0];
        const tips = [lms[12], lms[16], lms[20], index];

        // Center landmark 9 for mapping
        const center = lms[9];
        this.state.handX = (center.x - 0.5) * 2;
        this.state.handY = (center.y - 0.5) * 2;

        const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
        const avgTipDist = tips.reduce((acc, t) => acc + Math.hypot(t.x - wrist.x, t.y - wrist.y), 0) / 4;

        let newMode = this.state.mode;
        if (pinchDist < 0.05) newMode = ExperienceMode.FOCUS;
        else if (avgTipDist < 0.25) newMode = ExperienceMode.TREE;
        else if (avgTipDist > 0.4) newMode = ExperienceMode.SCATTER;

        if (newMode !== this.state.mode) {
          this.state.mode = newMode;
          this.calculateTargets();
        }
      }
    }
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    this.processGestures();

    // Map rotation
    this.mainGroup.rotation.y = THREE.MathUtils.lerp(this.mainGroup.rotation.y, this.state.handX * 1.5, 0.05);
    this.mainGroup.rotation.x = THREE.MathUtils.lerp(this.mainGroup.rotation.x, this.state.handY * 0.8, 0.05);

    this.particles.forEach(p => p.update(this.state.mode, this.focusTargetId));
    
    this.dustPoints.rotation.y += 0.001;
    this.composer.render();
  };

  public destroy() {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    if (this.video?.srcObject) {
      (this.video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
  }
}