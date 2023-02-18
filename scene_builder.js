import "https://cdn.jsdelivr.net/npm/three@0.146.0/examples/js/loaders/GLTFLoader.js";
import "https://cdn.jsdelivr.net/npm/three@0.146.0/examples/js/loaders/OBJLoader.js";

export class SceneBuilder
{
	constructor(scale = 1, debug = false)
	{		
		this.scene = new THREE.Scene();
		this.scene.name = "Main Scene";
				
		this.debug = debug;		
		this.scale = scale;
		this.textureLoader = new THREE.TextureLoader();
		this.objLoader = new THREE.OBJLoader();
		this.gltfLoader = new THREE.GLTFLoader();
		
		this.xAxis = new THREE.Vector3(1,0,0);
		this.yAxis = new THREE.Vector3(0,1,0);
		this.zAxis = new THREE.Vector3(0,0,1);
		
		this.walkableObjects = [];
		this.objectsWithCollision = [];
		this.failedToGroundObjects = [];
		
		this.setSceneVariables();
		this.clearSceneBuiltFlags();
	}
	
	setSceneVariables () 
	{
		// Cardinal directions
		this.north = { z: -1, x: 0 };
		this.south = { z: 1, x: 0 };
		this.east = { z: 0, x: 1 };
		this.west = { z: 0, x: -1 };
		
		// ground
		this.graveyardSideLength = 27 * this.scale; // Square by design | 27 plays nice with the fence, best left unchanged to avoid holes
		this.groundSizeX = this.groundSizeZ = this.graveyardSideLength * 2 // make ground extend beyond the walls into the fog
	
		this.groundMinHeight = 0; 
		this.groundMaxHeight = 1.5; // These are set when the ground noise is generated.
		
		// objects
		this.mausoleumDistFromFence = 5 * this.scale;
			
		// lightning
		this.skyBounds = new THREE.Box3();
		this.skyBounds.min.set( -60, 30, -60 );
		this.skyBounds.max.set( 60, 50, 60 );
		this.lightningPowerRange = { min: 1, max: 7 }
		this.lightningDurationRange = { min: 1, max: 3 } // in seconds
		this.lightningTimeOutRange = { min: 2, max: 30 } // in seconds
		this.lightningMaxTravelDistance = 5;
		this.toggleInfiniteLightning = false;
			
		this.makeGravePositions();
		this.makeTreePositions();
		this.makeLanternPositions();
		this.makeUrnPositions();
		this.makeKeyPositions()
	}
	
	clearSceneBuiltFlags()
	{
		this.sceneBuilt = 
		this.miscBuilt = 
		this.groundBuilt = 
		this.objectsBuilt = 
			false;
	}
	
	buildAll()
	{
		this.clearSceneBuiltFlags();
		
		this.buildMisc();
		this.buildGround(); // should be built before other parts of the scene to initialise the min and max ground height values
		this.buildObjects();
		
		this.updateSceneBuilt();
	}

	buildMisc()
	{	
		this.lightAmbient = new THREE.AmbientLight( 0x050505 ); 
		this.lightAmbient.baseColour = this.lightAmbient.color; // base ambient light of the scene
		this.lightAmbient.debugColour = new THREE.Color( 0xbbbbbb ); // debug light
		this.scene.add(this.lightAmbient);
			
		// Rain
		this.numRainParticles = 10000;
		this.maxRainHeight = this.skyBounds.max.y;
		this.minRainHeight = this.groundMinHeight - 1;
		
		const dirX = (Math.random() * 0.2) - 0.1;
		const dirZ = (Math.random() * 0.2) - 0.1;
		const dirY = (Math.random() * -0.1) - 0.35;
		if (this.debug) console.debug("Down velocity of rain: "+dirY);
		this.rainVelocity = new THREE.Vector3(dirX,dirY,dirZ);
		this.rainVelocity.multiplyScalar(this.scale);

		this.rainArea = new THREE.Box2().setFromCenterAndSize( // y is z!!
			new THREE.Vector2(-this.rainVelocity.x * 100 * this.scale,-this.rainVelocity.z * 100 * this.scale),
			new THREE.Vector2(this.groundSizeX, this.groundSizeZ)
		);

		const rainDrops = [];
		for ( var i = 0; i < this.numRainParticles; i++ )
		{
			var x = (Math.random() * (Math.abs(this.rainArea.min.x) + this.rainArea.max.x)) + this.rainArea.min.x;
			var z = (Math.random() * (Math.abs(this.rainArea.min.y) + this.rainArea.max.y)) + this.rainArea.min.y;
			var y = (Math.random() * (this.minRainHeight + this.maxRainHeight)) + this.minRainHeight;
			rainDrops.push( x, y, z );
		}

		const rain_g = new THREE.BufferGeometry(); 
		rain_g.setAttribute( 'position', new THREE.Float32BufferAttribute( rainDrops, 3 ) );

		// > use canvas to make circle sprite for material
		var matCanvas = document.createElement('canvas');
		matCanvas.width = matCanvas.height = 128;
		var radius = matCanvas.width/2;
		var matContext = matCanvas.getContext('2d');
		matContext.arc(radius, radius, radius, 0, Math.PI*2, false);
		matContext.closePath();
		matContext.fillStyle = "#e5ebf1";
		matContext.fill();
		var circleTexture = new THREE.Texture(matCanvas);
		circleTexture.needsUpdate = true;

		const rain_m = new THREE.PointsMaterial( { size: 0.015, map: circleTexture, transparent: true, opacity: 0.4, fog: true } );
		this.rain = new THREE.Points( rain_g, rain_m ); 
		this.rain.name = "Rain";
		this.scene.add( this.rain );
				
		// Clouds
		const skyXZSquared = (this.skyBounds.max.x - this.skyBounds.min.x) * (this.skyBounds.max.z - this.skyBounds.min.z); 
		const numClouds =  skyXZSquared / 150; // 1 cloud per 150 meters squared of skybox XZ
		const numCloudTypes = 4;
		this.clouds = new THREE.Group();
		this.clouds.name = "Clouds";
		const cloudTypes = [];
		
		const _processClouds = (function ( ) {
			for (var i = 0; i < numClouds; i++)
			{
				const cloudIndex = Math.floor( Math.random() * numCloudTypes );
				const cloudTemplate = cloudTypes[cloudIndex];
				const cloud = cloudTemplate.clone();
				
				var o = this.skyBounds.min.x;
				var k = this.skyBounds.max.x - this.skyBounds.min.x;
				cloud.position.x = o + (Math.random() * k);	
				
				o = this.skyBounds.min.z;
				k = this.skyBounds.max.z - this.skyBounds.min.z;
				cloud.position.z = o + (Math.random() * k);	
				
				o = this.skyBounds.min.y;
				k = this.skyBounds.max.y - this.skyBounds.min.y;
				cloud.position.y = o + (Math.random() * k);				
				
				cloud.rotateX(Math.PI/2);
				cloud.rotateOnWorldAxis( this.yAxis, Math.random() * 2*Math.PI ); 
				
				this.clouds.add( cloud );
			}
		}).bind(this);
		
		const _onCloudLoad = (function ( texture ) {
			var cloud_g = new THREE.PlaneGeometry( 50, 50 );
			var cloud_m = new THREE.MeshPhongMaterial( { map: texture, transparent: true, opacity: 0.6, alphaTest: 0.2, shininess: 100 } );
			const cloud = new THREE.Mesh( cloud_g, cloud_m );
			cloud.name = "Cloud";
			
			cloudTypes.push( cloud );
			
			if (cloudTypes.length == numCloudTypes)
				_processClouds();
		}).bind(this);
		
		
		for (var i = 1; i <= numCloudTypes; i++)
		{
			this.textureLoader.load(
				'./textures/clouds/cloud'+i+'/cloud'+i+'.png',
				_onCloudLoad
				);
		}
		
		this.scene.add( this.clouds );
		
		// Lightning
		this.lightning = new THREE.PointLight(0xdbe0e7, 30, this.skyBounds.max, 1.7); // blueish white
		this.lightning.position.copy( this.clouds.position );
		//this.lightning.castShadow = true; // Due to how frantic it's movement is it doesn't look good
		this.lightning.shadow.bias -= 0.004;
		this.lightning.visible = false;
		this.lightning.timeOut = 10; // first lightning strikes after 10 seconds
		this.scene.add( this.lightning );
				
		// flags
		this.miscBuilt = true;
		console.log("SceneBuilder: Misc built.");
		this.updateSceneBuilt();
	}
	
	configureShadows()
	{
		// Note: light sources have their flag set on creation, but this function simplifies config for scene objects
		
		this.ground.receiveShadow = true;
		this.ground.castShadow = false; 
		
		this.cobbledPath.receiveShadow = true;
		this.cobbledPath.castShadow = false; 

		this.trees.traverse( (function ( child ) {
			if ( child instanceof THREE.Mesh ) 
			{ 
				child.receiveShadow = true;
				child.castShadow = true;
			}
		}).bind(this));

		this.mausoleum.traverse( (function ( child ) {
			if ( child instanceof THREE.Mesh ) 
			{ 
				child.receiveShadow = true;
				child.castShadow = true;
			}
		}).bind(this));
		
		this.graves.children.forEach( function ( child ) {
			var gravestone = child.children.find( c => { return c.name.includes("Gravestone") } ); 
			if ( gravestone )
			{
				gravestone.traverse( (function ( g ) {
				if ( g instanceof THREE.Mesh ) 
				{ 
					g.receiveShadow = true;
					g.castShadow = true;
				}
				}).bind(this));
			}
			
			var grave = child.children.find( c => { return c.name.includes("Stone Grave") || c.name.includes("Mound Grave") } );
			if( grave )
			{
				grave.traverse( (function ( child ) {
				if ( child instanceof THREE.Mesh ) 
				{ 
					child.receiveShadow = true;
					child.castShadow = true;
				}
				}).bind(this));
			}
		});
		
		const urns = this.clutter.children.find( c => { return c.name == "Urns" } );
		if (urns)
		{
			urns.traverse( (function ( child ) {
				if ( child instanceof THREE.Mesh ) 
				{ 
					child.receiveShadow = true;
					child.castShadow = true;
				}
			}).bind(this));
		}
		
		const branches = this.clutter.children.find( c => { return c.name == "Branches" } );
		if (branches)
		{
			branches.traverse( (function ( child ) {
				if ( child instanceof THREE.Mesh ) 
				{ 
					child.receiveShadow = true;
					child.castShadow = false;
				}
			}).bind(this));
		}
		
		const rocks = this.clutter.children.find( c => { return c.name == "Rocks" } );
		if (rocks)
		{
			rocks.traverse( (function ( child ) {
				if ( child instanceof THREE.Mesh ) 
				{ 
					child.receiveShadow = true;
					child.castShadow = true;
				}
			}).bind(this));
		}
		
		this.fence.traverse( (function ( child ) {
			if ( child instanceof THREE.Mesh && !child.name.includes("pillar") && !child.name.includes("light") ) // pillar makes big square shadow because of the light being on top of it
			{ 
				child.receiveShadow = true;
				child.castShadow = true;
			}
		}).bind(this));
		
		this.key.traverse( (function ( child ) {
			if ( child instanceof THREE.Mesh ) 
			{ 
				child.receiveShadow = true;
				child.castShadow = false;
			}
		}).bind(this));
				
		console.log("SceneBuilder: Shadows Configured.");
	}
	
