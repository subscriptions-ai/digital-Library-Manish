import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const getStudentMessage = (id: number, count: number) => {
  if (count === 1) {
    const msgs = [
      "This new journal on Quantum Computing is amazing!",
      "I love how fast I can find research papers here.",
      "Access to premium medical journals is a game changer.",
      "The global search feature saved my thesis!",
      "Reading an open-access paper on AI right now.",
      "So much high-quality academic content!",
      "I'm cross-referencing three domains at once.",
      "This STM library interface makes learning so much easier.",
      "Finally found that obscure engineering paper!",
      "Downloading a PDF on advanced robotics.",
      "The citation export is so helpful.",
      "Just browsing the computer science archives."
    ];
    return msgs[id % msgs.length];
  }
  if (count === 2) {
    return "Shh! I'm trying to focus on this research.";
  }
  if (count === 3) {
    return "Seriously? I have a deadline tomorrow, please stop.";
  }
  return "ALRIGHT THAT'S IT! Why are you disturbing me? Can't you see I'm trying to read here?! 😡";
};

const Student = ({ id, color, seatPosition, seatRotation, delayTime }: any) => {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const laptop = useRef<THREE.Group>(null);
  
  const leftLeg = useRef<THREE.Group>(null);
  const leftCalf = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const rightCalf = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);

  const [phase, setPhase] = useState('hidden'); 
  const [standing, setStanding] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('walking'), delayTime);
    return () => clearTimeout(t1);
  }, [delayTime]);

  useEffect(() => {
    if (standing) {
      const t = setTimeout(() => setStanding(false), 3000);
      return () => clearTimeout(t);
    }
  }, [standing]);

  const handleStudentClick = (e: any) => {
    e.stopPropagation();
    if (phase === 'sitting' && !standing) {
      setStanding(true);
      setClickCount(c => c + 1);
    }
  };

  const startPos = new THREE.Vector3(seatPosition[0] > 0 ? 15 : -15, -0.175, seatPosition[2] > 0 ? 15 : -15);
  const targetPos = new THREE.Vector3(...seatPosition);
  
  useFrame((state, delta) => {
    if (!group.current || !head.current || !leftLeg.current || !leftCalf.current || !rightLeg.current || !rightCalf.current || !leftArm.current || !rightArm.current || !laptop.current) return;
    
    const targetLaptopScale = (phase === 'sitting' && !standing) ? 1 : 0;
    laptop.current.scale.lerp(new THREE.Vector3(targetLaptopScale, targetLaptopScale, targetLaptopScale), delta * 8);

    if (phase === 'hidden') {
      group.current.position.copy(startPos);
    } else if (phase === 'walking') {
      group.current.position.lerp(targetPos, delta * 2.5);
      
      const dist = group.current.position.distanceTo(targetPos);
      if (dist < 0.2) {
        setPhase('sitting');
      }

      const walkTime = state.clock.elapsedTime * 12;
      const walkIntensity = Math.min(1, dist * 1.5); 
      
      group.current.position.y = -0.175 + (Math.sin(walkTime * 2) * 0.04 * walkIntensity);
      group.current.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, seatRotation, 0)), delta * 3);

      leftLeg.current.rotation.x = Math.sin(walkTime) * 0.5 * walkIntensity;
      rightLeg.current.rotation.x = Math.sin(walkTime + Math.PI) * 0.5 * walkIntensity;
      leftCalf.current.rotation.x = 0;
      rightCalf.current.rotation.x = 0;
      leftArm.current.rotation.x = Math.sin(walkTime + Math.PI) * 0.4 * walkIntensity;
      rightArm.current.rotation.x = Math.sin(walkTime) * 0.4 * walkIntensity;

    } else if (phase === 'sitting') {
      const currentTargetX = standing ? targetPos.x * 1.3 : targetPos.x;
      const currentTargetZ = standing ? targetPos.z * 1.3 : targetPos.z;
      
      group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, currentTargetX, delta * 5);
      group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, currentTargetZ, delta * 5);
      
      const targetY = standing ? -0.175 : -0.375;
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, targetY, delta * 6);
      
      group.current.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, seatRotation, 0)), delta * 5);

      const targetLegRot = standing ? 0 : -Math.PI / 2;
      const targetCalfRot = standing ? 0 : Math.PI / 2;
      
      const targetArmRot = standing ? 0 : -0.7; 
      const isTyping = !standing && phase === 'sitting';
      const typingWiggleL = isTyping ? Math.sin(state.clock.elapsedTime * 20) * 0.05 : 0;
      const typingWiggleR = isTyping ? Math.cos(state.clock.elapsedTime * 25) * 0.05 : 0;
      
      leftLeg.current.rotation.x = THREE.MathUtils.lerp(leftLeg.current.rotation.x, targetLegRot, delta * 6);
      leftCalf.current.rotation.x = THREE.MathUtils.lerp(leftCalf.current.rotation.x, targetCalfRot, delta * 6);
      rightLeg.current.rotation.x = THREE.MathUtils.lerp(rightLeg.current.rotation.x, targetLegRot, delta * 6);
      rightCalf.current.rotation.x = THREE.MathUtils.lerp(rightCalf.current.rotation.x, targetCalfRot, delta * 6);
      
      leftArm.current.rotation.x = THREE.MathUtils.lerp(leftArm.current.rotation.x, targetArmRot + typingWiggleL, delta * 6);
      rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, targetArmRot + typingWiggleR, delta * 6);

      const lookTarget = new THREE.Vector3();
      state.raycaster.ray.at(15, lookTarget);
      
      const currentQuat = head.current.quaternion.clone();
      head.current.lookAt(lookTarget);
      const targetQuat = head.current.quaternion.clone();
      head.current.quaternion.copy(currentQuat); 
      head.current.quaternion.slerp(targetQuat, delta * 6); 
    }
  });

  return (
    <>
      <group ref={group} onClick={handleStudentClick}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <capsuleGeometry args={[0.12, 0.2, 16, 16]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
        </mesh>
        
        <group ref={leftArm} position={[-0.18, 0.48, 0]}>
          <mesh position={[0, -0.15, 0]} rotation={[0, 0, 0.1]} castShadow>
            <capsuleGeometry args={[0.035, 0.25, 8, 16]} />
            <meshStandardMaterial color={color} roughness={0.4} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.18, 0.48, 0]}>
          <mesh position={[0, -0.15, 0]} rotation={[0, 0, -0.1]} castShadow>
            <capsuleGeometry args={[0.035, 0.25, 8, 16]} />
            <meshStandardMaterial color={color} roughness={0.4} />
          </mesh>
        </group>
        
        <group ref={leftLeg} position={[-0.08, 0.175, 0]}>
          <mesh position={[0, -0.125, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.25]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <group ref={leftCalf} position={[0, -0.25, 0]}>
            <mesh position={[0, -0.125, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.25]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
          </group>
        </group>

        <group ref={rightLeg} position={[0.08, 0.175, 0]}>
          <mesh position={[0, -0.125, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.25]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <group ref={rightCalf} position={[0, -0.25, 0]}>
            <mesh position={[0, -0.125, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.25]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
          </group>
        </group>

        <group ref={head} position={[0, 0.6, 0]}>
          <mesh position={[0, -0.06, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.08]} />
            <meshStandardMaterial color="#fcd5ce" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.08, 0]} castShadow>
            <sphereGeometry args={[0.12, 32, 32]} />
            <meshStandardMaterial color="#fcd5ce" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.1, -0.02]} castShadow>
            <sphereGeometry args={[0.13, 32, 32, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
            <meshStandardMaterial color="#1e293b" roughness={0.9} />
          </mesh>
          
          <mesh position={[0.04, 0.1, 0.1]}>
            <sphereGeometry args={[0.015, 16, 16]} />
            <meshStandardMaterial color="white" />
            <mesh position={[0, 0, 0.01]}>
              <sphereGeometry args={[0.008, 16, 16]} />
              <meshBasicMaterial color="#0f172a" />
            </mesh>
          </mesh>
          <mesh position={[-0.04, 0.1, 0.1]}>
            <sphereGeometry args={[0.015, 16, 16]} />
            <meshStandardMaterial color="white" />
            <mesh position={[0, 0, 0.01]}>
              <sphereGeometry args={[0.008, 16, 16]} />
              <meshBasicMaterial color="#0f172a" />
            </mesh>
          </mesh>
        </group>

        {standing && clickCount > 0 && (
          <Html position={[0, 1.2, 0]} center zIndexRange={[100, 0]}>
            <div className={`w-max max-w-[150px] text-center px-3 py-2 rounded-lg shadow-2xl text-[11px] font-bold pointer-events-none animate-bounce border border-white/20 backdrop-blur-md ${clickCount >= 4 ? 'bg-red-500/90 text-white' : 'bg-slate-800/90 text-slate-100'}`}>
              {getStudentMessage(id, clickCount)}
              <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-b border-r border-white/20 ${clickCount >= 4 ? 'bg-red-500' : 'bg-slate-800'}`} />
            </div>
          </Html>
        )}
      </group>

      <group ref={laptop} position={[targetPos.x * 0.72, 0.31, targetPos.z * 0.72]} rotation={[0, seatRotation, 0]} scale={0}>
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.3, 0.02, 0.2]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0, 0.1, -0.09]} rotation={[0.35, 0, 0]} castShadow>
          <boxGeometry args={[0.3, 0.2, 0.02]} />
          <meshStandardMaterial color="#222" />
          <mesh position={[0, 0, 0.011]}>
            <planeGeometry args={[0.28, 0.18]} />
            <meshBasicMaterial color="#3b82f6" />
          </mesh>
        </mesh>
      </group>
    </>
  );
};

const LibraryTable = ({ position, scale, idOffset, colorPalette, delayOffset }: any) => {
  return (
    <group position={position} scale={scale}>
      <group position={[0, -0.5, 0]}>
        <mesh position={[0, 0.8, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[1.2, 1.2, 0.05, 32]} />
          <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[1.22, 1.22, 0.01, 32]} />
          <meshBasicMaterial color="#3b82f6" />
        </mesh>
        <mesh position={[0, 0.4, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.8, 16]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0, 0.05, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.1, 32]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        {[
          { x: 0, z: 1.5, rot: Math.PI },
          { x: 0, z: -1.5, rot: 0 },
          { x: 1.5, z: 0, rot: -Math.PI / 2 },
          { x: -1.5, z: 0, rot: Math.PI / 2 }
        ].map((pos, i) => (
          <group key={i} position={[pos.x, 0, pos.z]} rotation={[0, pos.rot, 0]}>
            <mesh position={[0, 0.3, 0]} receiveShadow castShadow>
              <boxGeometry args={[0.4, 0.05, 0.4]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
            <mesh position={[0, 0.55, -0.18]} receiveShadow castShadow>
              <boxGeometry args={[0.4, 0.45, 0.05]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
            <mesh position={[-0.15, 0.15, 0.15]} receiveShadow castShadow><boxGeometry args={[0.05, 0.3, 0.05]} /><meshStandardMaterial color="#0f172a" /></mesh>
            <mesh position={[0.15, 0.15, 0.15]} receiveShadow castShadow><boxGeometry args={[0.05, 0.3, 0.05]} /><meshStandardMaterial color="#0f172a" /></mesh>
            <mesh position={[-0.15, 0.15, -0.15]} receiveShadow castShadow><boxGeometry args={[0.05, 0.3, 0.05]} /><meshStandardMaterial color="#0f172a" /></mesh>
            <mesh position={[0.15, 0.15, -0.15]} receiveShadow castShadow><boxGeometry args={[0.05, 0.3, 0.05]} /><meshStandardMaterial color="#0f172a" /></mesh>
          </group>
        ))}
      </group>

      <Student id={idOffset} color={colorPalette[0]} seatPosition={[0, -0.5, 1.5]} seatRotation={Math.PI} delayTime={delayOffset + 500} />
      <Student id={idOffset + 1} color={colorPalette[1]} seatPosition={[0, -0.5, -1.5]} seatRotation={0} delayTime={delayOffset + 2500} />
      <Student id={idOffset + 2} color={colorPalette[2]} seatPosition={[1.5, -0.5, 0]} seatRotation={-Math.PI / 2} delayTime={delayOffset + 4500} />
      <Student id={idOffset + 3} color={colorPalette[3]} seatPosition={[-1.5, -0.5, 0]} seatRotation={Math.PI / 2} delayTime={delayOffset + 6500} />
    </group>
  );
};

export function InteractiveStudents3D() {
  return (
    <div className="relative w-full h-full cursor-grab active:cursor-grabbing">
      <Canvas shadows camera={{ position: [0, 8, 14], fov: 40 }}>
        <ambientLight intensity={0.8} />
        <spotLight position={[5, 15, 5]} angle={0.6} penumbra={1} intensity={180} castShadow shadow-mapSize={2048} />
        <spotLight position={[-10, 10, -5]} angle={0.5} penumbra={1} intensity={80} color="#3b82f6" />
        
        <LibraryTable position={[0, 0, 0]} scale={1} idOffset={0} colorPalette={["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"]} delayOffset={0} />
        <LibraryTable position={[-4.5, 0, -4]} scale={0.85} idOffset={4} colorPalette={["#ef4444", "#06b6d4", "#ec4899", "#84cc16"]} delayOffset={1000} />
        <LibraryTable position={[4.5, 0, -3]} scale={0.9} idOffset={8} colorPalette={["#f97316", "#14b8a6", "#6366f1", "#d946ef"]} delayOffset={2000} />

        <ContactShadows position={[0, -0.49, 0]} opacity={0.5} scale={30} blur={2.5} far={4} />
        <OrbitControls enableZoom={true} maxDistance={25} minDistance={5} maxPolarAngle={Math.PI / 2.1} minPolarAngle={Math.PI / 6} />
      </Canvas>
    </div>
  );
}
