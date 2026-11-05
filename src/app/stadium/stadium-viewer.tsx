"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { StadiumLayout } from "./page";
import { getStadiumTierColor } from "./stadium-palette";
import styles from "./stadium.module.css";

const selectedColor = new THREE.Color("#fff0b5");
const tierColorCache = new Map<string, THREE.Color>();

function colorForTier(tier: string) {
  let color = tierColorCache.get(tier);
  if (!color) {
    color = new THREE.Color(getStadiumTierColor(tier));
    tierColorCache.set(tier, color);
  }
  return color;
}

function addTierStructure(
  scene: THREE.Scene,
  innerRadius: [number, number],
  outerRadius: [number, number],
  bottomHeight: number,
  topHeight: number,
  color: string,
) {
  const vertices: number[] = [];
  const segments = 128;
  const point = (
    radius: [number, number],
    angle: number,
    height: number,
  ) => new THREE.Vector3(
    Math.cos(angle) * radius[0],
    height,
    Math.sin(angle) * radius[1],
  );
  const addQuad = (
    first: THREE.Vector3,
    second: THREE.Vector3,
    third: THREE.Vector3,
    fourth: THREE.Vector3,
  ) => {
    vertices.push(
      ...first.toArray(),
      ...second.toArray(),
      ...third.toArray(),
      ...first.toArray(),
      ...third.toArray(),
      ...fourth.toArray(),
    );
  };

  for (let index = 0; index < segments; index += 1) {
    const start = (index / segments) * Math.PI * 2;
    const end = ((index + 1) / segments) * Math.PI * 2;
    addQuad(
      point(innerRadius, start, topHeight),
      point(outerRadius, start, topHeight),
      point(outerRadius, end, topHeight),
      point(innerRadius, end, topHeight),
    );
    addQuad(
      point(outerRadius, start, bottomHeight),
      point(outerRadius, start, topHeight),
      point(outerRadius, end, topHeight),
      point(outerRadius, end, bottomHeight),
    );
    addQuad(
      point(innerRadius, start, bottomHeight),
      point(innerRadius, end, bottomHeight),
      point(innerRadius, end, topHeight),
      point(innerRadius, start, topHeight),
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  scene.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
    ),
  );
}