	buildGround()
	{
		const groundSegmentsX = this.groundSizeX*2;
		const groundSegmentsY = this.groundSizeZ*2;
		
		const maxHeightSlopes = 1.5;
		const slopesNoiseIncrement = 0.0111661;
		const maxHeightUnevenness = 0.1;
		const unevennessNoiseIncrement = 0.98896165;
		
		// Create ground plane and apply noise
		const ground_g = new THREE.PlaneGeometry(this.groundSizeX, this.groundSizeZ, groundSegmentsX, groundSegmentsY);
		this.apply2DPerlinNoiseOnZ( ground_g, groundSegmentsX+1, groundSegmentsY+1, 0, maxHeightSlopes, slopesNoiseIncrement ); // slopes
		this.apply2DPerlinNoiseOnZ( ground_g, groundSegmentsX+1, groundSegmentsY+1, 0, maxHeightUnevenness, unevennessNoiseIncrement ); // small unevenness

		ground_g.computeVertexNormals();
		this.setHighestLowestPointOfPlane( ground_g, groundSegmentsX+1, groundSegmentsY+1 )
		
		// Handle Loading Flags
		var texturesLoaded = false;
		var functionReachedEnd = false;
		var cobbledPathBuilt = false;

		var updateGroundBuilt = function() 
		{	
			this.groundBuilt = 
				texturesLoaded &&
				functionReachedEnd;
				
			if (this.groundBuilt)
			{
				console.log("SceneBuilder: Ground built.");
				this.updateSceneBuilt();
			}
		}
		const _updateGroundBuilt = updateGroundBuilt.bind(this);
		
		// Load Textures
		var ground_m;
		const textureRepeats = [10,10];
		const textureOffset = [0.4,0.2];
		const textureWrapping = THREE.RepeatWrapping;
		
		const onLoadMat = function( mat ) 
		{ 
			// on load map
			var onLoadTexture = function( texture ) { 				
				texture.wrapS = texture.wrapT = textureWrapping;
				texture.repeat.set( textureRepeats[0], textureRepeats[1] );
				texture.offset.set( textureOffset[0], textureOffset[1] );
			};
			var _onLoadTexture = onLoadTexture.bind(this);
						
			mat.roughnessMap = this.textureLoader.load(
				'textures/grass_path_2/grass_path_2_rough_4k.jpg',
				_onLoadTexture
			);
		
			ground_m = mat;
			ground_m.roughness = 0.8;
			
			const ground = new THREE.Mesh(ground_g,ground_m);
			ground.name = "Ground";
			ground.position.set(0,0,0);
			ground.rotateX(-Math.PI/2);

			this.walkableObjects.push(ground);
			this.scene.add( ground );	
			
			this.ground = ground;
			this.buildCobbledPath( function () { 
				cobbledPathBuilt = true;
				_updateGroundBuilt();
			});
		
			texturesLoaded = true;
			_updateGroundBuilt();
		};
		const _onLoadMat = onLoadMat.bind(this);
		
		this.makeMaterial(
			_onLoadMat,
			'textures/grass_path_2/grass_path_2_diff_4k.jpg', 
			'textures/grass_path_2/grass_path_2_normal_4k.jpg', 
			null, // no bump map
			textureRepeats,
			textureWrapping,
			textureOffset,
			new THREE.MeshStandardMaterial()
		);	
		
		
		// Flags
		functionReachedEnd = true;
		_updateGroundBuilt();
	}
	
	setHighestLowestPointOfPlane(geometry, numVerticesX, numVerticesY)
	{
		var maxZ = 0;
		var minZ = 0;
		var positionAttribute = geometry.getAttribute( 'position' );
		const vertex = new THREE.Vector3();
		
		for (var x = 0; x < numVerticesX; x++)
		{
			for (var y = 0; y < numVerticesY; y++)
			{			
				// coord to index
				const vIndex = (x*numVerticesX) + y;
				
				// get vertex
				vertex.fromBufferAttribute(positionAttribute, vIndex);
				
				// check max and min
				maxZ = Math.max(vertex.z, maxZ)
				minZ = Math.min(vertex.z, minZ)
			}
		}
		
		this.groundMaxHeight = maxZ;
		this.groundMinHeight = minZ;
	}
	
	apply2DPerlinNoiseOnZ(geometry, numVerticesX, numVerticesY, minRaise, maxRaise, noiseIncrement, seed = -1)
	{
		// Initialise Perlin noise
		seed = (seed == -1) ? Math.random() : seed;
		const { Perlin, FBM } = THREE_Noise;
		const noiseHandler = new Perlin(seed);
		
		// Transform plane according to generated noise		
		const vertex = new THREE.Vector3();
		var xOffset = 0;
		var yOffset = 0;
		
		var positionAttribute = geometry.getAttribute( 'position' ); 
		var noiseOffsetVector = new THREE.Vector2(0,0);
		for (var x = 0; x < numVerticesX; x++)
		{
			yOffset = 0;
			for (var y = 0; y < numVerticesY; y++)
			{			
				// coord to index
				const vIndex = (x*numVerticesY) + y;
				
				// get vertex
				vertex.fromBufferAttribute(positionAttribute, vIndex);
				
				// set offset vector
				noiseOffsetVector.set(xOffset,yOffset);
				
				// get noise and map to range
				const noiseValue = noiseHandler.get2(noiseOffsetVector);
				const newZ = vertex.z + Perlin.map(noiseValue,0,1,minRaise,maxRaise);
	
				positionAttribute.setZ(vIndex, newZ);
				
				yOffset += noiseIncrement;
				
				if (this.debug) console.debug(vIndex+":\nVertex coord = ["+x+","+y+"]\nNoise offset = ["+xOffset+","+yOffset+"]\nNoise value = "+noiseValue+"\nNew z = "+newZ);
			}
			xOffset += noiseIncrement;
		}
		
		positionAttribute.needsUpdate = true;
	}
	
	async buildCobbledPath( onBuilt )
	{
		const segmentsX = 50;
		const segmentsY = 10;
		const segmentsZ = 1;
		const pathLength = this.graveyardSideLength * (4/5);
		const pathWidth = 3.5*this.scale;
		const path_g = new THREE.BoxGeometry( pathLength, pathWidth, 0.1*this.scale, segmentsX, segmentsY, segmentsZ );
		const path_m = new THREE.MeshStandardMaterial( );
		
		// create mesh, rotate and position
		const path = new THREE.Mesh(path_g, path_m);
		path.name = "Cobbled Path";
		this.cobbledPath = path;
				
		path.rotateY(Math.PI/2);
		path.rotateX(Math.PI/2);
		
		path.position.x += (this.south.x * (this.graveyardSideLength - pathLength)/2);
		path.position.z += (this.south.z * (this.graveyardSideLength - pathLength)/2);
		
		// magic numbers for simplicity :(
		const magicNudge = 2.2;
		path.position.x += (this.west.x * magicNudge) + (this.south.x * magicNudge);
		path.position.z += (this.west.z * magicNudge) + (this.south.z * magicNudge);
		
		// apply sigmoid to geometry to bend it from gate to mausoleum, and also to ground it
		const posAttribute = path_g.getAttribute( 'position' );	
		
		const vertex = new THREE.Vector3();
		
		for (var i = 0; i < posAttribute.count; i++)
		{
			vertex.fromBufferAttribute(posAttribute, i);
			
			// calculate offset via sigmoid function
			const sigmoid = function ( x ) {
				return 2.3 / (1 + Math.exp(-x));
			};
			
			var offset = sigmoid(vertex.x);
					
			const newY = vertex.y + offset; 	
			posAttribute.setY(i, newY);
	
			//set Z (y in world scope) to copy the ground
			const worldPos = new THREE.Vector3(vertex.x, newY, vertex.z);
			worldPos.applyQuaternion(path.quaternion);
			worldPos.add( path.position );		
			const testHightOffset = 3;
			worldPos.y += testHightOffset; // y due to dealing with world position now, not local, which swaps z and y
			
			const distToGround = await this.getDistanceToGround(worldPos);
			const newZ = (distToGround == -1 && i > 0) ? posAttribute.getZ(i-1) : 2*vertex.z + (distToGround - testHightOffset); 
			posAttribute.setZ(i, newZ);
		}
		
		posAttribute.needsUpdate = true;
		path_g.computeVertexNormals();
		
		// Textures
		const textureRepeats = [pathLength/pathWidth,1];
		const textureOffset = [0,0];
		const textureWrapping = THREE.RepeatWrapping;
		
		this.makeMaterial(
			function (  ) {  },
			'textures/cobblestone/cobblestone_large_01_diff_2k.jpg', 
			'textures/cobblestone/cobblestone_large_01_nor_gl_2k.png', 
			null, // no bump map
			textureRepeats,
			textureWrapping,
			textureOffset,
			path_m
		);
		
		var onLoadTexture = function( texture ) { 				
				texture.wrapS = texture.wrapT = textureWrapping;
				texture.repeat.set( textureRepeats[0], textureRepeats[1] );
				texture.offset.set( textureOffset[0], textureOffset[1] );
		};
		var _onLoadTexture = onLoadTexture.bind(this);
		
		path_m.roughnessMap = this.textureLoader.load(
			'textures/cobblestone/cobblestone_large_01_rough_2k.jpg',
			_onLoadTexture
		);
		
		this.walkableObjects.push( this.cobbledPath );
		this.scene.add( this.cobbledPath );
		
		console.log("SceneBuilder: Cobbled Path Built.");
		onBuilt();
	}
	
