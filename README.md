## Foundry VTT PF2e Flanking Helper
Simple visualizer for possible flanking positions with allies in Pathfinder Second Edition.

## Installation
Manifest URL: https://github.com/avenzi/foundry_pf2e_flank_helper/raw/master/module.json

## Usage
- Adds a toggle button to each token's HUD to enable/disable the flanking visualizer (only visible to you).
- Visualizer will show all possible valid placements that will flank an enemy.
- When enabled, flanked enemies are highlighted.
- Accounts for token size, reach, and valid placement.
- Walls will disrupt flanking.


![](assets/flank_example_1.png)

In this example, we see the possible flanking positions of the medium-sized ally to the right, who has a 10ft reach. The enemy in the middle is currently flanked.

![](assets/flank_example_2.png)

From the large-sized ally's perspective (who also has a 10ft reach), we see the possible flanking positions on the left, with each dot representing where you would place the center of the token.

## TODO
- Some edge types should not block flanking?
- Need to figure out how to trigger update on things like applying/deleting effects (the associated hooks don't seem to work)
- 

