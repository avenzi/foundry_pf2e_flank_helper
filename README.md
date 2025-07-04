## Foundry VTT PF2e Flanking Helper
Simple visualizer for possible flanking positions with allies in Pathfinder Second Edition.

## Installation
Manifest URL: https://github.com/avenzi/foundry_pf2e_flank_helper/raw/master/module.json

## Usage
- Adds a toggle button to each token's HUD to enable/disable the flanking visualizer (only visible to you).
- Visualizer will show all possible valid placements that will flank an enemy, accounting for token size and reach.
- When enabled, flanked enemies are highlighted.
- Walls will disrupt flanking.


![](assets/flank_example_1.png)

In this example, we see the possible flanking positions of the medium-sized ally to the right, who has a 10ft reach. The enemy in the middle is currently flanked.

![](assets/flank_example_2.png)

From the large-sized ally's perspective (who also has a 10ft reach), we see the possible flanking positions on the left, with each dot representing where you would place the center of the token.

## TODO
- Should some wall types not block flanking?
- Need to figure out how to trigger updates on things like applying/deleting effects (the associated hooks don't seem to work)
- Trigger update on token changing alliance
- The update on clicking action toggles (like Lunge) only updates client-side, other users won't get the update.