	buildObjects()
	{
		var functionFinished = false;
		var loadedFlags = {};
		var updateObjectsBuilt = function() 
		{	
			var allLoaded = true;
			for(var key in loadedFlags) {
				allLoaded = allLoaded && loadedFlags[key];
			}
		
			this.objectsBuilt = 
				allLoaded &&
				functionFinished;
				
			if (this.objectsBuilt)
			{
				console.log("SceneBuilder: Objects built.");
				this.updateSceneBuilt();
			}
		}
		const _updateObjectsBuilt = updateObjectsBuilt.bind(this);
		
		// Fence
		loadedFlags["fence"] = false;
		const onBuildFence = function(){
			loadedFlags["fence"] = true;
			_updateObjectsBuilt();
		};
		const _onBuildFence = onBuildFence.bind(this);
		this.buildFence(_onBuildFence);
		
		// Mausoleum
		loadedFlags["mausoleum"] = false;
		const onBuildMausoleum = function(){
			loadedFlags["mausoleum"] = true;
			_updateObjectsBuilt();
		};
		const _onBuildMausoleum = onBuildMausoleum.bind(this);
		this.buildMausoleum(_onBuildMausoleum);
				
		// Graves
		loadedFlags["graves"] = false;
		const onBuildGraves = function(){
			loadedFlags["graves"] = true;
			_updateObjectsBuilt();
		};
		const _onBuildGraves = onBuildGraves.bind(this);
		this.buildGraves(_onBuildGraves);
		
		// Trees
		loadedFlags["trees"] = false;
		const onBuildTrees = function(){
			loadedFlags["trees"] = true;
			_updateObjectsBuilt();
		};
		const _onBuildTrees = onBuildTrees.bind(this);
		this.buildTrees(_onBuildTrees);
		
		// Lanterns
		loadedFlags["lanterns"] = false;
		const onBuildLanterns = function(){
			loadedFlags["lanterns"] = true;
			_updateObjectsBuilt();
		};
		const _onBuildLanterns = onBuildLanterns.bind(this);
		this.buildLanterns(_onBuildLanterns);
		
		// Clutter
		loadedFlags["clutter"] = false;
		const onBuildClutter = function(){
			loadedFlags["clutter"] = true;
			_updateObjectsBuilt();
		};
		const _onBuildClutter = onBuildClutter.bind(this);
		this.buildClutter(_onBuildClutter);
		
		// Key
		loadedFlags["key"] = false;
		const onBuildKey = function(){
			loadedFlags["key"] = true;
			_updateObjectsBuilt();
		};
		const _onBuildKey = onBuildKey.bind(this);
		this.buildKey(_onBuildKey);
		
		// Flags
		var functionFinished = true;
		_updateObjectsBuilt();
	}
	
	buildFence( onBuilt )
	{
		const fence = new THREE.Group();
		fence.name = "Fence Whole";
				
		var gateBuilt = false, wallBuilt = false, functionFinished = false;
		const checkFinished = function () {
			const allDone = 
				gateBuilt &&
				wallBuilt &&
				functionFinished;
				
			if ( allDone )
			{
				console.log("SceneBuilder: Fence built.");
				onBuilt();
			}
		};
		const _checkFinished = checkFinished.bind(this);
				
		// Gate		
		const onLoadGate = async function ( gate )
		{	
			gate.name = "Gate";
			
			var gate_m, lightlower_m, lightupper_m, pillar_m, lightEmissiveMap;
			var gateLoaded, lightlowerLoaded, lightupperLoaded, pillarLoaded, emissiveMapLoaded;
			gateLoaded = lightlowerLoaded = lightupperLoaded = pillarLoaded = emissiveMapLoaded = false;
			
			const gateLight = new THREE.PointLight( 0xf6e1ae, 1, 10 );
			gateLight.name = "Gate Light";
			gateLight.castShadow = true;
			gateLight.shadow.bias -= 0.004;
			
			const updateMaterialsLoaded = function() {
				if ( gateLoaded && lightlowerLoaded && lightupperLoaded && pillarLoaded  && emissiveMapLoaded )
				{
					gate.traverse( 
						(function ( child ) {
							if ( child instanceof THREE.Mesh ) 
							{ 
								if (child.name.includes("lightlower"))
								{
									lightlower_m.emissive = gateLight.color;
									lightlower_m.emissiveMap = lightEmissiveMap;
									lightlower_m.emissiveIntensity = 1;
									child.material = lightlower_m;
								}
								else if (child.name.includes("lightupper"))
								{
									child.material = lightupper_m;
									
									const bounds = new THREE.Box3().setFromObject(child);
									const centre = new THREE.Vector3();
									centre.lerpVectors( bounds.min, bounds.max, 0.5 );
									centre.sub( gate.position );
									centre.set( centre.x*1/gate.scale.x, centre.y*1/gate.scale.y, centre.z*1/gate.scale.z );
									
									if (gate.children.includes(gateLight))
									{
										const clone = gateLight.clone();
										clone.position.copy( centre );
										gate.add( clone );
									}
									else
									{
										gateLight.position.copy( centre );
										gate.add(gateLight);
									}
								}
								else if (child.name.includes("pillar"))
								{
									child.material = pillar_m;
								}
								else if (child.name.includes("gate_main"))
								{
									child.material = gate_m;
								}
							}
						}).bind(this)
					);
				}
			}
			const _updateMaterialsLoaded = updateMaterialsLoaded.bind(this);
			
			this.makeMaterial(
				function( mat ) { gate_m = mat; gateLoaded = true; _updateMaterialsLoaded(); },
				'models/gate/textures/gate_diffuse.jpg', 
				'models/gate/textures/gate_normal.jpg'				
			);
			
			this.makeMaterial(
				function( mat ) { lightlower_m = mat; lightlowerLoaded = true; _updateMaterialsLoaded(); },
				'models/gate/textures/lightlower_diffuse.jpg', 
				'models/gate/textures/lightlower_normal.jpg'				
			);
			
			this.makeMaterial(
				function( mat ) { lightupper_m = mat; lightupperLoaded = true; _updateMaterialsLoaded(); },
				'models/gate/textures/lightupper_diffuse.jpg', 
				'models/gate/textures/lightupper_normal.jpg'				
			);
			
			this.makeMaterial(
				function( mat ) { pillar_m = mat; pillarLoaded = true; _updateMaterialsLoaded(); },
				'models/gate/textures/pillar_diffuse.jpg', 
				'models/gate/textures/pillar_normal.jpg'				
			);

			this.textureLoader.load(
				'models/gate/textures/lightlower_emission.jpg',
				function( texture ) { lightEmissiveMap = texture; emissiveMapLoaded = true; _updateMaterialsLoaded(); }
			);
			
			gate.scale.x = gate.scale.y = gate.scale.z = 0.052 * this.scale;
						
			var bounds = new THREE.Box3().setFromObject(gate);
			
			const gateNudge = -0.55; // unfortunately a magic number to save time
			gate.position.x = (this.south.x * this.graveyardSideLength / 2) + (this.west.x * ((bounds.max.x - bounds.min.x)/2 + gateNudge));
			gate.position.z = (this.south.z * this.graveyardSideLength / 2) + (this.west.z * ((bounds.max.z - bounds.min.z)/2 + gateNudge));
			
			// move on Y			
			bounds.setFromObject(gate);
			await this.moveToGround(gate, [bounds.min, bounds.max], -0.02);
			
			var gateBounds = new THREE.Box3();
			gateBounds.setFromObject(gate);
			
			fence.add(gate);
			this.gate = gate;
			
			gateBuilt = true;
			_checkFinished();
		}
		const _onLoadGate = onLoadGate.bind(this);
		
		this.loadOBJ(
			'models/gate/gate_obj.obj', 
			_onLoadGate
		);
				
		// Walls
		var pillarLoaded, wallLoaded = false;
		var pillar, wall;
		
		const onLoadFence = function ( )
		{			
			if ( !pillarLoaded || !wallLoaded )
				return;
			
			var fenceSegment = new THREE.Group();
			fenceSegment.name = "Fence Wall Segment";
			wall.name = "Wall";
			fenceSegment.add(wall);				  // group with fence and wall separate
			pillar = pillar.children[0];		  // only one child, get direct access
			pillar.name = "Pillar";
			fenceSegment.add(pillar); 
			
			fenceSegment.scale.x = fenceSegment.scale.y = fenceSegment.scale.z = 0.0357 * this.scale; // important time-saving magic number
									
			var boundsWall = new THREE.Box3().setFromObject(wall);
			var boundsPillar = new THREE.Box3().setFromObject(pillar);
			var touchOffset = 3; // magic number to connect the wall segments together
			pillar.position.z = boundsWall.max.z + boundsPillar.max.z - touchOffset;
			
			var segmentScale = new THREE.Vector3();
			fenceSegment.getWorldScale(segmentScale);
			const segmentLength = (boundsWall.max.z * 2 + boundsPillar.max.z * 2 - touchOffset) * segmentScale.x;
			const edgeDist = (this.graveyardSideLength/2) - 0.0001;
		
			var borderN = new THREE.Group(); 	
			borderN.name = "Border Fence North";
			borderN.position.x = (this.east.x * edgeDist) + (this.north.x * edgeDist);
			borderN.position.z = (this.east.z * edgeDist) + (this.north.z * edgeDist); // place origin in NE corner
			borderN.rotateY(Math.PI/2);	// rotate
			fence.add(borderN);
			
			var borderE = new THREE.Group();
			borderE.name = "Border Fence East";
			borderE.position.x = (this.east.x * edgeDist) + (this.south.x * edgeDist);
			borderE.position.z = (this.east.z * edgeDist) + (this.south.z * edgeDist); // place origin in SE corner
			fence.add(borderE);
			
			var borderW = new THREE.Group();
			borderW.name = "Border Fence West";
			borderW.position.x = (this.west.x * edgeDist) + (this.north.x * edgeDist); 
			borderW.position.z = (this.west.z * edgeDist) + (this.north.z * edgeDist); // place origin in NW corner
			borderW.rotateY(Math.PI);	// rotate
			fence.add(borderW);
			
			var borderS = new THREE.Group();
			borderS.name = "Border Fence South";
			borderS.position.x = (this.west.x * edgeDist) + (this.south.x * edgeDist); 
			borderS.position.z = (this.west.z * edgeDist) + (this.south.z * edgeDist); // place origin in SW corner
			borderS.rotateY(-Math.PI/2);	// rotate
			fence.add(borderS);
			
			var groundCheckPointsN = [];
			var groundCheckPointsE = [];
			var groundCheckPointsW = [];
			var groundCheckPointsS = [];
			
			var segmentsToBorder = this.graveyardSideLength / (segmentLength - touchOffset*segmentScale.z);
						
			for( var i = 1; i < segmentsToBorder; i++ )
			{
				var segmentPosZ = -(((i-1) * (segmentLength - (touchOffset*segmentScale.z))) + segmentLength/2);
				var worldPos = new THREE.Vector3();
				var segment;
				
				const addSegment = function (border, posArray) {
					segment = fenceSegment.clone();
					segment.position.z = segmentPosZ;				
					border.add( segment );
					segment.children[1].getWorldPosition( worldPos );
					posArray.push( worldPos ); // push pillar position
				}
				
				addSegment(borderN, groundCheckPointsN);
				addSegment(borderE, groundCheckPointsE);
				addSegment(borderW, groundCheckPointsW);
				if (i !=  Math.trunc(segmentsToBorder/2)) // leave space for a gate
					addSegment(borderS, groundCheckPointsS);
				if (i == Math.trunc(segmentsToBorder/2)+1)
					segment.children[1].removeFromParent(); // remove pillar from the next one
			}
			
			var builtWalls = 0;
			
			const _finishBuildingWalls = (function () {
				wallBuilt = true;
				_checkFinished();
			}).bind(this);
			
			const _adjustFenceSegmentsY = (async function ( child ) {
				const bounds = new THREE.Box3().setFromObject( child );
				
				await this.moveToGround( child, [bounds.min, bounds.max], -0.02);
				
				if (++builtWalls == 4)
					_finishBuildingWalls();
			}).bind(this);
			
			borderN.children.forEach(
				_adjustFenceSegmentsY
			);
			borderE.children.forEach(
				_adjustFenceSegmentsY
			);
			borderW.children.forEach(
				_adjustFenceSegmentsY
			);
			borderS.children.forEach(
				_adjustFenceSegmentsY
			);
		}
		const _onLoadFence = onLoadFence.bind(this);
		
		this.loadGLTF(
			'models/fence/pillar.glb', 
			function ( object ) { pillar = object.scene; pillarLoaded = true; _onLoadFence() }
		);
		
		this.loadGLTF(
			'models/fence/wall.glb', 
			function ( object ) { wall = object.scene; wallLoaded = true; _onLoadFence() }
		);
		
		this.objectsWithCollision.push( fence );
		this.scene.add( fence );
		this.fence = fence;
		
		functionFinished = true;
		_checkFinished();
	}
	
