import "https://cdn.jsdelivr.net/npm/three@0.146.0/examples/js/controls/FlyControls.js";

export class FirstPersonCamera {
	constructor(renderer, sceneBuilder, debug = false)
	{
		this.sceneBuilder = sceneBuilder;
		this.scale = sceneBuilder.scale;
		this.debug = debug;
		this.fly = false;

		this.collisionsEnabled = false;		
		this.collisionDist = 0.3;
		this.collisionPrecision = 5;
		
		this.lookSpeed = 0.00131;
		this.movementSpeed = 3 * this.scale;
		this.movementSpeedIncrement = 0.5 * this.scale;
		this.hasMoved = false;
		this.domElement = renderer.domElement;
		
		this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 2000 ); // Perspective projection parameters
		this.camera.name = "Player Camera";	
		
		this.flyControls = new THREE.FlyControls(this.camera, renderer.domElement);
		this.flyControls.movementSpeed = 5;
		this.flyControls.rollSpeed = this.lookSpeed * 500;
			
		this.maxGroundDist = 1.7 * this.scale;
		this.minGroundDist = 1.6 * this.scale;
		this.yMovementIncrement = 0.3 * this.scale;  
		
		this.cameraPositioned = false;
		// Default start position - adjusted in main script on scene built
		this.camera.position.x = this.sceneBuilder.south.x * (this.sceneBuilder.graveyardSideLength / 2 - this.sceneBuilder.scale);
		this.camera.position.y = this.maxGroundDist;
		this.camera.position.z = this.sceneBuilder.south.z * (this.sceneBuilder.graveyardSideLength / 2 - this.sceneBuilder.scale);
	
		this.downVector = new THREE.Vector3(0,-1,0);
		this.raycaster = new THREE.Raycaster(new THREE.Vector3( this.camera.position.x, this.camera.position.y, this.camera.position.z ), 
											new THREE.Vector3( this.downVector.x, this.downVector.y, this.downVector.z ));


		// Functions
		this.lockMouse = function() {
			if(this.fly || this.mouseLocked()) return;
			
			this.domElement.requestPointerLock();
		}
		
		// Handled by browsers, but included on the off chance a browser that doesn't unlock on Esc is used.
		this.unlockMouse = function(e){
			if (this.mouseLocked() && e.key == "Escape")
			{
				document.exitPointerLock();
			}
		}
		
		this.rotateFromMouseMovement = function(mouseEvent) {
			if (document.pointerLockElement || document.mozPointerLockElement)
			{				
				const xAxis = new THREE.Vector3(1,0,0);
				const yAxis = new THREE.Vector3(0,1,0);
				
				this.camera.rotateOnAxis(xAxis, -mouseEvent.movementY * this.lookSpeed);
				this.camera.rotateOnWorldAxis(yAxis, -mouseEvent.movementX * this.lookSpeed);
			}
		}
		
		this.startMovement = function ( event ) {
			switch ( event.code ) {
				case 'ArrowUp':
				case 'KeyW':
					this.moveForward = true;
					break;
				case 'ArrowLeft':
				case 'KeyA':
					this.moveLeft = true;
					break;
				case 'ArrowDown':
				case 'KeyS':
					this.moveBackward = true;
					break;
				case 'ArrowRight':
				case 'KeyD':
					this.moveRight = true;
					break;
				case 'KeyR':
					this.moveUp = true;
					break;
				case 'KeyF':
					this.moveDown = true;
					break;
			}
		};

		this.stopMovement = function ( event ) {
			switch ( event.code ) {
				case 'ArrowUp':
				case 'KeyW':
					this.moveForward = false;
					break;
				case 'ArrowLeft':
				case 'KeyA':
					this.moveLeft = false;
					break;
				case 'ArrowDown':
				case 'KeyS':
					this.moveBackward = false;
					break;
				case 'ArrowRight':
				case 'KeyD':
					this.moveRight = false;
					break;
				case 'KeyR':
					this.moveUp = false;
					break;
				case 'KeyF':
					this.moveDown = false;
					break;
			}
		};
		
		this.changeMovementSpeed = function ( amount ) { 
			if (this.fly)
				this.flyControls.movementSpeed += amount;
			else
				this.movementSpeed += amount 
			
			if (this.debug)
				console.log("DEBUG: Movement speed changed to "+((this.fly) ? this.flyControls.movementSpeed : this.movementSpeed)+".");
		};
			
		this.changeMovementSpeedKeyDown = function ( event ) {
			var multi = 0;
			
			switch ( event.code ) {
				case 'NumpadAdd':
					multi = 1;
					break;
				case 'NumpadSubtract':
					multi = -1;
					break;
			}
			
			if (multi)
			{
				this.changeMovementSpeed(this.movementSpeedIncrement * multi);
			}
		};
		
