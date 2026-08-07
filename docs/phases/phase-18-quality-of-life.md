# Phase 18 — Quality of Life 1

**Status:** Not started  
**Outcome:** Make improvements beyond the original game

## Checklist

- [ ] In the overworld, rather than doing screen transitions, where hitting the edge of the screen moves you to the next screen, we should be able to smoothly walk between screens with the view centered on link at all times except at the extreme edges of the map. So essentially, if Link is moving left, the camera should move with him and load tiles and enemies from the next screen as needed. As soon as an enemy comes into view, it can also follow Link beyond the bounds of the area that it was previously within, so long as it remains on screen. 
- [ ] Transitions to dungeons, caves, and so on, will be the only actual transitions in the game rather than smooth scrolls as above. 
- [ ] Same as above, but for dungeons. In dungeons, if you have not yet visited a room, you should not see the contents of that room until it becomes visited. Once a room is visited, it should be visible and the player should be able to see the contents of the room. Enemies will not appear and become active until the room is visited, and will not become inactive until they fully go off screen. Revisiting a room that previously went completely off screen should regenerate the enemies as if the room was being visited in the normal mode. 
- [ ] Link's sword should swing on an arc rather than in a straight line, similar to newer 2D Zelda games such as Link's Awakening and A Link to the Past. 

## Done when

All of these items are implemented.

## Notes

_(Working notes go here as we execute this phase.)_

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| | | |

## Open questions

- 
