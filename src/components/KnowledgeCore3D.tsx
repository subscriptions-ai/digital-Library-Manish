import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Float, Stars, Html, Line, QuadraticBezierLine } from '@react-three/drei';
import * as THREE from 'three';
import { DOMAINS } from '../constants';

const DataStream = ({ radius, color }: { radius: number, color: string }) => {
  const lineRef = useRef<any>(null);
  const matRef = useRef<any>(null);
  
  useFrame((state) => {
    if (matRef.current) {
      // Animate the dashed line to look like flowing data
      matRef.current.dashOffset -= 0.05;
    }
  });

  return (
    <QuadraticBezierLine
      ref={lineRef}
      start={[radius, 0, 0]}
      end={[0, 0, 0]}
      mid={[radius / 2, 1.5, 0]}
      color={color}
      lineWidth={2}
      dashed={true}
      dashScale={20}
      dashSize={2}
      dashOffset={0}
      transparent
      opacity={0.8}
    >
      <lineDashedMaterial ref={matRef} color={color} dashSize={0.2} gapSize={0.2} transparent opacity={0.8} />
    </QuadraticBezierLine>
  );
};

const CoreRing = ({ radius, speed, color, rotationX, rotationY, domain }: any) => {
  const ringRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  
  // Smoothly interpolate speed
  const currentSpeed = useRef(speed);
  
  useFrame(() => {
    if (ringRef.current) {
      const targetSpeed = active ? 0 : (hovered ? speed * 0.1 : speed);
      currentSpeed.current += (targetSpeed - currentSpeed.current) * 0.05;
      ringRef.current.rotation.z += currentSpeed.current;
    }
  });

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : 'auto';
  }, [hovered]);

  return (
    <group ref={ringRef} rotation={[rotationX, rotationY, 0]}>
      {/* Outer Glow Ring */}
      <mesh>
        <torusGeometry args={[radius, 0.02, 16, 100]} />
        <meshBasicMaterial color={color} transparent opacity={hovered ? 0.6 : 0.2} />
      </mesh>
      {/* Solid Thin Inner Ring */}
      <mesh>
        <torusGeometry args={[radius, 0.005, 16, 100]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>
      
      {/* The Active Data Stream */}
      {active && <DataStream radius={radius} color={color} />}

      {/* Interactive Data Node with Massive Invisible Hitbox */}
      <group position={[radius, 0, 0]}>
        {/* Enormous invisible hitbox makes it impossible to miss */}
        <mesh 
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
          onClick={(e) => { e.stopPropagation(); setActive(!active); }}
          visible={false}
        >
          <sphereGeometry args={[1.5, 8, 8]} />
          <meshBasicMaterial />
        </mesh>

        <mesh>
          <sphereGeometry args={[hovered || active ? 0.12 : 0.08, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[hovered || active ? 0.25 : 0.15, 16, 16]} />
            <meshBasicMaterial color={color} transparent opacity={hovered || active ? 0.9 : 0.5} />
          </mesh>
        </mesh>
        
        {/* Holographic Label */}
        <Html position={[0, 0.5, 0]} center zIndexRange={[100, 0]}>
          <div 
            className={`w-max pointer-events-none transition-all duration-300 transform ${
              hovered || active ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-4'
            }`}
          >
             {/* Make the actual label panel highly interactive and clickable */}
             <div 
               onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
               onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
               onClick={(e) => { e.stopPropagation(); setActive(!active); }}
               className={`pointer-events-auto cursor-pointer backdrop-blur-md border p-4 rounded-xl transition-all duration-300 ${active ? 'bg-slate-900/90 shadow-[0_0_40px_rgba(59,130,246,0.5)] border-white/40' : 'bg-slate-900/70 shadow-[0_0_20px_rgba(59,130,246,0.2)] border-white/10 hover:border-white/30'}`}
             >
               <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1 flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full animate-pulse`} style={{ backgroundColor: color }}></div>
                 {domain?.name || "Domain"}
               </div>
               <div className="text-sm font-bold text-white max-w-[220px] leading-snug">
                 {active ? domain?.description?.substring(0, 80) + "..." : "Click to establish connection"}
               </div>
               {active && (
                 <div className="mt-3 pt-3 border-t border-white/10 text-xs text-blue-200">
                   Data stream connected. Transferring metrics...
                 </div>
               )}
             </div>
          </div>
        </Html>
      </group>
      
      {/* Small Secondary Node (Non-interactive) */}
      <mesh position={[-radius, 0, 0]}>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshBasicMaterial color="#ffffff" />
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} />
        </mesh>
      </mesh>
    </group>
  );
};

const KnowledgeCore = () => {
  const coreRef = useRef<THREE.Mesh>(null);
  const outerWireframeRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const coreScale = useRef(1);
  const speedMultiplier = useRef(1);

  useFrame((state) => {
    if (coreRef.current && outerWireframeRef.current) {
      // Speed up rotation when hovered
      const targetMultiplier = hovered ? 3 : 1;
      speedMultiplier.current += (targetMultiplier - speedMultiplier.current) * 0.05;
      
      coreRef.current.rotation.y -= 0.002 * speedMultiplier.current;
      outerWireframeRef.current.rotation.y += 0.001 * speedMultiplier.current;
      outerWireframeRef.current.rotation.x += 0.001 * speedMultiplier.current;
      
      // Smooth scaling without glitchy lerps
      const targetScale = hovered ? 1.05 : 1;
      coreScale.current += (targetScale - coreScale.current) * 0.1;
      coreRef.current.scale.set(coreScale.current, coreScale.current, coreScale.current);
    }
  });

  useEffect(() => {
    if (hovered) document.body.style.cursor = 'pointer';
    else document.body.style.cursor = 'auto';
  }, [hovered]);

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      {/* Central Glass Core */}
      <mesh 
        ref={coreRef}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
      >
        <icosahedronGeometry args={[1.8, 3]} />
        <meshPhysicalMaterial 
          color="#0a0f1c"
          metalness={0.9}
          roughness={0.05}
          transmission={0.95}
          thickness={1}
          clearcoat={1}
          transparent
        />
        {/* Inner Glowing Energy */}
        <mesh>
           <sphereGeometry args={[1.2, 32, 32]} />
           <meshBasicMaterial color="#3b82f6" transparent opacity={hovered ? 0.6 : 0.2} />
        </mesh>

        <Html center zIndexRange={[100, 0]}>
          <div 
            className={`transition-all duration-500 pointer-events-none flex items-center justify-center w-40 h-40 rounded-full bg-blue-600/10 backdrop-blur-sm border border-blue-400/30 ${
              hovered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
            }`}
          >
            <div className="text-center">
              <div className="text-3xl font-bold text-white">{DOMAINS.length}+</div>
              <div className="text-[11px] uppercase tracking-widest text-blue-300 mt-1">Academic<br/>Departments</div>
            </div>
          </div>
        </Html>
      </mesh>

      {/* Outer Geometric Wireframe */}
      <mesh ref={outerWireframeRef}>
        <icosahedronGeometry args={[2.2, 1]} />
        <meshBasicMaterial 
          color="#3b82f6" 
          wireframe={true} 
          transparent 
          opacity={hovered ? 0.4 : 0.15} 
        />
      </mesh>

      {/* Orbiting Information Rings */}
      <CoreRing radius={3.5} speed={0.0025} color="#3b82f6" rotationX={Math.PI / 3} rotationY={0} domain={DOMAINS[0]} />
      <CoreRing radius={4.5} speed={-0.002} color="#8b5cf6" rotationX={-Math.PI / 4} rotationY={Math.PI / 6} domain={DOMAINS[1]} />
      <CoreRing radius={5.5} speed={0.0015} color="#10b981" rotationX={Math.PI / 6} rotationY={-Math.PI / 3} domain={DOMAINS[2]} />
      <CoreRing radius={6.5} speed={-0.001} color="#06b6d4" rotationX={Math.PI / 2} rotationY={Math.PI / 4} domain={DOMAINS[3]} />
    </Float>
  );
};

const SceneLayout = () => {
  const { viewport } = useThree();
  // If viewport width is large enough (desktop), shift 25% to the right. 
  // Otherwise, keep it centered for mobile/tablets.
  const isDesktop = viewport.width > 12;
  const xOffset = isDesktop ? viewport.width * 0.25 : 0;

  return (
    <>
      {/* Stars cover the entire full-screen canvas */}
      <Stars radius={50} depth={50} count={3000} factor={3} saturation={0} fade speed={1} />
      
      {/* The Core is shifted to the right to sit in the empty grid space */}
      <group position={[xOffset, isDesktop ? 0 : -2, 0]}>
        <KnowledgeCore />
      </group>
    </>
  );
};

export function KnowledgeCore3D() {
  return (
    <div className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing">
      <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={2} color="#3b82f6" />
        <pointLight position={[-10, -10, -10]} intensity={2} color="#8b5cf6" />
        <pointLight position={[0, 0, 0]} intensity={1} color="#ffffff" />
        
        <SceneLayout />
        
        <OrbitControls 
          enableZoom={false} 
          autoRotate 
          autoRotateSpeed={0.5} 
          maxPolarAngle={Math.PI / 1.5} 
          minPolarAngle={Math.PI / 3}
          enablePan={false}
        />
      </Canvas>
    </div>
  );
}