		this.changeMovementSpeedWheel = function ( event ) {
			if (!this.debug) 
				return;
			
			var multi = (event.deltaY > 0) ? -1 : 1;
			
			this.changeMovementSpeed(this.movementSpeedIncrement * multi);
		};
		
		this.miscKeyDown = function ( event ) {
			switch ( event.code ) {
				case 'Numpad1':
				case 'Digit1': // toggle fly
					this.fly = !this.fly;
					if (!this.fly)
					{
						this.camera.rotation.x = 0;
						this.camera.rotation.y = 0;
						this.camera.rotation.z = 0;
						this.camera.position.y = this.camera.position.y - this.getDistanceToGround() + this.maxGroundDist;
					}
					break;
				case 'Numpad2':
				case 'Digit2': // toggle collisions
					this.collisionsEnabled = !this.collisionsEnabled;
					console.info("Collisions "+(this.collisionsEnabled ? "enabled." : "disabled."));
					break;
				case 'Numpad3':
				case 'Digit3': // toggle ambient light
					this.sceneBuilder.changeAmbientLight();
					console.info("Toggled ambient light.");
					break;
				case 'Numpad4':
				case 'Digit4': // toggle rain
					this.sceneBuilder.rain.visible = !this.sceneBuilder.rain.visible;
					console.info("Rain "+(this.sceneBuilder.rain.visible ? "enabled." : "disabled."));
					break;
				case 'Numpad5': 
				case 'Digit5': // toggle lightning
					this.sceneBuilder.disableLightning = !this.sceneBuilder.disableLightning;
					console.info("Lightning "+(this.sceneBuilder.disableLightning ? "enabled." : "disabled."));
					break;
				case 'Numpad6': 
				case 'Digit6': // toggle infinite lightning
					this.sceneBuilder.toggleInfiniteLightning = !this.sceneBuilder.toggleInfiniteLightning;
					console.info("Infinite lightning "+(this.sceneBuilder.toggleInfiniteLightning ? "enabled." : "disabled."));					
					break;
				case 'Numpad7':
				case 'Digit7': // trigger a lightning strike
					this.sceneBuilder.lightning.timeOut = 0;
					console.info("Lightning triggered.");
					break;
				case 'Numpad8':
				case 'Digit8': // toggle wireframe
					this.sceneBuilder.toggleWireframeScene();
					console.info("Toggled wireframes.");
					break; 
				case 'Numpad9':
				case 'Digit9': // toggle hint
					document.getElementById("hint").classList.toggle("hidden");
					console.info("Hint toggled.");	
					break;
				case 'KeyC': // log camera location and rotation
					if (this.debug)
					{
						const _toDegrees = function(rad) { return rad * 180 / Math.PI; }
						console.info("Camera rotation in degrees:\nX: "+_toDegrees(this.camera.rotation.x)+" deg\nY: "+_toDegrees(this.camera.rotation.y)+" deg\nZ: "+_toDegrees(this.camera.rotation.z)+"deg");
						console.info("Camera position:\nX: "+this.camera.position.x+"\nY: "+this.camera.position.y+"\nZ: "+this.camera.position.z);
					}
					break;
			}
		}
		
		this.dispose = function() {
			this.domElement.removeEventListener( 'click', _lockMouse );
			this.domElement.removeEventListener( 'keydown', _unlockMouse );
			this.domElement.removeEventListener( 'mousemove', _rotateFromMouseMovement );
			
			window.removeEventListener( 'keydown', _startMovement );
			window.removeEventListener( 'keyup', _stopMovement );
			
			window.removeEventListener( 'keydown', _changeMovementSpeedKeyDown );
			window.removeEventListener( 'wheel', _changeMovementSpeedWheel );
			
			window.removeEventListener( 'keydown', _miscKeyDown );
		}

		// Mouse locking
		this.domElement.requestPointerLock = this.domElement.requestPointerLock || this.domElement.mozRequestPointerLock; 
		document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock; // Firefox compatibility

		const _lockMouse = this.lockMouse.bind(this);
		const _unlockMouse = this.unlockMouse.bind(this);

		this.domElement.addEventListener('click', _lockMouse);
		this.domElement.addEventListener('keydown', _unlockMouse);
		
		// Look event
		const _rotateFromMouseMovement = this.rotateFromMouseMovement.bind(this);
		this.domElement.addEventListener('mousemove', _rotateFromMouseMovement);

		// Camera movement
		const _stopMovement = this.stopMovement.bind(this);
		const _startMovement = this.startMovement.bind(this);
		
		const _changeMovementSpeedKeyDown = this.changeMovementSpeedKeyDown.bind(this);
		const _changeMovementSpeedWheel = this.changeMovementSpeedWheel.bind(this);
		
		window.addEventListener('keydown', _startMovement);
		window.addEventListener('keyup', _stopMovement);
		
