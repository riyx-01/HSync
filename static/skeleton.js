
class SkeletonViewer {
    constructor(containerId, width, height) {
        this.container = document.getElementById(containerId);
        this.width = width || this.container.clientWidth;
        this.height = height || 300;
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f9ff); // Light blueish gray

        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        // Move camera closer and lower to frame the skeleton better (Zoomed in)
        this.camera.position.set(0, 1.3, 3.2);
        this.camera.lookAt(0, 0.9, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(2, 4, 3);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // Materials
        this.boneMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
        this.jointMaterial = new THREE.MeshPhongMaterial({ color: 0xdddddd });

        this.skeleton = this.createSkeleton();
        this.scene.add(this.skeleton);
        
        // Ground plane (invisible shadow catcher)
        const planeGeometry = new THREE.PlaneGeometry(10, 10);
        const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.2 });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = 0;
        plane.receiveShadow = true;
        this.scene.add(plane);

        this.clock = new THREE.Clock();
        this.animationType = null;
        
        this.joints = {}; // Store references to joints for animation
        this.mapJoints(this.skeleton);

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    createBone(height, radius = 0.04) {
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 8);
        geometry.translate(0, height / 2, 0); // Pivot at base
        const bone = new THREE.Mesh(geometry, this.boneMaterial);
        bone.castShadow = true;
        return bone;
    }

    createJoint(radius = 0.05) {
        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        const joint = new THREE.Mesh(geometry, this.jointMaterial);
        joint.castShadow = true;
        return joint;
    }

    createSkeleton() {
        const root = new THREE.Group();

        // Hips (Root of skeleton logic)
        this.hips = new THREE.Group();
        this.hips.position.y = 1.0; // Hip height
        root.add(this.hips);
        
        const hipJoint = this.createJoint(0.08);
        this.hips.add(hipJoint);

        // Spine
        this.spine = new THREE.Group();
        this.hips.add(this.spine);
        const spineBone = this.createBone(0.5); // Spine length
        this.spine.add(spineBone);

        // Chest / Shoulders
        this.chest = new THREE.Group();
        this.chest.position.y = 0.5;
        this.spine.add(this.chest);
        const chestJoint = this.createJoint(0.07);
        this.chest.add(chestJoint);

        // Neck & Head
        this.neck = new THREE.Group();
        this.neck.position.y = 0.05;
        this.chest.add(this.neck);
        const neckBone = this.createBone(0.15, 0.03);
        this.neck.add(neckBone);

        this.head = new THREE.Group();
        this.head.position.y = 0.15;
        this.neck.add(this.head);
        const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), this.boneMaterial);
        headMesh.position.y = 0.12;
        this.head.add(headMesh);

        // Arms
        this.leftArm = this.createLimb(-1, 'left');
        this.rightArm = this.createLimb(1, 'right');
        this.chest.add(this.leftArm);
        this.chest.add(this.rightArm);

        // Legs
        this.leftLeg = this.createLeg(-1, 'left');
        this.rightLeg = this.createLeg(1, 'right');
        this.hips.add(this.leftLeg);
        this.hips.add(this.rightLeg);

        return root;
    }

    createLimb(side, namePrefix) {
        // side: 1 for right, -1 for left
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.2, 0, 0); // Shoulder width

        const shoulderJoint = this.createJoint(0.06);
        shoulder.add(shoulderJoint);

        const upperArm = new THREE.Group();
        shoulder.add(upperArm);
        const upperArmBone = this.createBone(0.3);
        // Rotate bone to hang down initially? Or T-pose? 
        // Let's build it pointing DOWN for neutral standing.
        upperArmBone.rotation.z = side * 0.1; // Slight natural relax
        upperArmBone.rotation.x = Math.PI; // Point down
        // Wait, if I rotate the bone mesh, the child groups attached to it won't follow correctly if I attach them to the bone mesh.
        // Better: The 'upperArm' Group is the pivot. The bone mesh is visual.
        
        // Re-do: 
        // Upper Arm Pivot
        //   -> Visual Bone (length 0.3)
        //   -> Lower Arm Pivot (at 0.3)
        
        // Let's align groups:
        // By default, bones grow +Y. To point down, rotate group X = PI.
        upperArm.rotation.z = -side * 0.2; // Relaxed shoulders
        upperArm.rotation.x = Math.PI; 

        upperArm.add(this.createBone(0.3));

        const lowerArm = new THREE.Group();
        lowerArm.position.y = 0.3; // End of upper arm
        upperArm.add(lowerArm);
        
        lowerArm.add(this.createJoint(0.05)); // Elbow
        lowerArm.add(this.createBone(0.25));

        const hand = new THREE.Group();
        hand.position.y = 0.25;
        lowerArm.add(hand);
        hand.add(this.createJoint(0.04)); // Wrist
        // Simple hand
        const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.08), this.boneMaterial);
        handMesh.position.y = 0.05;
        hand.add(handMesh);

        // Store references
        this[`${namePrefix}Shoulder`] = shoulder;
        this[`${namePrefix}UpperArm`] = upperArm;
        this[`${namePrefix}LowerArm`] = lowerArm;
        
        return shoulder;
    }

    createLeg(side, namePrefix) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.15, 0, 0);

        const thigh = new THREE.Group();
        hip.add(thigh);
        thigh.rotation.x = Math.PI; // Point down
        
        thigh.add(this.createBone(0.45));

        const shin = new THREE.Group();
        shin.position.y = 0.45;
        thigh.add(shin);

        shin.add(this.createJoint(0.06)); // Knee
        shin.add(this.createBone(0.4));

        const foot = new THREE.Group();
        foot.position.y = 0.4;
        shin.add(foot);
        
        foot.add(this.createJoint(0.05)); // Ankle
        const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.2), this.boneMaterial);
        footMesh.position.set(0, 0.025, 0.05); // Offset forward
        foot.add(footMesh);

        this[`${namePrefix}Thigh`] = thigh;
        this[`${namePrefix}Shin`] = shin;
        this[`${namePrefix}Foot`] = foot;

        return hip;
    }

    mapJoints(skeleton) {
        // Already stored in 'this' during creation
    }

    setExercise(name) {
        this.animationType = name.toLowerCase();
        this.resetPose();
    }

    resetPose() {
        // Reset rotations to neutral
        this.neck.rotation.set(0,0,0);
        this.head.rotation.set(0,0,0);
        
        this.leftUpperArm.rotation.set(Math.PI, 0, -0.2);
        this.leftLowerArm.rotation.set(0,0,0);
        
        this.rightUpperArm.rotation.set(Math.PI, 0, 0.2);
        this.rightLowerArm.rotation.set(0,0,0);

        this.spine.rotation.set(0,0,0);
        this.chest.rotation.set(0,0,0);
    }

    animate() {
        requestAnimationFrame(this.animate);
        const time = this.clock.getElapsedTime();

        if (this.animationType) {
            this.applyAnimation(this.animationType, time);
        }

        this.renderer.render(this.scene, this.camera);
    }

    applyAnimation(type, time) {
        // Normalize type
        const t = type.toLowerCase();

        if (t.includes("squat") || t.includes("leg")) {
            // Squat: Hips down, knees bend, body forward
            const cycle = (Math.sin(time * 2) + 1) * 0.5; // 0 to 1
            this.hips.position.y = 1.0 - (cycle * 0.3);
            
            this.leftThigh.rotation.x = Math.PI - (cycle * 1.2);
            this.rightThigh.rotation.x = Math.PI - (cycle * 1.2);
            
            this.leftShin.rotation.x = cycle * 2.2;
            this.rightShin.rotation.x = cycle * 2.2;
            
            this.spine.rotation.x = cycle * 0.5;
            
            // Arms forward for balance
            this.leftUpperArm.rotation.x = Math.PI - (cycle * 1.5);
            this.rightUpperArm.rotation.x = Math.PI - (cycle * 1.5);
        }
        else if (t.includes("jumping") || t.includes("jack")) {
            // Jumping Jacks
            const cycle = Math.abs(Math.sin(time * 3)); // 0 to 1 fast
            
            // Legs out
            this.leftLeg.rotation.z = -cycle * 0.5;
            this.rightLeg.rotation.z = cycle * 0.5;
            
            // Arms up
            this.leftUpperArm.rotation.z = -cycle * 2.5;
            this.rightUpperArm.rotation.z = cycle * 2.5;
            
            // Jump up slightly
            this.hips.position.y = 1.0 + cycle * 0.1;
        }
        else if (t.includes("side") && t.includes("bend")) {
            // Side Bend
            const cycle = Math.sin(time * 1.5);
            this.spine.rotation.z = cycle * 0.3;
            this.chest.rotation.z = cycle * 0.2;
            
            // Arm overhead (opposite to bend)
            if (cycle > 0) {
                this.leftUpperArm.rotation.z = -2.8; // Left arm up
                this.rightUpperArm.rotation.z = 0.2; // Right arm down
            } else {
                this.leftUpperArm.rotation.z = -0.2;
                this.rightUpperArm.rotation.z = 2.8; // Right arm up
            }
        }
        else if (t.includes("high") || t.includes("march") || t.includes("knee")) {
            // High Knees / Marching
            const cycle = time * 4;
            const leftUp = Math.sin(cycle) > 0;
            
            if (leftUp) {
                this.leftThigh.rotation.x = Math.PI - 1.5;
                this.leftShin.rotation.x = 1.5;
                this.rightThigh.rotation.x = Math.PI;
                this.rightShin.rotation.x = 0;
            } else {
                this.rightThigh.rotation.x = Math.PI - 1.5;
                this.rightShin.rotation.x = 1.5;
                this.leftThigh.rotation.x = Math.PI;
                this.leftShin.rotation.x = 0;
            }
        }
        else if (t.includes("forward") || t.includes("touch")) {
            // Forward Bend (Toe Touch)
            const cycle = (Math.sin(time * 1.5) + 1) * 0.5; // 0 to 1
            this.hips.rotation.x = cycle * 1.5; // Bend at hips
            this.spine.rotation.x = cycle * 0.5; // Curve spine
            
            // Arms reach down
            this.leftUpperArm.rotation.x = Math.PI + cycle * 0.5;
            this.rightUpperArm.rotation.x = Math.PI + cycle * 0.5;
        }
        else if (t.includes("neck") || t.includes("head")) {
            // Neck Stretch
            this.neck.rotation.z = Math.sin(time * 1.5) * 0.4;
            this.neck.rotation.x = Math.sin(time * 1.1) * 0.2;
        }
        else if (t.includes("shoulder") || t.includes("shrug")) {
            // Shoulder Rolls
            const cycle = time * 3;
            // Simulate roll by moving arm pivots (limitations of simple rig)
            this.leftUpperArm.rotation.x = Math.PI + Math.sin(cycle) * 0.2;
            this.rightUpperArm.rotation.x = Math.PI + Math.sin(cycle) * 0.2;
            this.chest.position.y = 0.5 + Math.sin(cycle) * 0.02; // Shrug effect
        }
        else if (t.includes("arm") || t.includes("circle")) {
             // Arm Circles
             const cycle = time * 3;
             this.leftUpperArm.rotation.z = -1.5; // T-pose base
             this.rightUpperArm.rotation.z = 1.5;
             
             this.leftUpperArm.rotation.x = Math.PI + Math.cos(cycle) * 0.5;
             this.leftUpperArm.rotation.y = Math.sin(cycle) * 0.5;
             
             this.rightUpperArm.rotation.x = Math.PI + Math.cos(cycle) * 0.5;
             this.rightUpperArm.rotation.y = -Math.sin(cycle) * 0.5;
        }
        else {
            // Default "Breathing" / Standing
            this.chest.scale.setScalar(1 + Math.sin(time * 2) * 0.02);
            this.spine.rotation.x = Math.sin(time) * 0.02;
        }
    }
}
