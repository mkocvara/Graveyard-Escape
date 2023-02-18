export class GameController
{
	constructor(key, gate, camera)
	{		
		this.key = key;
		this.gate = gate;
		this.player = camera;
		
		this.interactDistance = 2;
		
		/* Possible states:
		* > searching  - start of the game, player is searching for the key
		* > keyFound   - player found and picked up the key, now must open the gate
		* > gateOpened - key was used on the gate, the game ends, fade to white
		*/
		this.gameStates = {
			searching: 0,
			keyFound: 1,
			gateOpened: 2
		}
		this.state = this.gameStates.searching;		
		this.hasGameFinished = () => this.state == this.gameStates.gateOpened;
		
		this.keyDown = function ( event ) {
			switch ( event.code ) {
				case 'KeyE':
					if (this.state == this.gameStates.searching)
						this.tryPickUpKey()
					else if (this.state == this.gameStates.keyFound)
						this.tryOpenGate()
					break;
			}
		}
		const _keyDown = this.keyDown.bind(this);
		window.addEventListener('keydown', _keyDown);
	}
	
	tryPickUpKey()
	{
		console.log("Trying to pick up key.");
		
		if (this.player.position.distanceTo(this.key.position) <= this.interactDistance)
		{
			this.key.visible = false;
			this.state = this.gameStates.keyFound;
			
			document.getElementById("key").classList.toggle("hidden");
			
			console.log("Found a key!");
		}	
		else
		{
			console.log("Key not found.");
		}
	}
	
	tryOpenGate()
	{
		console.debug("Trying to open the gate.");
		
		if (this.player.position.distanceTo(this.gate.position) <= this.interactDistance)
		{
			this.state = this.gameStates.gateOpened;
			document.getElementById("key").classList.toggle("hidden");
			console.log("Gate opened.");
		}	
		else
		{
			console.log("Not close enough to the gate.");
		}
		
	}
}