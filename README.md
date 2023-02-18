# Graveyard-Escape
This is a procedurally generated 3D scene made in THREE.js depicting a graveyard on a stormy night. Created for a Computer Graphics university module at the end of 2022.

The application produced is the scene of a graveyard at a dark night. A few lanterns illuminate most of the area, with lightning revealing the rest. Trees and a variety of graves create environment surrounding a mausoleum, with various items covering the ground. Most of the scene’s features are procedurally generated. A minigame is included to find a key and open the gate. The scene is intended to be viewed from the perspective of an individual within the graveyard.

The website is deployed and available to view [here](https://mkocvara.github.io/Graveyard-Escape/).

## Individual Features
*	**Ground.** A Perlin noise algorithm (third party noise library used under valid licence, full credit in source files) is applied to the vertices of a ground plane. Two passes are done, first to generate the slopes of the ground, second to generate small variation in height. Due to the randomised ground, all objects that rest on it must be placed via the moveToGround() function, which calculates their height based on the ground beneath them.
*	**Path.** A box geometry forms a snaking cobbled path from the gate to the mausoleum. Its vertices have been displaced using the position attribute and formed to a sigmoid shape via a sigmoid function.
*	**Fence.** The fence is mostly static, except for the ground placement on the uneven ground.
*	**Mausoleum.** The mausoleum is static except for grounding.
*	**Graves.** An array of transforms informs their location; for each one, a combination of a grave and a gravestone is selected from a pool and random transform variation is applied to them.
*	**Trees.** The large tree by the mausoleum is static. The two trees by the entrance are always present but have random shape. Additional varied trees may replace some graves, at random.
*	**Lanterns.** The lanterns are all places in pre-set locations. One is randomly selected to be unlit.
*	**Clutter.** Urns appear in predetermined locations, but each location has a random chance of the urn appearing. A random number of rocks and branches are placed entirely randomly within the graveyard. Additional branches are generated to be beneath every tree.
*	**Clouds.** Clouds in the sky are also randomly generated. Their positions and formation are random. The clouds are very dark and are more of a dark looming shape, but the lightning lights them up when it strikes.
*	**Key.** A single gate key appears in one randomly selected location off a predetermined list.
*	**Rain.** Rain particles have random locations. As they are animated to fall, when they reach out of bounds, they reappear in a random position in the sky.
*	**Lightning.** The position of the lightning light is randomly selected within the sky. Each stroke of lightning has a new location to simulate a thunderstorm of many lightning strikes all around. 
*	**Controls, Camera.** Two types of controls are implemented: walking is the default mode, where the camera is bound to the ground. The second, meant for debug or further exploring the scene, is flying. A rudimentary collision system is implemented for the walking controls. In walking mode, clicking locks the mouse pointer and allows for looking around. Esc frees the cursor.
*	**Minigame.** The user can locate a key located somewhere within the graveyard and pick it up by pressing E when in its proximity. Then, pressing E with the key while in proximity of the gate will “win” the game.
*	**Controls Hint.** A hint is visible on loading the program showing the controls, as well as keys that allow the user to toggle some elements of the scene on and on. They are useful for further exploring the scene. The hint can be hidden
*	**Known Limitations.** Due to a lot of moving parts in generating the environment, the application takes long to load, sometimes several minutes. On rare occasions, some elements do not generate properly. If this happens, please refresh the page. The collision system uses raycasting on complex geometry, which unfortunately isn’t very fast and may slow the application down. Due to this it is disabled by default and can be enabled via the above-described debug options.
*	**3D Models.** The program uses a high number of 3D models taken from the internet. All are properly licenced and credited within their respective folders.