	buildMausoleum( onBuilt )
	{
		const onLoad = async function ( object ) { 
			var mausoleum = object.scene.children[0];
			mausoleum.name = "Mausoleum"
			
			mausoleum.scale.x = mausoleum.scale.y = mausoleum.scale.z = 0.014 * this.scale;
			mausoleum.position.x = this.north.x * (this.graveyardSideLength/2 - this.mausoleumDistFromFence);
			mausoleum.position.z = this.north.z * (this.graveyardSideLength/2 - this.mausoleumDistFromFence);
			
			var testPoints = [];
			testPoints.push( mausoleum.position );
			
			const bounds = new THREE.Box3().setFromObject(mausoleum);
			var boundsSize = new THREE.Vector3();
			bounds.getSize(boundsSize);
			
			testPoints.push( bounds.min );
			testPoints.push( bounds.max );			
			testPoints.push( new THREE.Vector3( bounds.max.x, 0, bounds.min.z ) );
			testPoints.push( new THREE.Vector3( bounds.min.x, 0, bounds.max.z ) );	
			
			await this.moveToGround(mausoleum, testPoints, -0.1);
						
			this.scene.add(mausoleum);
			this.mausoleum = mausoleum;
			
			this.objectsWithCollision.push(this.mausoleum);
			
			console.log("SceneBuilder: Mausoleum built.");
			onBuilt();
		};
		
		const _onLoad = onLoad.bind(this);
		
		this.loadGLTF(
			'models/mausoleum/mausoleum.glb', 
			_onLoad
		);
	}
	
	buildGraves( onBuilt )
	{
		// Generate & place graves
		var gravestones = [];
		var graves = [];		
		var graveRoughSize = new THREE.Vector3();
		
		var gravestonesPrepared = false;
		var gravesPrepared = false;
		
		const buildGraves = function ( )
		{			
			if ( !gravestonesPrepared || !gravesPrepared )
				return;
			
			this.graves = new THREE.Group();
			this.graves.name = "Graves";
			
			this.graveTransforms.forEach( (async function ( transform ) {
				var randomGrave = this.generateGrave( gravestones, graves );
				
				if (randomGrave.children.length == 0)
					return;
				
				randomGrave.position.copy( transform.pos );
				randomGrave.rotateOnWorldAxis( this.xAxis, transform.rot.x );
				randomGrave.rotateOnWorldAxis( this.yAxis, transform.rot.y );
				randomGrave.rotateOnWorldAxis( this.zAxis, transform.rot.z );
				
				const boundsGrave = new THREE.Box3().setFromObject( randomGrave );
				const testPoints = [];
				testPoints.push( boundsGrave.min );
				testPoints.push( boundsGrave.max );
				testPoints.push( new THREE.Vector3( boundsGrave.max.x, 0, boundsGrave.min.z ) );
				testPoints.push( new THREE.Vector3( boundsGrave.min.x, 0, boundsGrave.max.z ) );
				testPoints.push( new THREE.Vector3( (boundsGrave.max.x + boundsGrave.min.x)/2, 0, (boundsGrave.max.z + boundsGrave.min.z)/2 ) );
				await this.moveToGround(randomGrave, testPoints, 0);
				
				if (randomGrave.isKnockedOver) // ground the gravestone on its own and make it walkable
				{
					const knockedGravestone = randomGrave.children[0];
					const boundsGravestone = new THREE.Box3().setFromObject( knockedGravestone );
					var gravestoneSize = new THREE.Vector3();
					boundsGravestone.getSize(gravestoneSize);
					const testPoints = [];
					testPoints.push( boundsGravestone.min );
					testPoints.push( boundsGravestone.max );
					testPoints.push( new THREE.Vector3( (boundsGravestone.max.x + boundsGravestone.min.x)/2, 0, (boundsGravestone.max.z + boundsGravestone.min.z)/2 ) );
					const offset = gravestoneSize.y/2;
					await this.moveToGround(knockedGravestone, testPoints, offset );
				}
				
				this.graves.add( randomGrave );
			}).bind(this));
			
			this.scene.add( this.graves );
			console.log("SceneBuilder: Graves built.");
			onBuilt();
		}
		const _buildGraves = buildGraves.bind(this);
		
		// prep gravestones
		var gravestonesLoaded = [];
		
		const onLoadGravestones = function ( )
		{			
			if ( gravestonesLoaded.includes(false) )
				return;
			
			// unload scenes and keep individual gravestones
			const scenesLoaded = gravestones.length; 
			for (var i = 0; i < scenesLoaded; i++)
			{
				if (gravestones[i].children.length == 1)
				{
					gravestones[i].name = "Gravestone type "+i;
				}
				else
				{
					const children = gravestones[i].children;
					while (children.length > 0)
					{
						const child = children[0];
						child.removeFromParent();
						const gravestoneRoot = new THREE.Group();
						gravestoneRoot.add(child);
						
						if (children.length > 0)
						{
							gravestones.push(gravestoneRoot);
							gravestoneRoot.name = "Gravestone type "+(gravestones.length-1);
						}
						else
						{
							gravestones[i] = gravestoneRoot;
							gravestoneRoot.name = "Gravestone type "+i;
						}
					}
				}
			}
			
			// process all gravestones and make them match in scale and position
			for (var i = 0; i < gravestones.length; i++)
			{				
				var mesh = gravestones[i].children[0];
				
				mesh.position.set(0,0,0);
				
				const maxSize = new THREE.Vector3(1, 1,	1);
				maxSize.multiplyScalar( this.scale );
				this.scaleDown( mesh, maxSize );
				
				// rotation
				mesh.rotation.set(0,0,0);
								
				var gravestoneBounds = new THREE.Box3().setFromObject(mesh);
				var gravestoneSize = new THREE.Vector3();
				gravestoneBounds.getSize(gravestoneSize);
				
				if (gravestoneSize.y < gravestoneSize.x || gravestoneSize.y < gravestoneSize.z)
				{
					if (gravestoneSize.x > gravestoneSize.z)		
						mesh.rotateOnWorldAxis( this.zAxis, Math.PI/2 );			
					else
						mesh.rotateOnWorldAxis( this.xAxis, Math.PI/2 );			
				}
				
					// > If new are added there may be a need to check for upside down ones and rotate them here
								
				gravestoneBounds.setFromObject(mesh);
				gravestoneBounds.getSize(gravestoneSize);
				
				if (gravestoneSize.x < gravestoneSize.z)
					mesh.rotateOnWorldAxis( this.yAxis, -Math.PI/2 );				
				
				// position
				gravestoneBounds.setFromObject(mesh);
				gravestoneBounds.getSize(gravestoneSize);
				
				var xDiff = gravestoneSize.x/2 - gravestoneBounds.max.x;
				var zDiff = gravestoneSize.z/2 - gravestoneBounds.max.z;
				
				mesh.position.x += xDiff;
				mesh.position.z += zDiff;
				mesh.position.y = -gravestoneBounds.min.y;
			}
			
			gravestonesPrepared = true;
			_buildGraves();
		}
		const _onLoadGravestones = onLoadGravestones.bind(this);
		
		
		const onGravestoneLoaded = function ( object ) { 
			gravestones.push( object.scene ); 
			gravestonesLoaded[gravestones.length-1] = true; 
			_onLoadGravestones();
		}
		const _onGravestoneLoaded = onGravestoneLoaded.bind(this);
		
		var modelsToLoad = [
			'models/graves/gravestone1/gravestone1.glb', 
			'models/graves/gravestone2/gravestone2.glb', 
			'models/graves/gravestones3456/gravestones3456.glb'
		];
		
		for (var i = 0; i < modelsToLoad.length; i++)
			gravestonesLoaded.push( false );

			
		for (var i = 0; i < modelsToLoad.length; i++)
		{
			this.loadGLTF(
				modelsToLoad[i], 
				_onGravestoneLoaded
			);	
		}	

		// prep graves and mounds
		var gravesLoaded = {};
		
		const onLoadGraves = function ( )
		{			
			var allLoaded = true;
			for(var key in gravesLoaded) {
				allLoaded = allLoaded && gravesLoaded[key];
			}
		
			if ( !allLoaded )
				return;
						
			gravesPrepared = true;
			_buildGraves();
		}
		const _onLoadGraves = onLoadGraves.bind(this);
		
		gravesLoaded["coffinstone1"] = false;
		gravesLoaded["coffinstone2"] = false;
		gravesLoaded["mound"] = false;
		
		this.loadGLTF(
			'models/graves/coffinstone1/coffinstone1.glb', 
			(function( glb ) { 
				gravesLoaded["coffinstone1"] = true;
				
				var object = (glb.scene.children.length > 1) ? glb.scene : glb.scene.children[0];
				object.name = "Stone Grave type 1";
				
				graves.push( object );
				
				_onLoadGraves();
			}).bind(this)
		);	
		
		this.loadGLTF(
			'models/graves/coffinstone2/coffinstone2.glb', 
			(function( glb ) { 
				gravesLoaded["coffinstone2"] = true;
				
				var object = (glb.scene.children.length > 1) ? glb.scene : glb.scene.children[0];
				object.name = "Stone Grave type 2";

				graves.push( object );
				
				_onLoadGraves();
			}).bind(this)
		);	
		
		this.loadGLTF(
			'models/graves/mound/mound_custom.glb', 
			(function( glb ) { 
				gravesLoaded["mound"] = true;
				
				var object = glb.scene; // scene abstraction is specifically necessary in the mound's case
				object.name = "Mound Grave type 1";
				
				// set transform to match up with other graves
				var mound = object.children[0];
				const maxSize = new THREE.Vector3(2.2,2.2,2.2);
				maxSize.multiplyScalar( this.scale );
				this.scaleDown( mound, maxSize );
				mound.rotateY(-Math.PI/2);
				const moundBounds = new THREE.Box3().setFromObject(mound);
				const moundSize = new THREE.Vector3();
				moundBounds.getSize(moundSize);
				
				graveRoughSize.copy(moundSize);
				
				// Load Textures
				const textureRepeats = [1,1];
				const textureOffset = [0,0];
				const textureWrapping = THREE.RepeatWrapping;
				
				this.makeMaterial(
					function ( mat ) { mat.metalness = 0; },
					'textures/mud/brown_mud_dry_diff_2k.jpg', 
					'textures/mud/brown_mud_dry_nor_gl_2k.jpg', 
					null, // no bump map
					textureRepeats,
					textureWrapping,
					textureOffset,
					mound.material
				);
			
				// mound must be at 0 index for random generation
				if ( graves.length == 0 )
				{
					graves.push( object );
				}
				else
				{
					const temp = graves[0];
					graves[0] = object;
					graves.push( temp );
				}
				
				_onLoadGraves();
			}).bind(this)
		);		
	}	
	