		window.addEventListener('keydown', _changeMovementSpeedKeyDown);
		window.addEventListener('wheel', _changeMovementSpeedWheel);
		
		// Misc
		const _miscKeyDown = this.miscKeyDown.bind(this);
		window.addEventListener('keydown', _miscKeyDown);
	}
	
	moveToStart()
	{
		var entryGate;
		this.sceneBuilder.fence.traverse( function (c) { if (c.name == "Gate") entryGate = c; } );
		
		this.camera.position.x = entryGate.position.x + this.sceneBuilder.north.x * this.scale;
		this.camera.position.z = entryGate.position.z + this.sceneBuilder.north.z * this.scale; 
		
		this.camera.position.y = 10;
		this.camera.position.y += this.maxGroundDist - this.getDistanceToGround();
		
		this.cameraPositioned = true;
	}
	
	update(deltaTime)
	{
		if (!this.cameraPositioned)
			this.moveToStart();
		
		// Raycaster first needs updating when moving for the first time, else player is thrown out of the world.
		if (!this.hasMoved)
		{
			if (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight)
			{
				this.hasMoved = true;
			}
			else 
			{
				if (this.debug) console.debug("DEBUG: FirstPersonCamera.update() entered before the player moved, aborting.");
				return;
			}
		}
		
		// Movement
		if (this.fly) 
		{
			if (this.mouseLocked())
			{
				if (this.debug)
					console.debug("this.domElement = "+this.domElement);
				
				document.exitPointerLock();
			}
			
			this.flyControls.update(deltaTime);
		}
		else
		{	
			// Set up needed variables
			var forwardVector = new THREE.Vector3(0,0,0);
			this.camera.getWorldDirection(forwardVector);
			forwardVector.y = 0;
			forwardVector.normalize();	
			
			var dirVector = new THREE.Vector3(0,0,0);
			var leftVector = new THREE.Vector3(0,0,0);
			leftVector.crossVectors(forwardVector, this.downVector);
	
			if ( this.moveForward && !this.moveBackward )
				dirVector.add(forwardVector);
			else if ( this.moveBackward && !this.moveForward )
				dirVector.sub(forwardVector);
			if ( this.moveLeft && !this.moveRight )
				dirVector.add(leftVector);
			else if ( this.moveRight && !this.moveLeft )
				dirVector.sub(leftVector);
			
			if (dirVector.length() == 0)
				return;
			
			// Handle collisions -> if something's in the movement direction (within set distance) DON'T move.
			if (this.collisionsEnabled && this.getIsColliding(dirVector))
			{
				if (this.debug)
					console.debug("Collision detected.");
					
				return;
			}
					
			
			// Move camera
			const actualMoveSpeed = deltaTime * this.movementSpeed;
			
			this.camera.position.x += actualMoveSpeed * dirVector.x;
			this.camera.position.z += actualMoveSpeed * dirVector.z;
			
			const groundDist = this.getDistanceToGround();
			
			// if groundDist is bigger or smaller than limit, push slightly towards limit (move up or down with the ground)
			if (groundDist > this.maxGroundDist)
			{
				this.camera.position.y -= Math.min(this.yMovementIncrement * deltaTime, groundDist - this.minGroundDist);
			}
			else if (groundDist < this.minGroundDist)
			{
				this.camera.position.y += Math.min(this.yMovementIncrement * deltaTime, this.maxGroundDist - groundDist);
			}
		}				
	}
	
	mouseLocked()
	{
		return document.pointerLockElement || document.mozPointerLockElement;
	}
	
	getIsColliding(dirVector)
	{
		var intersections = [];
		
		const offsetVector = dirVector.clone();
		offsetVector.multiplyScalar(this.collisionDist);
		
		const collisionRayOrigin = this.camera.position.clone();
		collisionRayOrigin.add( offsetVector ); 
	
		this.raycaster.set(collisionRayOrigin, this.downVector);
		this.raycaster.intersectObjects(this.sceneBuilder.objectsWithCollision, true, intersections);
	
		return ( intersections.length > 0 && intersections[0].point.y > this.sceneBuilder.groundMinHeight ) ;
	}
	
	getDistanceToGround() 
	{
		this.raycaster.set(this.camera.position, this.downVector);
		var intersections = this.raycaster.intersectObjects(this.sceneBuilder.walkableObjects);
		var distance = this.minGroundDist;
		
		if (this.debug)
			console.debug(intersections.length);
		
		for(var i = 0; i < intersections.length; i++)
		{
			distance = intersections[i].distance;
				
			if (this.debug)
			{
				console.debug("DEBUG: getDistanceToGround();\n>distance to closest walkable object: "+distance+"\n>closest walkable object: ");
				console.debug(intersections[i].object);
			}
			
			break;		
		}
		
		return distance;
	}
}