function addField(scene: THREE.Scene) {
  const pitchWidth = 0.76;
  const pitchDepth = 0.48;
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(pitchWidth, pitchDepth),
    new THREE.MeshStandardMaterial({
      color: "#168522",
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
  );
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.035;
  scene.add(field);

  for (let stripe = 0; stripe < 10; stripe += 1) {
    if (stripe % 2 === 0) continue;
    const grassStripe = new THREE.Mesh(
      new THREE.PlaneGeometry(pitchWidth, pitchDepth / 10),
      new THREE.MeshStandardMaterial({
        color: "#258f2d",
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    grassStripe.rotation.x = -Math.PI / 2;
    grassStripe.position.set(
      0,
      -0.034,
      -pitchDepth / 2 + (stripe + 0.5) * (pitchDepth / 10),
    );
    scene.add(grassStripe);
  }

  const lineMaterial = new THREE.LineBasicMaterial({ color: "#f6f4f0" });
  const lineY = -0.029;
  const addLine = (points: THREE.Vector3[]) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    scene.add(new THREE.Line(geometry, lineMaterial));
  };
  const halfWidth = pitchWidth / 2;
  const halfDepth = pitchDepth / 2;
  addLine([
    new THREE.Vector3(-halfWidth, lineY, -halfDepth),
    new THREE.Vector3(halfWidth, lineY, -halfDepth),
    new THREE.Vector3(halfWidth, lineY, halfDepth),
    new THREE.Vector3(-halfWidth, lineY, halfDepth),
    new THREE.Vector3(-halfWidth, lineY, -halfDepth),
  ]);
  addLine([
    new THREE.Vector3(0, lineY, -halfDepth),
    new THREE.Vector3(0, lineY, halfDepth),
  ]);

  for (const direction of [-1, 1]) {
    const goalLine = direction * halfWidth;
    const boxLine = direction * (halfWidth - 0.13);
    const smallBoxLine = direction * (halfWidth - 0.055);
    const addBox = (line: number, depth: number) => {
      addLine([
        new THREE.Vector3(line, lineY, -depth),
        new THREE.Vector3(boxLine, lineY, -depth),
        new THREE.Vector3(boxLine, lineY, depth),
        new THREE.Vector3(line, lineY, depth),
      ]);
    };
    addBox(goalLine, 0.17);
    addBox(goalLine, 0.075);
    addLine([
      new THREE.Vector3(smallBoxLine, lineY, -0.075),
      new THREE.Vector3(smallBoxLine, lineY, 0.075),
    ]);
  }

  const circlePoints = Array.from({ length: 49 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2;
    return new THREE.Vector3(
      Math.cos(angle) * 0.075,
      lineY,
      Math.sin(angle) * 0.075,
    );
  });
  addLine(circlePoints);
}

export default function StadiumViewer({
  layout,
  selectedSectionId,
  onSelectSection,
}: {
  layout: StadiumLayout;
  selectedSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const selectedSectionRef = useRef(selectedSectionId);

  useEffect(() => {
    selectedSectionRef.current = selectedSectionId;
    const mesh = meshRef.current;
    if (!mesh) return;

    const selectedIndex = layout.sections.findIndex(
      (section) => section.id === selectedSectionId,
    );
    const color = new THREE.Color();
    for (let index = 0; index < layout.s.length; index += 1) {
      const sectionIndex = layout.s[index];
      if (sectionIndex === undefined) continue;
      color.copy(
        selectedIndex === sectionIndex
          ? selectedColor
          : colorForTier(layout.sections[sectionIndex]?.tier ?? "lower"),
      );
      mesh.setColorAt(index, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    if (selectedIndex >= 0 && controlsRef.current) {
      let totalX = 0;
      let totalZ = 0;
      let count = 0;
      for (let index = 0; index < layout.s.length; index += 1) {
        if (layout.s[index] !== selectedIndex) continue;
        totalX += (layout.x[index] ?? 0) / layout.scale;
        totalZ += (layout.y[index] ?? 0) / layout.scale;
        count += 1;
      }
      if (count > 0) {
        controlsRef.current.target.set(
          totalX / count,
          0.2,
          totalZ / count,
        );
      }
    }
  }, [layout, selectedSectionId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mount.classList.remove(styles.webglFailed);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      mount.classList.add(styles.webglFailed);
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#b9dce9");

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 30);
    camera.position.set(0, 2.3, 2.75);
    camera.lookAt(0, 0.18, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.className = styles.canvas;
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D seat map of Talanta Stadium. Drag to rotate and scroll to zoom.",
    );
    renderer.domElement.setAttribute("role", "img");
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#ffffff", "#7d858a", 1.8));
    const keyLight = new THREE.DirectionalLight("#fff5e3", 2.4);
    keyLight.position.set(-2.5, 4, 3);
    scene.add(keyLight);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.94, 1.04, 0.12, 96, 1, true),
      new THREE.MeshStandardMaterial({
        color: "#b9c0c2",
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    base.position.y = -0.035;
    scene.add(base);
    addTierStructure(scene, [0.43, 0.29], [0.68, 0.57], -0.02, 0.105, "#d5d9d8");
    addTierStructure(scene, [0.64, 0.53], [0.88, 0.75], 0.105, 0.305, "#c2c9ca");
    addTierStructure(scene, [0.82, 0.69], [1, 0.85], 0.305, 0.525, "#afb8bb");
    addField(scene);

    const seatGeometry = new THREE.BoxGeometry(0.0065, 0.009, 0.0065);
    const seatMaterial = new THREE.MeshLambertMaterial({
      color: "#ffffff",
      vertexColors: false,
      toneMapped: false,
    });
    const seats = new THREE.InstancedMesh(
      seatGeometry,
      seatMaterial,
      layout.x.length,
    );
    seats.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const transform = new THREE.Object3D();
    const initialColor = new THREE.Color();
    const tierHeights: Record<string, number> = {
      lower: 0.11,
      middle: 0.31,
      upper: 0.53,
    };

    for (let index = 0; index < layout.x.length; index += 1) {
      const x = layout.x[index] ?? 0;
      const y = layout.y[index] ?? 0;
      const sectionIndex = layout.s[index] ?? 0;
      const section = layout.sections[sectionIndex];
      transform.position.set(
        x / layout.scale,
        tierHeights[section?.tier ?? "lower"] ?? 0.3,
        y / layout.scale,
      );
      transform.rotation.set(0, Math.atan2(-x, -y), 0);
      transform.updateMatrix();
      seats.setMatrixAt(index, transform.matrix);
      initialColor.copy(
        selectedSectionRef.current === section?.id
          ? selectedColor
          : colorForTier(section?.tier ?? "lower"),
      );
      seats.setColorAt(index, initialColor);
    }
    seats.instanceMatrix.needsUpdate = true;
    if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
    scene.add(seats);
    meshRef.current = seats;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.4;
    controls.maxDistance = 5.2;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 0.18, 0);
    controls.update();
    controlsRef.current = controls;

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width < 1 || height < 1) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pointerStart) return;
      const moved = Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      );
      pointerStart = null;
      if (moved > 5) return;

      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(seats, false)[0];
      if (hit?.instanceId === undefined) return;
      const section = layout.sections[layout.s[hit.instanceId] ?? -1];
      if (section) onSelectSection(section.id);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    let animationFrame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      resizeObserver.disconnect();
      controls.dispose();
      seatGeometry.dispose();
      seatMaterial.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Line) object.geometry.dispose();
        if (object instanceof THREE.Mesh && object !== seats) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      meshRef.current = null;
      controlsRef.current = null;
    };
  }, [layout, onSelectSection]);

  return (
    <div className={styles.viewer}>
      <div className={styles.canvasMount} ref={mountRef} />
      <div className={styles.renderError} role="alert">
        This browser couldn’t start the 3D view. Try enabling WebGL or use a
        browser that supports it.
      </div>
      <div className={styles.viewerBadge} aria-hidden="true">
        <span className={styles.compass}>N</span>
        <span>3D VIEW</span>
      </div>
    </div>
  );
}