	generateGrave( gravestones, graves )
	{
		/*
		* 10% no grave
		* 19% gravestone quirk (1 - 0.9*0.9)
		* 	> 10% no gravestone
		*	> 10% gravestone knocked over
		*
		* => 72.9% chance for normal grave.
		*/
				
		const randomGrave = new THREE.Group();
		randomGrave.name = "Grave with a gravestone";
	
		var gravestoneClone;
		if (Math.random() > 0.1) // 10% missing gravestone
		{
			const randGravestone = Math.floor(Math.random() * gravestones.length);
			const gravestoneClone = gravestones[randGravestone].clone();
			
			randomGrave.add( gravestoneClone );
						
			if (Math.random() < 0.1) // 10% gravestone knocked over if it exists
			{
				randomGrave.isKnockedOver = true;
				gravestoneClone.rotateX(-Math.PI/2);
			}
			
			// apply variation
			var o = 1;
			var k = 0.4; // 0.8 - 1.2
			gravestoneClone.scale.multiplyScalar( o + ((Math.random() + Math.random())/2 * k) - k/2 ); // trend towards middle
			
			const knockedMulti = (gravestoneClone.isKnockedOver) ? 3 : 1;
			k = Math.PI/8 * knockedMulti; // -PI/16 to PI/16 (excluding multi)
			gravestoneClone.rotateOnWorldAxis( this.yAxis, ((Math.random() + Math.random())/2 * k) - k/2);
			
			var k = 0.2 // -0.1 - 0.1
			gravestoneClone.position.x += ((Math.random() + Math.random())/2 * k) - k/2;
			gravestoneClone.position.z += ((Math.random() + Math.random())/2 * k) - k/2;
		}
		else
		{
			gravestoneClone = false
		}
		
		var graveClone;
		if (Math.random() > 0.1) // 10% missing grave
		{
			const randGrave = (Math.random() < 0.7) ? 0	: 1 + Math.floor(Math.random() * (graves.length-1)); // 70% mound 15% either stone coffin
			graveClone = graves[randGrave].clone();
			randomGrave.add( graveClone );
		
			// positioning
			var graveBounds = new THREE.Box3().setFromObject( graveClone );
			var graveSize = new THREE.Vector3();
			graveBounds.getSize( graveSize );
			const gap = 0.3;
			graveClone.position.z += graveSize.z - graveBounds.max.z + gap * this.scale;
			
			// apply variation
			var o = 1;
			var k = 0.4; // 0.8 - 1.2
			graveClone.scale.multiplyScalar( o + (Math.random() * Math.random() * k) - k/2 );
			
			k = Math.PI/8; // -PI/16 to PI/16 
			graveClone.rotateOnWorldAxis( this.yAxis, ((Math.random() + Math.random())/2 * k) - k/2);
			
			var k = 0.2 // -0.1 - 0.1
			graveClone.position.x += ((Math.random() + Math.random())/2 * k) - k/2;
			graveClone.position.z += ((Math.random() + Math.random())/2 * k) - k/2;
			
			this.walkableObjects.push(graveClone);	
		}
		else
		{
			graveClone = false
		}

		if (this.debug) console.debug("Random grave is generated, consists of: "+((graveClone) ? graveClone.name : "no grave ")+" and "+((gravestoneClone) ? gravestoneClone.name : "no gravestone."));
		return randomGrave;
	}
	
	buildTrees( onBuilt )
	{
		var mainTree;
		var treesLoaded = {};
		var treesBase = [];
		
		const onLoadTrees = function ( )
		{			
			var allLoaded = true;
			for(var key in treesLoaded) {
				allLoaded = allLoaded && treesLoaded[key];
			}
		
			if ( !allLoaded )
				return;
			
			this.trees = new THREE.Group();
			this.trees.name = "Trees";
			
			// big tree, what a great tree, honestly
			mainTree.position.set(-9, 1, -3);
			this.moveToGround(mainTree,[mainTree.position], -0.2);
			mainTree.rotateY(Math.PI/2);
			this.trees.add( mainTree );
			
			// other trees
			this.treeTransforms.forEach( (function ( transform ) {
				const randTreeIndex = Math.floor((Math.random()*treesBase.length));
				const randomTree = treesBase[randTreeIndex].clone();
				
				randomTree.position.copy( transform.pos );
				randomTree.rotateOnWorldAxis( this.xAxis, transform.rot.x );
				randomTree.rotateOnWorldAxis( this.yAxis, transform.rot.y );
				randomTree.rotateOnWorldAxis( this.zAxis, transform.rot.z );
				
				this.moveToGround(randomTree, [randomTree.position], -0.01);
				
				this.trees.add( randomTree );
			}).bind(this));
						
			this.objectsWithCollision.push(this.trees);
			
			this.scene.add( this.trees );
			console.log("SceneBuilder: Trees built.");
			onBuilt();
		}
		const _onLoadTrees = onLoadTrees.bind(this);
		
		treesLoaded["massive tree"] = false;
		treesLoaded["tree1"] = false;
		
		for (var i = 1; i <= 4; i++)
			treesLoaded["tree"+(i+1)] = false;
				
		this.loadGLTF(
			'models/trees/old mossy tree/old_mossy_tree.glb', 
			(function( glb ) { 
				treesLoaded["massive tree"] = true;
				
				var object = glb.scene;
				object.name = "Massive tree (type 1)";
				this.scaleDown( object.children[0], new THREE.Vector3(20,20,20) );
								
				mainTree = object;
								
				_onLoadTrees();
			}).bind(this)
		);	
		
		this.loadGLTF(
			'models/trees/old tree/old_tree.glb', 
			(function( glb ) { 
				treesLoaded["tree1"] = true;
				
				var object = glb.scene;
				object.name = "Tree type 2";
				object.children[0].scale.set(20,20,20);
				this.scaleDown( object.children[0], new THREE.Vector3(10,15,10) );
				
				treesBase.push( object );
								
				_onLoadTrees();
			}).bind(this)
		);
				
		for (var i = 1; i <= 4; i++)
		{
			const index = i;
			this.loadGLTF(
			'models/trees/dead trees/tree'+index+'.glb', 
			(function( glb ) { 
				treesLoaded["tree"+(index+1)] = true;
				
				var object = glb.scene;
				object.name = "Tree type "+(index+2);
				object.scale.set(20,20,20);
				this.scaleDown( object, new THREE.Vector3(10,15,10) );
				
				treesBase.push( object );
			
				_onLoadTrees();
			}).bind(this)
		);
		}
	}
	
	buildLanterns( onBuilt )
	{
		var lanternTemplate;
		
		const onLoadLantern = function ( )
		{			
			this.lanterns = new THREE.Group();
			this.lanterns.name = "Lanterns";
			
			this.lanterns.receiveShadow = false;
			this.lanterns.castShadow = false;
			
			this.lanternTransforms.forEach( (function ( transform ) {			
				const lantern = lanternTemplate.clone();
				lantern.position.copy( transform.pos );
				lantern.rotateOnWorldAxis( this.xAxis, transform.rot.x );
				lantern.rotateOnWorldAxis( this.yAxis, transform.rot.y );
				lantern.rotateOnWorldAxis( this.zAxis, transform.rot.z );
				
				this.moveToGround(lantern, [lantern.position], -0.01);
								
				this.lanterns.add( lantern );
			}).bind(this));
			
			const randIndex = Math.floor(Math.random() * this.lanterns.children.length);
			const noLightLantern = this.lanterns.children[randIndex];
			noLightLantern.children[1].removeFromParent();
			noLightLantern.children[0].children[0].material.emissiveIntensity = 0;
			
			this.objectsWithCollision.push(this.lanterns);
			
			this.scene.add( this.lanterns );
			console.log("SceneBuilder: Lanterns built.");
			onBuilt();
		}
		const _onLoadLantern = onLoadLantern.bind(this);
		
		
		this.loadGLTF(
			'models/lantern/lantern_post.glb', 
			(function( glb ) { 				
				var object = glb.scene;
				object.name = "Lantern";
				
				object.children[0].scale.set(1,1,1);
				this.scaleDown( object.children[0], new THREE.Vector3(1,4,1) );
				
				const bounds = new THREE.Box3().setFromObject(object);
				var size = new THREE.Vector3();
				bounds.getSize( size );
				const lanternLight = new THREE.PointLight( 0xf6e1ae, 1, 12 ); 
				
				lanternLight.name = "Lantern Light";
				object.add( lanternLight );
				
				const offsetY = -0.3 * this.scale;
				lanternLight.position.y += size.y + offsetY;
				
				lanternLight.castShadow = true;
				lanternLight.shadow.bias -= 0.004;
								
				lanternTemplate = object;
								
				_onLoadLantern();
			}).bind(this)
		);
	}
	
