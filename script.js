// IMPORTS ---------------------
import { FirstPersonCamera } from "./camera_controls.js";
import { SceneBuilder } from "./scene_builder.js";
import { GameController } from "./game_controller.js";
//------------------------------

// CONSTANTS -------------------
const DEBUG_CAMERA = 0;
const DEBUG_SCENE_BUILDER = 0;
const DISABLE_GRID = 1;
const ENABLE_FLY = 0;
const WORLD_SCALE = 1; // isn't properly implemented, but it's not important
// -----------------------------

// INITIALISE ------------------
var loading = true;

// Setup and Renderer
var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight); // Size of the 2D projection
document.body.appendChild(renderer.domElement); // Connecting to the canvas
renderer.shadowMap.enabled = true;

// Clock is needed for delta time
var clock = new THREE.Clock(true);

// Build Scene
var sceneBuilder = new SceneBuilder(WORLD_SCALE,DEBUG_SCENE_BUILDER);
sceneBuilder.buildAll();

// XZ Helper Grid (Y is up!)
if(!DISABLE_GRID)
{
    const gridHelper = new THREE.GridHelper( 200, 200 );
    sceneBuilder.scene.add( gridHelper );
}

// Initialise Camera
var firstPersonCamera = new FirstPersonCamera(renderer, sceneBuilder, DEBUG_CAMERA);
firstPersonCamera.fly = ENABLE_FLY;

// Declare Game Controller Variable
var gameController;
// -----------------------------

// ANIMATE ---------------------
var iFrame = 0;

function animate()
{       
	requestAnimationFrame(animate);
	const deltaTime = clock.getDelta();
	
	if (sceneBuilder.sceneBuilt)
	{
		if (loading) // first frame of sceneBuilt == true
		{
			renderer.compile( sceneBuilder.scene, firstPersonCamera.camera );			
			firstPersonCamera.moveToStart();
			gameController = new GameController( sceneBuilder.key, sceneBuilder.gate, firstPersonCamera.camera );
			
			document.getElementById("loading-screen").remove();
			loading = false;
		}
		
		if (gameController.hasGameFinished())
		{
			
			document.getElementById("game-finished-screen").classList.add("fade-in");
			console.log("Game finished; refresh to play again.");
			return;
		}
		
		// Tick camera controls & scene builder
		firstPersonCamera.update( deltaTime );
		sceneBuilder.update( deltaTime ); 
	}   
	
	iFrame++;
	renderer.render(sceneBuilder.scene, firstPersonCamera.camera);
}
animate(); 
// -----------------------------