	buildClutter( onBuilt )
	{		
		var urnTemplate, rocksTemplate, branchTemplates;
		
		const onLoad = async function ( )
		{			
			if ( !urnTemplate || !rocksTemplate || !branchTemplates )
				return;
		
			this.clutter = new THREE.Group();
			this.clutter.name = "Clutter";
			
			// Urns
			const urns = new THREE.Group();
			urns.name = "Urns";
			
			this.clutter.add(urns);
			
			this.urnTransforms.forEach( (async function ( transform ) {
				if ( Math.random() > 0.50 )
					return;
				
				const urn = urnTemplate.clone();			
			
				urn.position.copy( transform.pos );
				urn.rotateOnWorldAxis( this.xAxis, transform.rot.x );
				urn.rotateOnWorldAxis( this.yAxis, transform.rot.y );
				urn.rotateOnWorldAxis( this.zAxis, transform.rot.z );
				
				const boundsUrn = new THREE.Box3().setFromObject( urn );
				const midPoint = new THREE.Vector3();
				midPoint.lerpVectors(boundsUrn.min, boundsUrn.max, 0.5);
				await this.moveToGround(urn, [boundsUrn.min, boundsUrn.max, midPoint], 0, false);
				urn.position.y += transform.pos.y;
				
				urns.add( urn );
			}).bind(this));
				
			// Rocks
			const rocks = new THREE.Group();
			rocks.name = "Rocks";
			
			this.clutter.add( rocks );
			
			const maxRandRocks = 10;
			var rocksGenerated = 0;
			while (Math.random() < 0.9 && !(rocksGenerated++ >= maxRandRocks)) 
			{
				
				const rock = rocksTemplate.clone();
				rock.name = "Pile of rocks";
				rocks.add( rock );
				
				this.randomiseXZPositionWithinGraveyard( rock );
				rock.rotateOnAxis( this.yAxis, Math.random()*2*Math.PI );
				rock.scale.multiplyScalar( 0.5 + (Math.random() * Math.random() * Math.random() * 1.5) ); // range of 0.5-2.0 with a bias to lower numbers
				
				this.moveToGround( rock, [rock.position], -0.05 );
			}
			if (this.debug) console.debug( "Random rock piles generated: "+rocksGenerated );
			
			// Branches
			while (!this.trees) 
				await new Promise(r => setTimeout(r, 200));
			
			const branches = new THREE.Group();
			branches.name = "Branches";
			
			this.clutter.add( branches );
			
			for (var i = 0; i < this.trees.children.length; i++)
			{
				const tree = this.trees.children[i];
				
				var bigTreeMultiplier = (tree.name.includes("Massive tree")) ? 2 : 1; // times two everything, it is big and awesome
				
				const treeBranches = new THREE.Group();
				treeBranches.name = "Branches around a tree";
				treeBranches.position.copy( tree.position );
				treeBranches.position.y = 0; // branches are to be grounded individually later
				const numBranches = ((Math.random() + Math.random())/2) * (5 * bigTreeMultiplier); // 0-4 branches with tendency towards 2
				for (var j = 0; j < numBranches; j++)
				{
					const randBranchType = Math.floor(Math.random() * branchTemplates.length);
					const randBranch = branchTemplates[randBranchType].clone();
					treeBranches.add( randBranch );
					randBranch.children[0].rotateOnAxis( this.yAxis, Math.random()*2*Math.PI );
					randBranch.children[0].position.x += 1.5 * bigTreeMultiplier + Math.random() * (2*bigTreeMultiplier);
					randBranch.rotateOnAxis( this.yAxis, Math.random()*2*Math.PI );
				}
				if ( treeBranches.children.length > 0 )
					branches.add( treeBranches );
			}
			
			const maxRandBranches = 12;
			var branchesGenerated = 0;
			while (Math.random() < 0.75 && !(branchesGenerated++ >= 12))
			{								
				const randBranchType = Math.floor(Math.random() * branchTemplates.length);
				const randBranch = branchTemplates[randBranchType].clone();
				branches.add( randBranch );
				
				this.randomiseXZPositionWithinGraveyard( randBranch );
				randBranch.rotateOnAxis( this.yAxis, Math.random()*2*Math.PI );
			}
			if (this.debug) console.debug( "Random branches generated: "+branchesGenerated );
			
			const _groundBranches = (function ( b ) {
				if (b.name == "Branches around a tree")
				{
					b.children.forEach( _groundBranches );
					return;
				}
				
				const worldPos = new THREE.Vector3();
				b.children[0].getWorldPosition( worldPos );
				this.moveToGround( b, [worldPos], 0.1 );
			}).bind(this)
			
			branches.children.forEach( _groundBranches );
				
			// Finalise
			this.scene.add( this.clutter );
			console.log("SceneBuilder: Clutter built.");
			onBuilt();
		}
		const _onLoad = onLoad.bind(this);
		
		
		this.loadGLTF(
			'models/clutter/urn/urn.glb', 
			(function( glb ) { 				
				const object = glb.scene;
				const urn = new THREE.Group(); // helps keep the top-level local scale of object 1 for ease of manipulation later
				urn.name = "Urn";
				urn.add( object );
								
				this.scaleDown( object, new THREE.Vector3(0.4,0.4,0.4) );
				
				urnTemplate = urn;
								
				_onLoad();
			}).bind(this)
		);
		
		this.loadGLTF(
			'models/clutter/rocks/rocks.glb', 
			(function( glb ) { 				
				var object = glb.scene;
				object.name = "Rock Pile";
				
				this.scaleDown( object.children[0], new THREE.Vector3(2,2,2) );
				
				rocksTemplate = object;
								
				_onLoad();
			}).bind(this)
		);
		
		this.loadGLTF(
			'models/clutter/branches/dry_branches_medium_01_2k.glb', 
			(function( glb ) { 				
				var object = glb.scene;
				
				branchTemplates = [];
				
				var i = 0;
				while (object.children.length > 0)
				{
					var b = object.children[0];
					b.removeFromParent();
					b.position.set(0,0,0);
					b.scale.multiplyScalar(1.8);
					
					const branch = new THREE.Group(); // scaling wrap
					branch.name = "Branch type "+i;
					branch.add(b);
					
					branchTemplates.push(branch);
					i++;
				};
				
				_onLoad();
			}).bind(this)
		);
	}
	
	buildKey( onBuilt )
	{
		this.loadGLTF(
			'models/key/old_key.glb', 
			(function( glb ) { 				
				const object = glb.scene;
				const key = new THREE.Group();
				key.name = "Key";
				key.add( object );
							
				// slight emission to make it easier (possible) to find
				key.traverse( function ( child ) { 
					if ( child instanceof THREE.Mesh ) 
					{
						child.material.emissive = new THREE.Color(0xb6a473);
						child.material.emissiveIntensity = 0.1;
					}
				});
							
				this.scaleDown( object, new THREE.Vector3(0.4,0.4,0.4) );
				
				const randPosIndex = Math.floor(Math.random()*this.keyTransforms.length);
				const transform = this.keyTransforms[randPosIndex];				

				key.position.copy( transform.pos );
				key.rotateOnWorldAxis( this.xAxis, transform.rot.x );
				key.rotateOnWorldAxis( this.yAxis, transform.rot.y );
				key.rotateOnWorldAxis( this.zAxis, transform.rot.z );
				
				this.moveToGround(key, [key.position], key.position.y+0.02, false);
				
				this.key = key;
				this.scene.add( this.key );
				
				onBuilt();
			}).bind(this)
		);
	}
	
	randomiseXZPositionWithinGraveyard( object, padding = 0.5 )
	{
		const side = this.graveyardSideLength - padding*2;
		object.position.x = side/2 - (Math.random() * side);
		object.position.z = side/2 - (Math.random() * side);
	}
	
	async makeMaterial(onLoadedCallback, diffPath, normalPath, bumpPath, textureRepeats = [1,1], textureWrapping = THREE.RepeatWrapping, textureOffset = [0,0], materialBase = null)
	{
		if ( !onLoadedCallback )
		{
			console.error("SceneBuilder: makeMaterial() - onLoadedCallback is undefined.");
			return;
		}
		
		var  mat, diff, normal, bump;
		
		var diffLoaded = false || !diffPath;
		var normalLoaded = false || !normalPath;
		var bumpLoaded = false || !bumpPath;
		
		var checkLoaded = function() 
		{	
			var allLoaded = 
				diffLoaded &&
				normalLoaded &&
				bumpLoaded
				;
				
			if ( allLoaded )
			{
				onLoadedCallback( mat );
			}
		}
		
		if (diffPath)
		{
			// on load diff map
			var onLoad = function( texture ) { 				
				diff.wrapS = diff.wrapT = textureWrapping;
				diff.repeat.set( textureRepeats[0], textureRepeats[1] );
				diff.offset.set( textureOffset[0], textureOffset[1] );
				
				diffLoaded = true; 
				checkLoaded();
			};
			var _onLoad = onLoad.bind(this);
			
			// load diff map
			diff = this.textureLoader.load(
				diffPath,
				_onLoad
			);
		}
		else if (this.debug)
		{
			console.warn("SceneBuilder: no paths supplied to makeMaterial()");
		}		
		
		if (normalPath)
		{
			// process normal map
			var onLoad = function( texture ) {
				normal.wrapS = normal.wrapT = textureWrapping;
				normal.repeat.set( textureRepeats[0], textureRepeats[1] );
				normal.offset.set( textureOffset[0], textureOffset[1] );
				
				normalLoaded = true; 
				checkLoaded();
			};
			var _onLoad = onLoad.bind(this);
			
			// load normal map
			normal = this.textureLoader.load(
				normalPath,
				_onLoad
			);
		}
				
		if (bumpPath)
		{
			// process bump map
			var onLoad = function( texture ) {
				bump.wrapS = bump.wrapT = textureWrapping;
				bump.repeat.set( textureRepeats[0], textureRepeats[1] );
				bump.offset.set( textureOffset[0], textureOffset[1] );
				
				bumpLoaded = true; 
				checkLoaded();
			};
			var _onLoad = onLoad.bind(this);
			
			// load bump map
			bump = this.textureLoader.load(
				bumpPath,
				_onLoad
			);
		}
		
		// make the material
		if (materialBase)
		{
			mat = materialBase;
			mat.map = diff ?? null;
			mat.normalMap = normal ?? null;
			mat.bumpMap = bump ?? null;
		}
		else
		{		
			mat = new THREE.MeshStandardMaterial( {
				map: diff ?? null,
				normalMap: normal ?? null,
				bumpMap: bump ?? null
			});
		}
		
		checkLoaded();
	}
	
	loadOBJ(objPath, onLoadedCallback)
	{
		if (!objPath)
		{
			console.error("SceneBuilder: loadOBJ() - No obj path provided.");
			return;
		}
		
		// on obj load error
		var onError = function( error ) { 
			console.warn( "SceneBuilder: loadOBJ() - failed to load .obj:" ); 
			console.error( error ); 
		}
		var _onError = onError.bind(this);
		
		// load obj
		this.objLoader.load(
			objPath, 				// path to obj
			onLoadedCallback, 		// callback on load
			function(){}, 			// callback in progress
			_onError, 				// callback on error
		);
	}
	
	loadGLTF(gltfPath, onLoadedCallback)
	{
		if (!gltfPath)
		{
			console.error("SceneBuilder: loadGLTF() - No gltf path provided.");
			return;
		}
		
		// on gltf load error
		var onError = function( error ) { 
			console.warn( "SceneBuilder: loadGLTF() - failed to load .gltf:" ); 
			console.error( error ); 
		}
		var _onError = onError.bind(this);
		
		// load gltf
		this.gltfLoader.load(
			gltfPath, 				// path to gltf
			onLoadedCallback, 		// callback on load
			function(){}, 			// callback in progress
			_onError, 				// callback on error
		);
	}
	
	async moveToGround(object, testPoints, offset = 0, onlyGround = true) 
	{	
		// needs the ground to be built and groundMaxHeight to be set, if it isn't yet, wait
		while (!this.groundBuilt) 
			await new Promise(r => setTimeout(r, 200));
	
		var maxDist = -1;
		const highestPoint = (onlyGround) ? this.groundMaxHeight + 0.0001 : 50; // add a tiny offset to put it above the highest vertex
		
		for (var i = 0; i < testPoints.length; i++)
		{
			testPoints[i].y = highestPoint;
			var dist = await this.getDistanceToGround(testPoints[i], onlyGround);
			maxDist = Math.max(maxDist, dist);
		}
		
		if (maxDist == -1)
		{
			this.failedToGroundObjects.push( {object: object, points: testPoints, offset: offset} );
			
			if (this.debug)	console.debug("SceneBuilder: moveToGround() - grounding failed on "+object.name);
			
			maxDist = 0;
		}
		
		const yBefore = object.position.y;
		const parentY = (object.parent) ? object.parent.position.y : 0;
		const lowestY = highestPoint - parentY - maxDist;
		
		if (this.debug) console.debug("SceneBuilder: moveToGround()\n> object name = \""+object.name+"\"\n> maxDist = "+maxDist+"\n> object.position.y = "+yBefore+"\n> new y = "+(lowestY + offset));
		
		object.position.y = lowestY + offset;
	}
	
	retryMoveToGroundOnFailedObjects()
	{
		while (this.failedToGroundObjects.length > 0)
		{
			const fo = this.failedToGroundObjects.pop();
			this.moveToGround(fo.object, fo.points, fo.offset); 
		}
	}
	
	async getDistanceToGround(fromPoint, onlyGround = true)
	{
		// needs the ground and objects to be built, if it isn't yet, wait
		while (!this.groundBuilt && (onlyGround || this.objectsBuilt)) 
			await new Promise(r => setTimeout(r, 200));
		
		const downVector = new THREE.Vector3(0,-1,0);
		const raycaster = new THREE.Raycaster(fromPoint,downVector);
		
		var intersections = [];
		
		if ( onlyGround )
		{
			raycaster.intersectObject(this.ground, false, intersections);
		}
		else
		{
			const objectsToIntersect = [ this.ground ];
			if (this.cobbledPath) objectsToIntersect.push( this.cobbledPath );
			if (this.fence) objectsToIntersect.push( this.fence );
			if (this.mausoleum) objectsToIntersect.push( this.mausoleum );
			if (this.graves) objectsToIntersect.push( this.graves );
			raycaster.intersectObjects(objectsToIntersect, true, intersections);
		}
		
		this.placeDebugMarker(fromPoint);
		
		if (!intersections[0])
		{
			return -1;
		}
		
		return intersections[0].distance;
	}
	
	scaleDown ( object, maxSize )
	{
		var bounds = new THREE.Box3().setFromObject( object );
		var size = new THREE.Vector3();
		bounds.getSize(size);
		
		var scaleDown = 1;
		scaleDown = Math.max( scaleDown, size.x / maxSize.x );
		scaleDown = Math.max( scaleDown, size.y / maxSize.y );
		scaleDown = Math.max( scaleDown, size.z / maxSize.z );
		
		object.scale.multiplyScalar( 1/scaleDown );
	}
	
	placeDebugMarker(position, colour = null)
	{
		if(!this.debug)
			return;
		
		if(!this.markerGroup)
		{
			this.markerGroup = new THREE.Group();
			this.markerGroup.name = "DebugMarkers";
			this.scene.add( this.markerGroup );
		}
		
		colour = colour ?? Math.random()*parseInt("FFFFFF", 16);
		
		const marker = new THREE.Mesh(
			new THREE.DodecahedronGeometry(0.1*this.scale),
			new THREE.MeshBasicMaterial({color: colour, transparent: true, opacity: 0.7})
		);
		marker.position.copy(position);
		this.markerGroup.add(marker);
	}
	
	updateSceneBuilt()
	{
		const allBuilt =
			this.miscBuilt && 
			this.groundBuilt &&
			this.objectsBuilt;
			
		if ( allBuilt )
		{
			this.retryMoveToGroundOnFailedObjects();
			this.configureShadows();
			
			this.sceneBuilt = allBuilt;
			console.log("SceneBuilder: Scene built.");
		}
	}
		
	update( deltaTime )
	{
		this.clouds.children.forEach( (function ( cloud ) {
			cloud.rotateOnWorldAxis( this.yAxis, 0.0001 ); 
		}).bind(this));
		
		
		if (this.lightning.timeOut > 0 && !this.toggleInfiniteLightning)
		{
			this.lightning.timeOut -= deltaTime;
			this.lightning.visible = false; // needed for when infinite lighning is toggled off
		}
		else
		{
			this.updateLightning( deltaTime );
		}
		
		this.updateRain();
	}
	
	updateLightning( deltaTime )
	{
		if (this.disableLightning)
		{
			this.lightning.visible = false;
			return;
		}
		
		var o, k;
		
		if (!this.lightning.visible)
		{
			// rand location
			o = this.skyBounds.min.x;
			k = this.skyBounds.max.x - this.skyBounds.min.x;
			this.lightning.position.x = o + (Math.random() * k);
			
			o = this.skyBounds.min.z;
			k = this.skyBounds.max.z - this.skyBounds.min.z;
			this.lightning.position.z = o + (Math.random() * k);
			
			o = this.skyBounds.min.y;
			k = this.skyBounds.max.y - this.skyBounds.min.y;
			this.lightning.position.y = o + (Math.random() * k);
			
			this.lightning.visible = true
			
			o = this.lightningDurationRange.min;
			k = this.lightningDurationRange.max - this.lightningDurationRange.min;
			this.lightning.duration = o + Math.pow(Math.random(),3) * k; // lower numbers more likely
		}
		else
		{
			this.lightning.duration -= (this.toggleInfiniteLightning) ? 0 : deltaTime;
			
			// move the light slightly as lightning travels across the sky
			o = -this.lightningMaxTravelDistance;
			k = this.lightningMaxTravelDistance*2;
			const newX = this.lightning.position.x + o + (Math.random() * k);
			const newZ = this.lightning.position.z + o + (Math.random() * k);
			const newY = this.lightning.position.y + o + (Math.random() * k);
			

			if ((newX > this.skyBounds.min.x && newX < this.skyBounds.max.x))
				this.lightning.position.x =  newX;
			if ((newZ > this.skyBounds.min.z && newX < this.skyBounds.max.z))
				this.lightning.position.z = newZ;
			if ((newY > this.skyBounds.min.y && newY < this.skyBounds.max.y))
				this.lightning.position.y = newY;
		}
		
		// random power to simulate the crackling of lightning
		o = this.lightningPowerRange.min;
		k = this.lightningPowerRange.max - this.lightningPowerRange.min;
		this.lightning.power = o + (Math.random() + Math.random())/2 * k;
				
		if (this.lightning.duration <= 0)
		{
			this.lightning.visible = false;
			
			o = this.lightningTimeOutRange.min;
			k = this.lightningTimeOutRange.max - this.lightningTimeOutRange.min;
			this.lightning.timeOut = o + Math.pow(Math.random(),3) * k; // 2 - 30 seconds, tending towards lower values
			if (this.debug) console.debug("Putting Lightning on timeout for "+this.lightning.timeOut+" seconds.");
		}
	}
	
	updateRain()
	{
		if (!this.miscBuilt || !this.rain.visible)
			return;
		
		const posAttribute = this.rain.geometry.getAttribute("position");
		const rainDrops = posAttribute.array;
		for (var i = 0; i < rainDrops.length; i+=3)
		{
			const x = i, y = i+1, z = i+2;
			rainDrops[x] += this.rainVelocity.x;
			rainDrops[y] += this.rainVelocity.y;
			rainDrops[z] += this.rainVelocity.z;
			
			if ( rainDrops[y] < this.minRainHeight )
			{
				rainDrops[x] = (Math.random() * (Math.abs(this.rainArea.min.x) + this.rainArea.max.x)) + this.rainArea.min.x;
				rainDrops[z] = (Math.random() * (Math.abs(this.rainArea.min.y) + this.rainArea.max.y)) + this.rainArea.min.y;
				rainDrops[y] =this.maxRainHeight;
			}
		}
		posAttribute.needsUpdate = true;
	}
	
	changeAmbientLight()
	{
		this.lightAmbient.color = ( this.lightAmbient.color == this.lightAmbient.debugColour )
			? this.lightAmbient.baseColour
			: this.lightAmbient.debugColour;
	}
	
	toggleWireframeScene()
	{
		var wire;
		this.scene.traverse( function ( child ) {
			if ( child instanceof THREE.Mesh ) 
			{ 
				if (wire === undefined)
					wire = !child.material.wireframe;
		
				child.material.wireframe = wire;
			}
		});
	}
	
	makeGravePositions()
	{
		this.graveTransforms = []
		
		const _pushTransform = (function ( posX, posY, posZ, rotX, rotY, rotZ ) {		
			var transform = {
				pos: new THREE.Vector3( posX, posY, posZ ),
				rot: new THREE.Vector3( rotX, rotY, rotZ )
			};				
			this.graveTransforms.push( transform );
		}).bind(this);

		// note that pos.y is applied as offset after objects are moved to the ground
		// uses deg angles for ease of setting up, is converted at the end
		
		// second row left of mausoleun
		{
			_pushTransform( 
				-12, 0, -12,
				0, 0, 0
			);
			
			_pushTransform( 
				-10, 0, -12,
				0, 0, 0
			);
			
			_pushTransform( 
				-8, 0, -12,
				0, 0, 0
			);
			
			_pushTransform( 
				-6, 0, -12,
				0, 0, 0
			);
			
			_pushTransform( 
				-4, 0, -12,
				0, 0, 0
			);
		}
		
		// first row left of mausoleum
		{
			_pushTransform( 
				-12, 0, -8,
				0, 0, 0
			);
			
			_pushTransform( 
				-10, 0, -8,
				0, 0, 0
			);
			
			_pushTransform( 
				-8, 0, -8,
				0, 0, 0
			);
			
			_pushTransform( 
				-6, 0, -8,
				0, 0, 0
			);
			
			_pushTransform( 
				-4, 0, -8,
				0, 0, 0
			);
		}
		
		// second row left of start (gate)
		{
			_pushTransform( 
				-12, 0, 12,
				0, 90, 0
			);
			
			_pushTransform( 
				-12, 0, 10,
				0, 90, 0
			);
			
			_pushTransform( 
				-12, 0, 8,
				0, 90, 0
			);
			
			_pushTransform( 
				-12, 0, 4,
				0, 90, 0
			);
			
			_pushTransform( 
				-12, 0, 2,
				0, 90, 0
			);
			
			_pushTransform( 
				-12, 0, 0,
				0, 90, 0
			);
		}
		
		// first row left of start (gate)
		{
			_pushTransform( 
				-8, 0, 12,
				0, 90, 0
			);
			
			_pushTransform( 
				-8, 0, 10,
				0, 90, 0
			);
			
			_pushTransform( 
				-8, 0, 8,
				0, 90, 0
			);
			
			_pushTransform( 
				-8, 0, 4,
				0, 90, 0
			);
			
			_pushTransform( 
				-8, 0, 2,
				0, 90, 0
			);
			
			_pushTransform( 
				-8, 0, 0,
				0, 90, 0
			);
		}
		
		// back row right of mausoleun
		{
			_pushTransform( 
				12, 0, -12,
				0, 0, 0
			);
			
			_pushTransform( 
				10, 0, -12,
				0, 0, 0
			);
			
			_pushTransform( 
				8, 0, -12,
				0, 0, 0
			);
			
			_pushTransform( 
				6, 0, -12,
				0, 0, 0
			);
			
			_pushTransform( 
				4, 0, -12,
				0, 0, 0
			);
		}
		
		// back-1 row left of mausoleum
		{
			_pushTransform( 
				12, 0, -8,
				0, 0, 0
			);
			
			_pushTransform( 
				10, 0, -8,
				0, 0, 0
			);
			
			_pushTransform( 
				8, 0, -8,
				0, 0, 0
			);
			
			_pushTransform( 
				6, 0, -8,
				0, 0, 0
			);
			
			_pushTransform( 
				4, 0, -8,
				0, 0, 0
			);
		}
		
		// back-2 row left of mausoleum
		{
			_pushTransform( 
				12, 0, -3,
				0, 0, 0
			);
			
			_pushTransform( 
				10, 0, -3,
				0, 0, 0
			);
			
			_pushTransform( 
				8, 0, -3,
				0, 0, 0
			);
			
			_pushTransform( 
				6, 0, -3,
				0, 0, 0
			);
			
			_pushTransform( 
				4, 0, -3,
				0, 0, 0
			);
		}
		
		// back-3 row left of mausoleum
		{
			_pushTransform( 
				12, 0, 1,
				0, 0, 0
			);
			
			_pushTransform( 
				10, 0, 1,
				0, 0, 0
			);
			
			_pushTransform( 
				8, 0, 1,
				0, 0, 0
			);
			
			_pushTransform( 
				6, 0, 1,
				0, 0, 0
			);
			
			_pushTransform( 
				4, 0, 1,
				0, 0, 0
			);
		}
		
		// back row right of start (gate)
		{
			_pushTransform( 
				12, 0, 12,
				0, 180, 0
			);
			
			_pushTransform( 
				10, 0, 12,
				0, 180, 0
			);
			
			_pushTransform( 
				8, 0, 12,
				0, 180, 0
			);
			
			_pushTransform( 
				6, 0, 12,
				0, 180, 0
			);
			
			_pushTransform( 
				4, 0, 12,
				0, 180, 0
			);
		}
		
		// back-1 row right of start (gate)
		{
			_pushTransform( 
				12, 0, 8,
				0, 180, 0
			);
			
			_pushTransform( 
				10, 0, 8,
				0, 180, 0
			);
			
			_pushTransform( 
				8, 0, 8,
				0, 180, 0
			);
			
			_pushTransform( 
				6, 0, 8,
				0, 180, 0
			);
			
			_pushTransform( 
				4, 0, 8,
				0, 180, 0
			);
		}
			
		// deg to rad
		this.graveTransforms.forEach( function( t ) {
			t.rot.multiplyScalar(Math.PI / 180);
		});
	}
	
	makeTreePositions()
	{
		this.treeTransforms = [];
		
		const _pushTransform = (function ( posX, posY, posZ, rotX, rotY, rotZ ) {		
			var transform = {
				pos: new THREE.Vector3( posX, posY, posZ ),
				rot: new THREE.Vector3( rotX, rotY, rotZ )
			};				
			this.treeTransforms.push( transform );
		}).bind(this);

		// note that pos.y is applied as offset after objects are moved to the ground
		// uses deg angles for ease of setting up, is converted at the end
		
		// entry tree 1
		_pushTransform( 
			2, 0, 11,
			0, 90, 0
		);
			
		// entry tree 2
		_pushTransform( 
			1.5, 0, 7.5,
			0, 0, 0
		);
			
		// replace some graves with trees
		const gravesReplaced = 3 + Math.floor(((Math.random() + Math.random()) / 2) * 3); 
		for (var i = 0; i < gravesReplaced; i++)
		{
			const randIndex = Math.floor(Math.random()*this.graveTransforms.length);
			
			this.treeTransforms.push(this.graveTransforms[randIndex]);
			
			this.treeTransforms[this.treeTransforms.length-1].rot.y = Math.random() * 360;
			
			if (this.graveTransforms.length > 1) 
				this.graveTransforms[randIndex] = this.graveTransforms.pop( );
			else
				this.graveTransforms.pop();
		}		
	}
	
	makeLanternPositions()
	{
		this.lanternTransforms = [];
		
		const _pushTransform = (function ( posX, posY, posZ, rotX, rotY, rotZ ) {		
			var transform = {
				pos: new THREE.Vector3( posX, posY, posZ ),
				rot: new THREE.Vector3( rotX, rotY, rotZ )
			};				
			this.lanternTransforms.push( transform );
		}).bind(this);

		// note that pos.y is applied as offset after objects are moved to the ground
		// uses deg angles for ease of setting up, is converted at the end
		
		// end of right path 1
		_pushTransform( 
			11.8, 0, 4.5,
			0, (Math.random() * 360), 0
		);
		
		// end of right path 2
		_pushTransform( 
			12.1, 0, -4.5,
			0, (Math.random() * 360), 0
		);
		
		// end of left path 1
		_pushTransform( 
			-11.9, 0, 6,
			0, (Math.random() * 360), 0
		);
		
		// end of left path 2 | behind big tree
		_pushTransform( 
			-12, 0, -3,
			0, (Math.random() * 360), 0
		);
		
		// in front of mausoleum
		_pushTransform( 
			-3, 0, -3.5,
			0, (Math.random() * 360), 0
		);
	}
	
	makeUrnPositions()
	{
		this.urnTransforms = [];
		
		const _pushTransform = (function ( posX, posY, posZ, rotX, rotY, rotZ ) {		
			var transform = {
				pos: new THREE.Vector3( posX, posY, posZ ),
				rot: new THREE.Vector3( rotX, rotY, rotZ )
			};				
			this.urnTransforms.push( transform );
		}).bind(this);

		// note that pos.y is applied as offset after objects are moved to the ground
		// uses deg angles for ease of setting up, is converted at the end
		
		// on front of mausoleum
		_pushTransform( 
			2.3, 0, -5,
			0, (Math.random() * 360), 0
		);
		
		// fallen off left of mausoleum
		_pushTransform( 
			-3.3, 0.01, -5.15,
			-10, 160, 180
		);
		
		// by left lantern 
		_pushTransform( 
			-11.7, 0, 6.3,
			0, (Math.random() * 360), 0
		);
		
		// on a south-east pillar
		_pushTransform( 
			9, 0, 13.5,
			0, (Math.random() * 360), 0
		);
		
		// behind a grave third row on the right
		_pushTransform( 
			6, 0, 0.7,
			0, (Math.random() * 360), 0
		);
		
		// by the second tree by the entrance
		_pushTransform( 
			1, 0, 8.2,
			0, (Math.random() * 360), 0
		);
		
		// behind the fence behind the lantern behind the big tree
		_pushTransform( 
			-14, 0, -1.7,
			0, (Math.random() * 360), 0
		);
	}
	
	makeKeyPositions()
	{
		this.keyTransforms = [];
		
		const _pushTransform = (function ( posX, posY, posZ, rotX, rotY, rotZ ) {		
			var transform = {
				pos: new THREE.Vector3( posX, posY, posZ ),
				rot: new THREE.Vector3( rotX, rotY, rotZ )
			};				
			this.keyTransforms.push( transform );
		}).bind(this);

		// note that pos.y is applied as offset after objects are moved to the ground
		// uses deg angles for ease of setting up, is converted at the end
				
		if ( Math.random > 0.5 )
		{		
			// on the fence, south wall, west of gate
			_pushTransform( 
				-11, 0, 13.5,
				0, 0, 0
			);		
		}
		else
		{
			// behind fence, south wall, west of gate (barely visible, very sneaky)
			_pushTransform( 
				-11, 0, 14,
				0, 100, 0
			);
		}
		
		// by a gravestone, second row right/east of gate
		_pushTransform( 
			8, 0, 7.75,
			0, 186, 0
		);
		
		// right side of mausoleum
		_pushTransform( 
			2.25, 0, -8.35,
			0, (Math.random() * 360), 0
		);
		
		// behind further right lantern
		_pushTransform( 
			12.75, 0, -4.45,
			0, (Math.random() * 360), 0
		);
		
		// under big tree
		_pushTransform( 
			-8.7, 0, -4.4,
			0, (Math.random() * 360), 0
		);
	}
}
